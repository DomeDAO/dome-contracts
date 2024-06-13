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
	uint256[] public proposals;

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
	 * @dev Returns actual votes of account on specified proposal
	 */
	function proposalVotesOf(
		uint256 proposalId,
		address account
	) public view returns (uint256) {
		return _proposalVotes[proposalId].votesOf[account];
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
	 * @notice Consists of some additional logic to keep track of voted balances of accounts per proposal
	 */
	function _countVote(
		uint256 proposalId,
		address account,
		uint256 weight,
		bytes memory // params
	) internal virtual override {
		ProposalVote storage proposalVote = _proposalVotes[proposalId];

		require(proposalVote.votesOf[account] != weight, "Already voted");

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

	/// @notice Updates votes for a voter with its current votes amount
	/// @param account voter's account address
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

	/// @notice Returns higest voted proposals data
	/// @return proposalId id of the highest voted proposal
	/// @return highestVote its votes amount
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

	/// @notice Removes inactive pools from the list
	/// @return mapLength new length of active proposals list
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

	/// @notice Internal function used to transfer reserve funds
	/// @param wallet to wallet address
	/// @param amount with asset amount
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

	/// @notice Returns the list of all proposals with their votes and state
	function getProposals() external view returns (uint256[][] memory) {
		uint256[][] memory result = new uint256[][](proposals.length);

		for (uint i = 0; i < proposals.length; i++) {
			uint256[] memory proposalResult = new uint256[](3);
			ProposalState currentState = state(proposals[i]);
			uint256 proposalVotes_ = _proposalVotes[proposals[i]].forVotes;

			proposalResult[0] = proposals[i];
			proposalResult[1] = uint8(currentState);
			proposalResult[2] = proposalVotes_;

			result[i] = proposalResult;
		}

		return result;
	}

	/// @notice Create a new proposal
	/// @param wallet receiver of the funs
	/// @param amount asset amount for the proposal
	/// @param title title of the proposal
	/// @param description description of the proposal
	/// @return proposalId created proposalId
	function propose(
		address wallet,
		uint256 amount,
		string memory title,
		string memory description
	) public override returns (uint256) {
		uint256 proposalId = super.propose(wallet, amount, title, description);

		activeProposalVotes.set(proposalId, 0);
		proposals.push(proposalId);

		return proposalId;
	}

	/// @notice Executes the succeded proposal
	/// @param proposalId id of the proposal
	/// @return proposalId executed proposalId
	function execute(
		uint256 _proposalId
	) public override returns (uint256 proposalId) {
		return super.execute(_proposalId);
	}

	/// @notice Canceles creates proposal
	/// @param proposalId id of the proposal
	/// @return proposalId
	function cancel(
		uint256 _proposalId
	) public override returns (uint256 proposalId) {
		return super.cancel(_proposalId);
	}

	/// @notice Triggers proposal at any time if its succeeded and executes
	/// @return proposalId executed proposalId
	function triggerProposal() public returns (uint256 proposalId) {
		(uint256 _proposalId, ) = _getHighestVotedProposal();
		if (!activeProposalVotes.contains(_proposalId)) {
			revert ProposalNotFound(_proposalId);
		}

		return this.execute(_proposalId);
	}

	/// @notice Returns proposal's acitve state wether its active or not
	/// @param proposalId id of the proposal
	/// @return boolean,
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
