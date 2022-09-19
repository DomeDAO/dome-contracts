// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IDomeCore {

    function stake(uint104 amount_) external;

    function unstake(uint104 amount) external;

    function claimInterests() external;

}