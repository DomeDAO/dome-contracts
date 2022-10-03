// SPDX-License-Identifier: MIT

pragma solidity ^0.8.13;

/// Openzeppelin imports
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Yearn imports

/// Local imports
import "./IStrategy.sol";

/**
 * @title Implementation of the Yearn Strategy.
 */
contract VaultStrategy is IStrategy {


    function decimals() public pure virtual override returns (uint256) {

    }

    function vaultAddress() public view virtual override returns (address) {

    }

    function vaultTokenAddress() public view virtual override returns (address) {
    }

    function farm(address erc20Token_, uint256 amount_) public override returns (uint256) {
        
    }

    function estimateReward(address addr_) external view override returns (uint256) {
        
    }

    function takeReward(address to_, uint256 amount_) public virtual override {

    }

    function takeReward(address to_) public override {

    }
}