// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {IGovernor, Governor} from "./governance/Governor.sol";
import {GovernorVotes, IVotes} from "./governance/GovernorVotes.sol";

interface IDome {
	function asset() external view returns (address);

	function domeOwner() external view returns (address);

	function BUFFER() external view returns (address);
}

interface IBuffer {
	function submitTransfer(
		address dome,
		address token,
		address wallet,
		uint256 amount
	) external returns (uint256);

	function domeReserves(address) external view returns (uint256);
}

struct ProposalVote {
	uint256 forVotes;
	mapping(address => bool) hasVoted;
}

contract DomeGovernor is Governor, GovernorVotes {
	using EnumerableMap for EnumerableMap.UintToUintMap;

	EnumerableMap.UintToUintMap internal activeProposalVotes;
	mapping(uint256 => ProposalVote) private _proposalVotes;

	event ReserveTransfered(uint256 amount);

	error Unauthorized();
	error NoActiveProposals();

	constructor(IVotes _token) Governor("DomeGovernor") GovernorVotes(_token) {}

	function COUNTING_MODE()
		public
		pure
		virtual
		override
		returns (string memory)
	{
		return "support=bravo&quorum=for,abstain";
	}

	/**
	 * @dev See {IGovernor-hasVoted}.
	 */
	function hasVoted(
		uint256 proposalId,
		address account
	) public view virtual override returns (bool) {
		return _proposalVotes[proposalId].hasVoted[account];
	}

	/**
	 * @dev Accessor to the internal vote counts.
	 */
	function proposalVotes(
		uint256 proposalId
	) public view virtual returns (uint256 forVotes) {
		ProposalVote storage proposalVote = _proposalVotes[proposalId];
		return proposalVote.forVotes;
	}

	/**
	 * @dev See {Governor-_voteSucceeded}. In this module, the forVotes must be strictly over the againstVotes.
	 */
	function _voteSucceeded(
		uint256 proposalId
	) internal view virtual override returns (bool) {
		uint256 votes = activeProposalVotes.get(proposalId);
		(, uint256 highestVotedProposal) = _getHighestVote();

		(, , uint256 amount, , ) = proposalDetails(proposalId);

		address domeAddress = address(token);
		address bufferAddress = IDome(domeAddress).BUFFER();
		uint256 reserveAmount = IBuffer(bufferAddress).domeReserves(
			domeAddress
		);

		return (votes == highestVotedProposal &&
			votes != 0 &&
			amount <= reserveAmount);
	}

	/**
	 * @dev See {Governor-_countVote}. In this module, the support follows the `VoteType` enum (from Governor Bravo).
	 */
	function _countVote(
		uint256 proposalId,
		address account,
		uint256 weight,
		bytes memory // params
	) internal virtual override {
		ProposalVote storage proposalVote = _proposalVotes[proposalId];

		require(
			!proposalVote.hasVoted[account],
			"GovernorVotingSimple: vote already cast"
		);
		proposalVote.hasVoted[account] = true;

		proposalVote.forVotes += weight;
		activeProposalVotes.set(proposalId, proposalVote.forVotes);
	}

	function _getHighestVote()
		internal
		view
		returns (uint256 proposalId, uint256 highestVote)
	{
		for (uint i = 0; i < activeProposalVotes.length(); i++) {
			(uint256 _proposalId, uint256 voteCount) = activeProposalVotes.at(
				i
			);

			if (voteCount > highestVote) {
				proposalId = _proposalId;
				highestVote = voteCount;
			}
		}
	}

	function _removeInactiveProposals() internal returns (uint256 mapLength) {
		for (uint i = 0; i < activeProposalVotes.length(); i++) {
			(uint256 _proposalId, ) = activeProposalVotes.at(i);

			ProposalState currentState = state(_proposalId);

			if (
				currentState != ProposalState.Canceled &&
				currentState != ProposalState.Expired &&
				currentState != ProposalState.Executed
			) {
				activeProposalVotes.remove(_proposalId);
			}
		}

		return activeProposalVotes.length();
	}

	function reserveTransfer(
		address wallet,
		uint256 amount
	) public onlyGovernance {
		address domeAddress = address(token);
		address asset = IDome(domeAddress).asset();
		address bufferAddress = IDome(domeAddress).BUFFER();

		uint256 reserveAmount = IBuffer(bufferAddress).submitTransfer(
			domeAddress,
			asset,
			wallet,
			amount
		);

		emit ReserveTransfered(reserveAmount);
	}

	function propose(
		address wallet,
		uint256 amount,
		bytes memory _calldata,
		string memory description,
		uint256 duration
	) public returns (uint256) {
		address domeOwner = IDome(address(token)).domeOwner();
		if (msg.sender != domeOwner) {
			revert Unauthorized();
		}

		uint256 proposalId = super.propose(
			address(this),
			wallet,
			amount,
			_calldata,
			description,
			duration
		);

		activeProposalVotes.set(proposalId, 0);

		return proposalId;
	}

	function execute(
		address wallet,
		uint256 amount,
		bytes memory _calldata,
		bytes32 descriptionHash
	) public payable returns (uint256 proposalId) {
		uint256 _proposalId = hashProposal(
			address(this),
			wallet,
			amount,
			_calldata,
			descriptionHash
		);

		ProposalState currentState = state(_proposalId);

		if (currentState != ProposalState.PreSucceeded) {
			return
				super.execute(
					address(this),
					wallet,
					amount,
					_calldata,
					descriptionHash
				);
		} else {
			super._execute(
				_proposalId,
				address(this),
				wallet,
				amount,
				_calldata,
				descriptionHash
			);

			return proposalId;
		}
	}

	function cancel(
		address wallet,
		uint256 amount,
		bytes memory _calldata,
		bytes32 descriptionHash
	) public payable returns (uint256 proposalId) {
		return
			super.cancel(
				address(this),
				wallet,
				amount,
				_calldata,
				descriptionHash
			);
	}

	function triggerProposal() public payable returns (uint256 proposalId) {
		(uint256 _proposalId, ) = _getHighestVote();

		(
			,
			address wallet,
			uint256 amount,
			bytes memory _calldata,
			string memory description
		) = proposalDetails(_proposalId);

		return
			this.execute(
				wallet,
				amount,
				_calldata,
				keccak256(bytes(description))
			);
	}

	function _afterExecute(
		uint256 proposalId,
		address target,
		address wallet,
		uint256 amount,
		bytes memory _calldata,
		bytes32 descriptionHash
	) internal virtual override {
		_removeInactiveProposals();

		super._afterExecute(
			proposalId,
			target,
			wallet,
			amount,
			_calldata,
			descriptionHash
		);
	}
}
