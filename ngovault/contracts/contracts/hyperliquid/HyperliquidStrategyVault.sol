// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IStrategyVault } from "../interfaces/IStrategyVault.sol";
import { IHyperliquidBridgeAdapter } from "./interfaces/IHyperliquidBridgeAdapter.sol";

contract HyperliquidStrategyVault is IStrategyVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    IHyperliquidBridgeAdapter public immutable bridge;

    error ZeroAddress();

    constructor(IERC20 _asset, IHyperliquidBridgeAdapter _bridge) {
        if (address(_asset) == address(0) || address(_bridge) == address(0)) {
            revert ZeroAddress();
        }
        asset = _asset;
        bridge = _bridge;
    }

    function deposit(uint256 assets) external returns (uint256 shares) {
        require(assets > 0, "zero assets");

        asset.safeTransferFrom(msg.sender, address(this), assets);
        asset.forceApprove(address(bridge), assets);
        shares = bridge.stake(assets);
    }

    function withdraw(uint256 assets) external returns (uint256 sharesBurned) {
        require(assets > 0, "zero assets");

        uint256 assetsReturned;
        (sharesBurned, assetsReturned) = bridge.unstake(assets);
        asset.safeTransfer(msg.sender, assetsReturned);
    }

    function totalAssets() external view returns (uint256) {
        return bridge.totalAssets(address(this));
    }
}


