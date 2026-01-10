// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStrategyVault {
    function deposit(uint256 assets) external returns (uint256 shares);

    function withdraw(uint256 assets) external returns (uint256 sharesBurned);

    function totalAssets() external view returns (uint256);
}

