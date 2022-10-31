// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface VaultInterface {

    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    function balanceOf(address user_) view external returns(uint256);

}