// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
		ERC20("BetterWithDomeVotingPower", "BWDVOTE")
		ERC20Permit("BetterWithDomeVotingPower")
		ERC20Wrapper(IERC20(wrappedToken))
	{
		DOME_PROTOCOL = creator;
	}

	/**
	 * @dev Returns the decimals places of the token.
	 */
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

	/**
	 * @dev Returns Dome address linked to the voting
	 */
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

	/**
	 * Burns voting tokens and returns stake tokens
	 * @notice Contains logic which updates proposal votes after burn
	 * @param account account of holder
	 * @param amount amount to burn
	 */
	function _burn(
		address account,
		uint256 amount
	) internal override(ERC20, ERC20Votes) {
		address governanceAddress = IDomeProtocol(DOME_PROTOCOL).domeGovernance(
			DOME_ADDRESS()
		);

		super._burn(account, amount);
		address _delegatee = delegates(account);
		if (amount > 0 && _delegatee != address(0)) {
			IGovernance(governanceAddress).updateVotes(_delegatee);
		}
	}
}
