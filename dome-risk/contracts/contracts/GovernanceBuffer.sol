// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract GovernanceBuffer is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public governance;

    event GovernanceUpdated(address indexed newGovernance);
    event Released(address indexed recipient, uint256 amount);

    error GovernanceZero();
    error NotGovernance();
    error RecipientZero();
    error AmountZero();

    constructor(IERC20 _asset, address initialGovernance) Ownable(msg.sender) {
        require(address(_asset) != address(0), "asset zero");
        asset = _asset;
        governance = initialGovernance;
    }

    modifier onlyGovernance() {
        if (msg.sender != governance) {
            revert NotGovernance();
        }
        _;
    }

    function setGovernance(address newGovernance) external onlyOwner {
        if (newGovernance == address(0)) {
            revert GovernanceZero();
        }
        governance = newGovernance;
        emit GovernanceUpdated(newGovernance);
    }

    function balance() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function release(address recipient, uint256 amount) external onlyGovernance {
        if (recipient == address(0)) {
            revert RecipientZero();
        }
        if (amount == 0) {
            revert AmountZero();
        }
        asset.safeTransfer(recipient, amount);
        emit Released(recipient, amount);
    }
}
