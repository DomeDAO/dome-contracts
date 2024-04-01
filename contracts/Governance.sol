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

interface IWrappedVoting {
	function DOME_ADDRESS() external view returns (address);
}

struct ProposalVote {
	uint256 forVotes;
	mapping(address => bool) hasVoted;
	mapping(address => uint256) votesOf;
}

contract DomeGovernor is Governor, GovernorVotes {
	using EnumerableMap for EnumerableMap.UintToUintMap;

	EnumerableMap.UintToUintMap internal activeProposalVotes;
	mapping(uint256 => ProposalVote) internal _proposalVotes;
	address public immutable DOME_ADDRESS;

	uint256 private _votingDelay;
	uint256 private _votingPeriod;
	uint256 private _proposalThreshold;

	event ReserveTransfered(uint256 amount);

	error Unauthorized();
	error NoActiveProposals();

	constructor(
		IVotes _token,
		uint256 votingDelay_,
		uint256 votingPeriod_,
		uint256 proposalThreshold_
	) Governor("DomeGovernor") GovernorVotes(_token) {
		DOME_ADDRESS = IWrappedVoting(address(token)).DOME_ADDRESS();
		_votingDelay = votingDelay_;
		_votingPeriod = votingPeriod_;
		_proposalThreshold = proposalThreshold_;
	}

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
	 * @dev See {IGovernor-votingDelay}.
	 */
	function votingDelay() public view override returns (uint256) {
		return _votingDelay;
	}

	/**
	 * @dev See {IGovernor-votingPeriod}.
	 */
	function votingPeriod() public view override returns (uint256) {
		return _votingPeriod;
	}

	/**
	 * @dev Part of the Governor Bravo's interface: _"The number of votes required in order for a voter to become a proposer"_.
	 */
	function proposalThreshold() public view override returns (uint256) {
		return _proposalThreshold;
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

	function _voteSucceeded(
		uint256 proposalId
	) internal view virtual override returns (bool) {
		if (!activeProposalVotes.contains(proposalId)) {
			return false;
		}

		uint256 votes = activeProposalVotes.get(proposalId);
		(, uint256 highestVoteCount) = _getHighestVotedProposal();

		(, uint256 amount, , ) = proposalDetails(proposalId);

		address bufferAddress = IDome(DOME_ADDRESS).BUFFER();
		uint256 reserveAmount = IBuffer(bufferAddress).domeReserves(
			DOME_ADDRESS
		);

		return (votes == highestVoteCount &&
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

		proposalVote.hasVoted[account] = true;
		if (proposalVote.votesOf[account] > weight) {
			uint256 diff = proposalVote.votesOf[account] - weight;
			proposalVote.votesOf[account] -= diff;
			proposalVote.forVotes -= diff;
		} else {
			uint256 diff = weight - proposalVote.votesOf[account];
			proposalVote.votesOf[account] += diff;
			proposalVote.forVotes += diff;
		}

		activeProposalVotes.set(proposalId, proposalVote.forVotes);
	}

	function updateVotes(address account) public {
		require(
			msg.sender == address(token),
			"Only wrapped token contract is authorized"
		);

		for (uint i = 0; i < _votedProposals[account].length; i++) {
			uint256 proposalId = _votedProposals[account][i];
			if (
				hasVoted(proposalId, account) && _isProposalActive(proposalId)
			) {
				uint256 weight = _getVotes(
					account,
					block.number,
					_defaultParams()
				);
				_countVote(proposalId, account, weight, _defaultParams());

				if (_defaultParams().length == 0) {
					emit VoteCast(
						account,
						proposalId,
						weight,
						"Update vote balance"
					);
				} else {
					emit VoteCastWithParams(
						account,
						proposalId,
						weight,
						"Update vote balance",
						_defaultParams()
					);
				}
			}
		}
	}

	function _getHighestVotedProposal()
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
				currentState == ProposalState.Canceled ||
				currentState == ProposalState.Defeated ||
				currentState == ProposalState.Executed
			) {
				activeProposalVotes.remove(_proposalId);
			}
		}

		return activeProposalVotes.length();
	}

	function _reserveTransfer(
		address wallet,
		uint256 amount
	) internal override {
		address asset = IDome(DOME_ADDRESS).asset();
		address bufferAddress = IDome(DOME_ADDRESS).BUFFER();

		uint256 reserveAmount = IBuffer(bufferAddress).submitTransfer(
			DOME_ADDRESS,
			asset,
			wallet,
			amount
		);

		emit ReserveTransfered(reserveAmount);
	}

	function propose(
		address wallet,
		uint256 amount,
		string memory title,
		string memory description
	) public override returns (uint256) {
		uint256 proposalId = super.propose(wallet, amount, title, description);

		activeProposalVotes.set(proposalId, 0);

		return proposalId;
	}

	function execute(
		uint256 _proposalId
	) public override returns (uint256 proposalId) {
		return super.execute(_proposalId);
	}

	function cancel(
		uint256 _proposalId
	) public override returns (uint256 proposalId) {
		return super.cancel(_proposalId);
	}

	function triggerProposal() public returns (uint256 proposalId) {
		(uint256 _proposalId, ) = _getHighestVotedProposal();
		if (!activeProposalVotes.contains(_proposalId)) {
			revert ProposalNotFound(_proposalId);
		}

		return this.execute(_proposalId);
	}

	function _isProposalActive(
		uint256 proposalId
	) internal view override returns (bool) {
		return activeProposalVotes.contains(proposalId);
	}

	function _afterExecute(uint256 proposalId) internal override {
		_removeInactiveProposals();

		super._afterExecute(proposalId);
	}
}
