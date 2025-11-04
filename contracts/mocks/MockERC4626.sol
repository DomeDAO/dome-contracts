// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract MockERC4626 is ERC4626 {
	constructor(
		IERC20Metadata asset_,
		string memory name_,
		string memory symbol_
	) ERC20(name_, symbol_) ERC4626(asset_) {}
}

