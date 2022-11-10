// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/// Openzeppelin imports
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Implementation of the PVTToken.
 *
 */
contract TestUSDC is ERC20, Ownable{


    constructor()
        ERC20("Test USD coin", "USDC") {
    }


    function mint(address to_, uint256 amount_) public onlyOwner virtual {
        require(amount_!=0,"Cant mint 0 tokens");
        _mint(to_, amount_);
    }

    function burn(address from_, uint256 amount_) public onlyOwner virtual {
        require(amount_!=0,"Cant burn 0 tokens");
        _burn(from_, amount_);
    }
}