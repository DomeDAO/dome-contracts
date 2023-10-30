// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract RewardToken is ERC20 {
	address immutable DOME_PROTOCOL;

	error Unauthorized();

	event RewardClaimed(address indexed account, uint256 amount);

	constructor(address _domeProtocol) ERC20("RewardToken", "RT") {
		DOME_PROTOCOL = _domeProtocol;
	}

	function mint(address to, uint256 amount) external {
		if (msg.sender != DOME_PROTOCOL) {
			revert Unauthorized();
		}

		_mint(to, amount);

		emit RewardClaimed(to, amount);
	}
}
