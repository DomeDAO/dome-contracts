// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IHyperliquidBridgeAdapter } from "./interfaces/IHyperliquidBridgeAdapter.sol";
import { IHyperliquidCoreWriter } from "./interfaces/IHyperliquidCoreWriter.sol";

/// @notice Sends Hyperliquid vault transfer actions through CoreWriter. Assets are tracked 1:1 with shares locally.
contract HyperliquidBridgeAdapter is IHyperliquidBridgeAdapter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public immutable hyperVault;
    IHyperliquidCoreWriter public immutable coreWriter;

    uint8 private constant ACTION_VERSION = 0x01;
    uint24 private constant VAULT_TRANSFER_ACTION_ID = 0x000002;

    mapping(address => bool) public authorizedStrategy;
    mapping(address => uint256) private strategyShares;

    error ZeroAddress();
    error ZeroAssets();
    error NotAuthorized();
    error InsufficientAssets();
    error AmountTooLarge();

    event StrategyAuthorizationUpdated(address indexed strategy, bool allowed);

    constructor(IERC20 _asset, address _hyperVault, IHyperliquidCoreWriter _coreWriter) Ownable(msg.sender) {
        if (address(_asset) == address(0) || _hyperVault == address(0) || address(_coreWriter) == address(0)) {
            revert ZeroAddress();
        }
        asset = _asset;
        hyperVault = _hyperVault;
        coreWriter = _coreWriter;
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

    function stake(uint256 assets) external nonReentrant onlyStrategy returns (uint256 shares) {
        if (assets == 0) {
            revert ZeroAssets();
        }

        asset.safeTransferFrom(msg.sender, address(this), assets);

        // Hyperliquid's vault transfer action expects USD amount; treat shares 1:1 with assets.
        shares = assets;
        strategyShares[msg.sender] += shares;
        _sendVaultTransferAction(true, assets);
    }

    function unstake(uint256 assets) external nonReentrant onlyStrategy returns (uint256 sharesBurned, uint256 assetsReturned) {
        if (assets == 0) {
            revert ZeroAssets();
        }

        uint256 sharesHeld = strategyShares[msg.sender];
        if (sharesHeld < assets) {
            revert InsufficientAssets();
        }

        sharesBurned = assets;
        assetsReturned = assets;

        strategyShares[msg.sender] = sharesHeld - sharesBurned;
        asset.safeTransfer(msg.sender, assetsReturned);
        _sendVaultTransferAction(false, assetsReturned);
    }

    function shareBalance(address strategy) external view returns (uint256) {
        return strategyShares[strategy];
    }

    /// @notice Returns locally tracked principal for a strategy.
    /// Does not include Hyperliquid vault performance; integrate precompile reads if on-chain NAV is required.
    function totalAssets(address strategy) external view returns (uint256) {
        return strategyShares[strategy];
    }

    function _sendVaultTransferAction(bool isDeposit, uint256 amount) internal {
        uint64 usdAmount = _toUint64(amount);
        bytes memory encodedAction = abi.encode(hyperVault, isDeposit, usdAmount);
        bytes memory payload = abi.encodePacked(ACTION_VERSION, bytes3(VAULT_TRANSFER_ACTION_ID), encodedAction);
        coreWriter.sendRawAction(payload);
    }

    function _toUint64(uint256 amount) internal pure returns (uint64) {
        if (amount > type(uint64).max) {
            revert AmountTooLarge();
        }
        return uint64(amount);
    }
}


