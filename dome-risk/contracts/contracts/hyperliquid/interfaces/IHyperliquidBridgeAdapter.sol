// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHyperliquidBridgeAdapter {
    function stake(uint256 assets) external returns (uint256 shares);

    function unstake(uint256 assets) external returns (uint256 sharesBurned, uint256 assetsReturned);

    function shareBalance(address strategy) external view returns (uint256);

    function totalAssets(address strategy) external view returns (uint256);
}


