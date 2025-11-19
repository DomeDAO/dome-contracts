// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {IGovernor, Governor} from "../governance/Governor.sol";
import {GovernorVotes, IVotes} from "../governance/GovernorVotes.sol";

interface IHyperliquidVaultView {
	function asset() external view returns (address);

	function BUFFER() external view returns (address);
}

interface IHyperliquidBufferView {
	function submitTransfer(
		address vault,
		address token,
		address wallet,
		uint256 amount
	) external returns (uint256);

	function vaultReserves(address vault) external view returns (uint256);
}

struct ProposalVote {
	uint256 forVotes;
	mapping(address => bool) hasVoted;
	mapping(address => uint256) votesOf;
}

contract HyperliquidGovernor is Governor, GovernorVotes {
	using EnumerableMap for EnumerableMap.UintToUintMap;

	EnumerableMap.UintToUintMap internal activeProposalVotes;
	mapping(uint256 => ProposalVote) internal _proposalVotes;
	uint256[] public proposals;

	address public immutable VAULT_ADDRESS;

	uint256 private _votingDelay;
	uint256 private _votingPeriod;
	uint256 private _proposalThreshold;

	event ReserveTransfered(uint256 amount);

	error Unauthorized();

	constructor(
		IVotes _token,
		uint256 votingDelay_,
		uint256 votingPeriod_,
		uint256 proposalThreshold_,
		address usdcAddress
	) Governor("HyperliquidGovernor", usdcAddress) GovernorVotes(_token) {
		VAULT_ADDRESS = address(token);
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

	function votingDelay() public view override returns (uint256) {
		return _votingDelay;
	}

	function votingPeriod() public view override returns (uint256) {
		return _votingPeriod;
	}

	function proposalThreshold() public view override returns (uint256) {
		return _proposalThreshold;
	}

	function hasVoted(
		uint256 proposalId,
		address account
	) public view virtual override returns (bool) {
		return _proposalVotes[proposalId].hasVoted[account];
	}

	function proposalVotesOf(
		uint256 proposalId,
		address account
	) public view returns (uint256) {
		return _proposalVotes[proposalId].votesOf[account];
	}

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

		address bufferAddress = IHyperliquidVaultView(VAULT_ADDRESS).BUFFER();
		uint256 reserveAmount = IHyperliquidBufferView(bufferAddress)
			.vaultReserves(VAULT_ADDRESS);

		return (votes == highestVoteCount && votes != 0 && amount <= reserveAmount);
	}

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

	function updateVotes(address account) public {
		require(
			msg.sender == address(token),
			"Only vault token contract is authorized"
		);

		for (uint256 i = 0; i < _votedProposals[account].length; i++) {
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
			(uint256 _proposalId, uint256 voteCount) = activeProposalVotes.at(i);

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

	function _reserveTransfer(address wallet, uint256 amount) internal override {
		address asset = IHyperliquidVaultView(VAULT_ADDRESS).asset();
		address bufferAddress = IHyperliquidVaultView(VAULT_ADDRESS).BUFFER();

		uint256 reserveAmount = IHyperliquidBufferView(bufferAddress)
			.submitTransfer(VAULT_ADDRESS, asset, wallet, amount);

		emit ReserveTransfered(reserveAmount);
	}

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

