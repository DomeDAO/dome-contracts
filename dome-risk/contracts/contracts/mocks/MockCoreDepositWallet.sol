// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock CoreDepositWallet for testing - simulates bridging USDC from HyperEVM to HyperCore
contract MockCoreDepositWallet {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;

    struct Deposit {
        address sender;
        uint256 amount;
        uint32 destination;
    }

    Deposit[] private deposits;
    uint256 public totalDeposited;

    event DepositReceived(address indexed sender, uint256 amount, uint32 destination);

    constructor(IERC20 _asset) {
        asset = _asset;
    }

    /// @notice Simulates bridging USDC to HyperCore
    /// @param amount Amount of USDC to bridge
    /// @param destination 0 for Perps, type(uint32).max for Spot
    function deposit(uint256 amount, uint32 destination) external {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        deposits.push(Deposit({
            sender: msg.sender,
            amount: amount,
            destination: destination
        }));
        totalDeposited += amount;
        emit DepositReceived(msg.sender, amount, destination);
    }

    function depositCount() external view returns (uint256) {
        return deposits.length;
    }

    function getDeposit(uint256 index) external view returns (Deposit memory) {
        return deposits[index];
    }

    function lastDeposit() external view returns (Deposit memory) {
        require(deposits.length > 0, "No deposits");
        return deposits[deposits.length - 1];
    }
}
