// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {IGovernor, Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

interface IDome {
	function asset() external view returns (address);

	function BUFFER() external view returns (address);
}

interface IBuffer {
	function submitTransfer(
		address dome,
		address token,
		address wallet
	) external returns (uint256);
}

contract DomeGovernor is
	Governor,
	GovernorSettings,
	GovernorCountingSimple,
	GovernorVotes,
	GovernorVotesQuorumFraction
{
	event ReserveTransfered(uint256 amount);

	constructor(
		IVotes _token
	)
		Governor("DomeGovernor")
		GovernorSettings(7200 /* 1 day */, 50400 /* 1 week */, 0)
		GovernorVotes(_token)
		GovernorVotesQuorumFraction(4)
	{}

	function reserveTransfer(address wallet) public onlyGovernance {
		address domeAddress = address(token);
		address asset = IDome(domeAddress).asset();
		address bufferAddress = IDome(domeAddress).BUFFER();

		uint256 reserveAmount = IBuffer(bufferAddress).submitTransfer(
			domeAddress,
			asset,
			wallet
		);

		emit ReserveTransfered(reserveAmount);
	}

	// The functions below are overrides required by Solidity.
	function proposalThreshold()
		public
		view
		override(Governor, GovernorSettings)
		returns (uint256)
	{
		return super.proposalThreshold();
	}
}
