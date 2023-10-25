// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {DomeGovernor, IVotes} from "./Governance.sol";

contract GovernanceFactory {
	event GovernanceCreated(address token, address governance);

	function createGovernance(
		address token
	) external returns (address governanceAddress) {
		governanceAddress = address(new DomeGovernor(IVotes(token)));

		emit GovernanceCreated(token, governanceAddress);
	}
}
