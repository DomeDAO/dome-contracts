// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract NGOShare is ERC20 {
    address public immutable vault;

    error NotVault();

    constructor(string memory name_, string memory symbol_, address vault_) ERC20(name_, symbol_) {
        require(vault_ != address(0), "vault zero");
        vault = vault_;
    }

    modifier onlyVault() {
        if (msg.sender != vault) {
            revert NotVault();
        }
        _;
    }

    function mint(address to, uint256 amount) external onlyVault {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyVault {
        _burn(from, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}

