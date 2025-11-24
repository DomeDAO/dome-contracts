// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IStrategyVault } from "../interfaces/IStrategyVault.sol";

contract MockStrategyVault is IStrategyVault {
    using SafeERC20 for IERC20;

    uint256 private constant SHARE_SCALAR = 1e12;

    IERC20 public immutable asset;
    uint256 public totalShares;
    uint256 public sharePriceWad;

    event SharePriceUpdated(uint256 newSharePriceWad);
    event Deposited(address indexed caller, uint256 assets, uint256 shares);
    event Withdrawn(address indexed caller, uint256 assets, uint256 sharesBurned);

    constructor(IERC20 _asset) {
        require(address(_asset) != address(0), "asset is zero");
        asset = _asset;
        sharePriceWad = 1e18;
    }

    function setSharePrice(uint256 newPriceWad) external {
        require(newPriceWad > 0, "price zero");
        sharePriceWad = newPriceWad;
        emit SharePriceUpdated(newPriceWad);
    }

    function deposit(uint256 assets) external returns (uint256 shares) {
        require(assets > 0, "zero assets");
        asset.safeTransferFrom(msg.sender, address(this), assets);

        if (totalShares == 0) {
            shares = assets * SHARE_SCALAR;
        } else {
            shares = (assets * SHARE_SCALAR * 1e18) / sharePriceWad;
        }

        require(shares > 0, "zero shares");
        totalShares += shares;
        emit Deposited(msg.sender, assets, shares);
    }

    function withdraw(uint256 assets) external returns (uint256 sharesBurned) {
        require(assets > 0, "zero assets");
        sharesBurned = (assets * SHARE_SCALAR * 1e18) / sharePriceWad;
        require(sharesBurned <= totalShares, "insufficient shares");
        require(sharesBurned > 0, "zero burn");

        totalShares -= sharesBurned;
        asset.safeTransfer(msg.sender, assets);
        emit Withdrawn(msg.sender, assets, sharesBurned);
    }

    function totalAssets() external view returns (uint256) {
        return (totalShares * sharePriceWad) / (1e18 * SHARE_SCALAR);
    }
}

