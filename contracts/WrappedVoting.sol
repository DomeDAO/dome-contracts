// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ERC20, IERC20, IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Wrapper} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";

interface IGovernance {
	function updateVotes(address account) external;
}

interface IDomeProtocol {
	function domeGovernance(address dome) external view returns (address);
}

contract DomeWrappedVoting is ERC20, ERC20Permit, ERC20Votes, ERC20Wrapper {
	address immutable DOME_PROTOCOL;

	constructor(
		address wrappedToken,
		address creator
	)
		ERC20("DomeVoting", "DV")
		ERC20Permit("DomeVoting")
		ERC20Wrapper(IERC20(wrappedToken))
	{
		DOME_PROTOCOL = creator;
	}

	function decimals()
		public
		view
		override(ERC20, ERC20Wrapper)
		returns (uint8)
	{
		try IERC20Metadata(address(underlying())).decimals() returns (
			uint8 value
		) {
			return value;
		} catch {
			return super.decimals();
		}
	}

	function DOME_ADDRESS() public view returns (address) {
		return address(underlying());
	}

	function _afterTokenTransfer(
		address from,
		address to,
		uint256 amount
	) internal override(ERC20, ERC20Votes) {
		super._afterTokenTransfer(from, to, amount);
	}

	function _mint(
		address to,
		uint256 amount
	) internal override(ERC20, ERC20Votes) {
		super._mint(to, amount);
	}

	function _burn(
		address account,
		uint256 amount
	) internal override(ERC20, ERC20Votes) {
		address governanceAddress = IDomeProtocol(DOME_PROTOCOL).domeGovernance(
			DOME_ADDRESS()
		);

		address _delegatee = delegates(account);
		if (getVotes(_delegatee) > 0 && _delegatee != address(0)) {
			IGovernance(governanceAddress).updateVotes(_delegatee);
		}
		super._burn(account, amount);
	}
}
