// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DomeInfo, BeneficiaryInfo, Dome} from "./DomeCore.sol";
import {YieldProviderType} from "./interfaces/YieldProviderTypes.sol";

contract DomeFactory {
	event DomeCreated(
		address indexed creator,
		address domeAddress,
		address yieldProtocol,
		YieldProviderType providerType,
		string CID
	);

	/**
	 * Initializes dome
	 * @param domeInfo dome creation info
	 * @param beneficiariesInfo beneficiaries array with shares
	 * @param systemOwner system owner's address
	 * @param domeProtocol dome protocol address
	 * @param _yieldProtocol yield generation protocol address for dome
	 * @param _yieldProviderType yield provider type identifier
	 * @param systemOwnerPercentage percentage of system owners fee
	 * @param _depositorYieldPercent percent of generated yield which stays with investor
	 */
	function initialize(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		address systemOwner,
		address domeProtocol,
		address _yieldProtocol,
		YieldProviderType _yieldProviderType,
		uint16 systemOwnerPercentage,
		uint16 _depositorYieldPercent
	) external returns (address) {
		Dome dome = new Dome(
			domeInfo,
			beneficiariesInfo,
			_yieldProtocol,
			_yieldProviderType,
			systemOwner,
			domeProtocol,
			systemOwnerPercentage,
			_depositorYieldPercent
		);

		emit DomeCreated(
			msg.sender,
			address(dome),
			_yieldProtocol,
			_yieldProviderType,
			domeInfo.CID
		);

		return address(dome);
	}
}
