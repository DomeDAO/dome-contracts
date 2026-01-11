// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGovernanceBuffer {
    function balance() external view returns (uint256);

    function release(address recipient, uint256 amount) external;
}
