// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {DomeGovernor, IVotes} from "./Governance.sol";

contract GovernanceFactory {
	event GovernanceCreated(address token, address governance);

	/**
	 * Creates governance for dome
	 * @param token governance woting token
	 * @param votingDelay proposal voting delay
	 * @param votingPeriod proposal voting period
	 * @param proposalThreshold proposal voting threshold
	 * @param usdcAddress USDC address
	 */
	function createGovernance(
		address token,
		uint256 votingDelay,
		uint256 votingPeriod,
		uint256 proposalThreshold,
		address usdcAddress
	) external returns (address governanceAddress) {
		governanceAddress = address(
			new DomeGovernor(
				IVotes(token),
				votingDelay,
				votingPeriod,
				proposalThreshold,
				usdcAddress
			)
		);

		emit GovernanceCreated(token, governanceAddress);
	}
}
