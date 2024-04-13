// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {DomeWrappedVoting} from "./WrappedVoting.sol";

contract WrappedVotingFactory {
	event WrappedVotingCreated(address token, address wrappedVoting);

	/**
	 * Creates dome tokens wrapper voting contract
	 * @param token dome address to wrap voting tokens
	 */
	function createWrapper(
		address token
	) external returns (address wrappedVoting) {
		wrappedVoting = address(new DomeWrappedVoting(token, msg.sender));

		emit WrappedVotingCreated(token, wrappedVoting);
	}
}
