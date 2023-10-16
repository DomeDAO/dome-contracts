// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {DomeInfo, BeneficiaryInfo, Dome} from "./DomeCore.sol";

interface IGovernanceFactory {
	function createGovernance(
		address token
	) external returns (address governanceAddress);
}

contract DomeFactory {
	event DomeCreated(
		address indexed creator,
		address domeAddress,
		address yieldProtocol,
		string CID
	);

	function initialize(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		address systemOwner,
		address buffer,
		address _yieldProtocol,
		uint16 systemOwnerPercentage,
		uint16 _depositorYieldPercent
	) external returns (address) {
		Dome dome = new Dome(
			domeInfo,
			beneficiariesInfo,
			_yieldProtocol,
			systemOwner,
			buffer,
			systemOwnerPercentage,
			_depositorYieldPercent
		);

		emit DomeCreated(
			msg.sender,
			address(dome),
			_yieldProtocol,
			domeInfo.CID
		);

		return address(dome);
	}
}
