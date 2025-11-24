// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IHyperliquidVault } from "../hyperliquid/interfaces/IHyperliquidVault.sol";

contract MockHyperliquidVault is IHyperliquidVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;

    uint256 public sharePriceWad = 1e18;
    uint256 public redemptionSlippageBps;

    mapping(address => uint256) private shareBalances;
    uint256 private totalShares;

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientShares();

    constructor(IERC20 _asset) {
        if (address(_asset) == address(0)) {
            revert ZeroAddress();
        }
        asset = _asset;
    }

    function setSharePrice(uint256 newPriceWad) external {
        if (newPriceWad == 0) {
            revert ZeroAmount();
        }
        sharePriceWad = newPriceWad;
    }

    function setRedemptionSlippageBps(uint256 bps) external {
        require(bps <= 10_000, "slippage too high");
        redemptionSlippageBps = bps;
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        if (assets == 0) {
            revert ZeroAmount();
        }
        if (receiver == address(0)) {
            revert ZeroAddress();
        }

        asset.safeTransferFrom(msg.sender, address(this), assets);
        shares = (assets * 1e18) / sharePriceWad;
        if (shares == 0) {
            revert InsufficientShares();
        }

        shareBalances[receiver] += shares;
        totalShares += shares;
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assetsOut) {
        if (shares == 0) {
            revert ZeroAmount();
        }
        if (receiver == address(0) || owner == address(0)) {
            revert ZeroAddress();
        }

        uint256 ownerBalance = shareBalances[owner];
        if (ownerBalance < shares) {
            revert InsufficientShares();
        }

        shareBalances[owner] = ownerBalance - shares;
        totalShares -= shares;

        assetsOut = (shares * sharePriceWad) / 1e18;
        if (redemptionSlippageBps > 0) {
            uint256 loss = (assetsOut * redemptionSlippageBps) / 10_000;
            assetsOut -= loss;
        }

        asset.safeTransfer(receiver, assetsOut);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * sharePriceWad) / 1e18;
    }

    function balanceOf(address account) external view returns (uint256) {
        return shareBalances[account];
    }
}

