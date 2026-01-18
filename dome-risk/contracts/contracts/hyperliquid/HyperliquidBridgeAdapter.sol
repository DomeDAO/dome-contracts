// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IHyperliquidBridgeAdapter } from "./interfaces/IHyperliquidBridgeAdapter.sol";
import { IHyperliquidCoreWriter } from "./interfaces/IHyperliquidCoreWriter.sol";

/// @notice Interface for Hyperliquid's CoreDepositWallet to bridge USDC from HyperEVM to HyperCore
interface ICoreDepositWallet {
    /// @param amount Amount of USDC to deposit (6 decimals)
    /// @param destination 0 for Perps balance, type(uint32).max for Spot balance
    function deposit(uint256 amount, uint32 destination) external;
}

/// @notice Struct returned by the Vault Equity Precompile
struct UserVaultEquity {
    uint64 equity;              // Current value in USD (6 decimals)
    uint64 lockedUntilTimestamp; // Lock period end timestamp
}

/// @notice Sends Hyperliquid vault transfer actions through CoreWriter.
/// Bridges USDC from HyperEVM to HyperCore and tracks real vault equity via precompile.
contract HyperliquidBridgeAdapter is IHyperliquidBridgeAdapter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public immutable hyperVault;
    IHyperliquidCoreWriter public immutable coreWriter;
    ICoreDepositWallet public immutable coreDepositWallet;

    /// @notice Vault Equity Precompile address on HyperEVM
    address public constant VAULT_EQUITY_PRECOMPILE = 0x0000000000000000000000000000000000000802;

    uint8 private constant ACTION_VERSION = 0x01;
    uint24 private constant VAULT_TRANSFER_ACTION_ID = 0x000002;
    uint32 private constant DESTINATION_PERPS = 0;

    mapping(address => bool) public authorizedStrategy;
    
    /// @notice Tracks shares per strategy (represents proportional ownership)
    mapping(address => uint256) private strategyShares;
    
    /// @notice Total shares issued across all strategies
    uint256 public totalShares;
    
    /// @notice Fallback tracking of total deposited assets (used when precompile unavailable)
    uint256 private totalDepositedFallback;

    error ZeroAddress();
    error ZeroAssets();
    error NotAuthorized();
    error InsufficientShares();
    error AmountTooLarge();
    error PrecompileFailed();
    error WithdrawalLocked(uint256 lockedUntil);

    event StrategyAuthorizationUpdated(address indexed strategy, bool allowed);
    event Staked(address indexed strategy, uint256 assets, uint256 shares);
    event Unstaked(address indexed strategy, uint256 shares, uint256 assets);

    constructor(
        IERC20 _asset,
        address _hyperVault,
        IHyperliquidCoreWriter _coreWriter,
        ICoreDepositWallet _coreDepositWallet
    ) Ownable(msg.sender) {
        if (
            address(_asset) == address(0) ||
            _hyperVault == address(0) ||
            address(_coreWriter) == address(0) ||
            address(_coreDepositWallet) == address(0)
        ) {
            revert ZeroAddress();
        }
        asset = _asset;
        hyperVault = _hyperVault;
        coreWriter = _coreWriter;
        coreDepositWallet = _coreDepositWallet;
    }

    modifier onlyStrategy() {
        if (!authorizedStrategy[msg.sender]) {
            revert NotAuthorized();
        }
        _;
    }

    function setAuthorizedStrategy(address strategy, bool allowed) external onlyOwner {
        if (strategy == address(0)) {
            revert ZeroAddress();
        }
        authorizedStrategy[strategy] = allowed;
        emit StrategyAuthorizationUpdated(strategy, allowed);
    }

    /// @notice Deposit assets and receive shares proportional to current vault equity
    /// @param assets Amount of USDC to deposit (6 decimals)
    /// @return shares Number of shares minted
    function stake(uint256 assets) external nonReentrant onlyStrategy returns (uint256 shares) {
        if (assets == 0) {
            revert ZeroAssets();
        }

        // Transfer USDC from strategy to this contract
        asset.safeTransferFrom(msg.sender, address(this), assets);

        // Calculate shares based on current equity
        uint256 currentEquity = _getTotalEquity();
        if (totalShares == 0 || currentEquity == 0) {
            // First deposit: 1:1 shares
            shares = assets;
        } else {
            // Proportional shares based on current equity
            shares = (assets * totalShares) / currentEquity;
        }

        // Update share tracking
        strategyShares[msg.sender] += shares;
        totalShares += shares;
        totalDepositedFallback += assets;

        // Bridge USDC from HyperEVM to HyperCore (perps account)
        asset.forceApprove(address(coreDepositWallet), assets);
        coreDepositWallet.deposit(assets, DESTINATION_PERPS);

        // Send vault transfer action to deposit into the Hyperliquid vault
        _sendVaultTransferAction(true, assets);

        emit Staked(msg.sender, assets, shares);
    }

    /// @notice Unstake by specifying asset amount (converts to shares internally)
    /// @param assets Amount of assets to withdraw
    /// @return sharesBurned Number of shares burned
    /// @return assetsReturned Amount of assets returned
    function unstake(uint256 assets) external nonReentrant onlyStrategy returns (uint256 sharesBurned, uint256 assetsReturned) {
        if (assets == 0) {
            revert ZeroAssets();
        }

        // Convert assets to shares based on current equity
        uint256 currentEquity = _getTotalEquity();
        uint256 shares;
        if (currentEquity == 0 || totalShares == 0) {
            shares = assets;
        } else {
            shares = (assets * totalShares) / currentEquity;
        }

        uint256 sharesHeld = strategyShares[msg.sender];
        if (sharesHeld < shares) {
            revert InsufficientShares();
        }

        // Check lock status (only on real Hyperliquid)
        (, uint64 lockedUntil) = _getVaultEquity();
        if (lockedUntil > block.timestamp) {
            revert WithdrawalLocked(lockedUntil);
        }

        sharesBurned = shares;
        assetsReturned = assets;

        // Update share tracking
        strategyShares[msg.sender] = sharesHeld - sharesBurned;
        totalShares -= sharesBurned;
        if (totalDepositedFallback >= assetsReturned) {
            totalDepositedFallback -= assetsReturned;
        } else {
            totalDepositedFallback = 0;
        }

        // Send vault withdrawal action
        _sendVaultTransferAction(false, assetsReturned);

        // Transfer from contract balance if available
        uint256 balance = asset.balanceOf(address(this));
        if (balance >= assetsReturned) {
            asset.safeTransfer(msg.sender, assetsReturned);
        }

        emit Unstaked(msg.sender, sharesBurned, assetsReturned);
    }

    function shareBalance(address strategy) external view returns (uint256) {
        return strategyShares[strategy];
    }

    /// @notice Returns the actual asset value for a strategy based on vault equity
    /// @param strategy Address of the strategy
    /// @return assets Current value of the strategy's position
    function totalAssets(address strategy) external view returns (uint256) {
        if (totalShares == 0) {
            return 0;
        }
        uint256 currentEquity = _getTotalEquity();
        return (strategyShares[strategy] * currentEquity) / totalShares;
    }

    /// @notice Get raw vault equity and lock status from precompile
    function getVaultEquity() external view returns (uint64 equity, uint64 lockedUntil) {
        return _getVaultEquity();
    }

    /// @notice Get total equity in the Hyperliquid vault
    function getTotalEquity() external view returns (uint256) {
        return _getTotalEquity();
    }

    function _getTotalEquity() internal view returns (uint256) {
        (uint64 equity, ) = _getVaultEquity();
        // Use precompile value if available, otherwise fall back to local tracking
        if (equity > 0) {
            return uint256(equity);
        }
        return totalDepositedFallback;
    }

    function _getVaultEquity() internal view returns (uint64 equity, uint64 lockedUntil) {
        (bool success, bytes memory result) = VAULT_EQUITY_PRECOMPILE.staticcall(
            abi.encode(address(this), hyperVault)
        );
        
        if (!success || result.length == 0) {
            // If precompile fails or no data, return 0 (no position yet)
            return (0, 0);
        }

        UserVaultEquity memory uv = abi.decode(result, (UserVaultEquity));
        return (uv.equity, uv.lockedUntilTimestamp);
    }

    function _sendVaultTransferAction(bool isDeposit, uint256 amount) internal {
        uint64 usdAmount = _toUint64(amount);
        // Hyperliquid expects raw bytes: vault (20) + isDeposit (1) + usd (8 big-endian)
        // Use abi.encodePacked for raw encoding without 32-byte padding
        bytes memory payload = abi.encodePacked(
            ACTION_VERSION,                    // 1 byte: version
            bytes3(VAULT_TRANSFER_ACTION_ID),  // 3 bytes: action ID
            hyperVault,                        // 20 bytes: vault address
            isDeposit,                         // 1 byte: boolean
            usdAmount                          // 8 bytes: uint64
        );
        coreWriter.sendRawAction(payload);
    }

    function _toUint64(uint256 amount) internal pure returns (uint64) {
        if (amount > type(uint64).max) {
            revert AmountTooLarge();
        }
        return uint64(amount);
    }
}
