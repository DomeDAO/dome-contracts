// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {DomeGovernor, IVotes} from "./Governance.sol";

contract GovernanceFactory {
	event GovernanceCreated(address token, address governance);

	function createGovernance(
		address token,
		uint256 votingDelay,
		uint256 votingPeriod,
		uint256 proposalThreshold
	) external returns (address governanceAddress) {
		governanceAddress = address(
			new DomeGovernor(
				IVotes(token),
				votingDelay,
				votingPeriod,
				proposalThreshold
			)
		);

		emit GovernanceCreated(token, governanceAddress);
	}
}
