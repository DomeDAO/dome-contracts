// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC165, ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IGovernor, IERC6372} from "./interfaces/IGovernor.sol";

/**
 * @dev Core of the governance system, designed to be extended though various modules.
 *
 * This contract is abstract and requires several functions to be implemented in various modules:
 *
 * - A counting module must implement {quorum}, {_quorumReached}, {_voteSucceeded} and {_countVote}
 * - A voting module must implement {_getVotes}
 * - Additionally, {votingPeriod} must also be implemented
 *
 * _Available since v4.3._
 */
abstract contract Governor is
	Context,
	ERC165,
	EIP712,
	IGovernor,
	IERC721Receiver,
	IERC1155Receiver
{
	bytes32 public constant BALLOT_TYPEHASH =
		keccak256("Ballot(uint256 proposalId,uint8 support)");
	bytes32 public constant EXTENDED_BALLOT_TYPEHASH =
		keccak256(
			"ExtendedBallot(uint256 proposalId,uint8 support,string reason,bytes params)"
		);

	// solhint-disable var-name-mixedcase
	struct ProposalCore {
		// --- start retyped from Timers.BlockNumber at offset 0x00 ---
		uint64 voteStart;
		address proposer;
		bytes4 __gap_unused0;
		// --- start retyped from Timers.BlockNumber at offset 0x20 ---
		uint64 voteEnd;
		bytes24 __gap_unused1;
		// --- Remaining fields starting at offset 0x40 ---------------
		bool executed;
		bool canceled;
	}
	// solhint-enable var-name-mixedcase

	string private _name;
	IERC20 public immutable usdc;

	/// @custom:oz-retyped-from mapping(uint256 => Governor.ProposalCore)
	mapping(uint256 => ProposalCore) private _proposals;
	mapping(address => uint256[]) internal _votedProposals;

	/**
	 * @dev Restricts a function so it can only be executed through governance proposals. For example, governance
	 * parameter setters in {GovernorSettings} are protected using this modifier.
	 *
	 * The governance executing address may be different from the Governor's own address, for example it could be a
	 * timelock. This can be customized by modules by overriding {_executor}. The executor is only able to invoke these
	 * functions during the execution of the governor's {execute} function, and not under any other circumstances. Thus,
	 * for example, additional timelock proposers are not able to change governance parameters without going through the
	 * governance protocol (since v4.6).
	 */

	struct ProposalDetails {
		address wallet;
		uint256 amount;
		string title;
		string description;
	}

	mapping(uint256 proposalId => ProposalDetails) private _proposalDetails;

	error ProposalNotFound(uint256);

	modifier onlyGovernance() {
		require(_msgSender() == _executor(), "Governor: onlyGovernance");
		_;
	}

	/**
	 * @dev Sets the value for {name} and {version}
	 */
	constructor(string memory name_, address usdcAddress) EIP712(name_, "1") {
		_name = name_;
		usdc = IERC20(usdcAddress);
	}

	/**
	 * @dev Function to receive ETH that will be handled by the governor (disabled if executor is a third party contract)
	 */
	receive() external payable virtual {
		require(
			_executor() == address(this),
			"Governor: must send to executor"
		);
	}

	function proposalDetails(
		uint256 proposalId
	)
		public
		view
		virtual
		returns (
			address, // wallet
			uint256, // amount
			string memory, // title
			string memory // description
		)
	{
		ProposalDetails memory details = _proposalDetails[proposalId];
		if (details.amount == 0) {
			revert ProposalNotFound(proposalId);
		}
		return (
			details.wallet,
			details.amount,
			details.title,
			details.description
		);
	}

	/**
	 * @dev See {IGovernor-name}.
	 */
	function name() public view virtual override returns (string memory) {
		return _name;
	}

	/**
	 * @dev See {IGovernor-hashProposal}.
	 *
	 * The proposal id is produced by hashing the ABI encoded `targets` array, the `values` array, the `calldatas` array
	 * and the descriptionHash (bytes32 which itself is the keccak256 hash of the description string). This proposal id
	 * can be produced from the proposal data which is part of the {ProposalCreated} event. It can even be computed in
	 * advance, before the proposal is submitted.
	 *
	 * Note that the chainId and the governor address are not part of the proposal id computation. Consequently, the
	 * same proposal (with same operation and same description) will have the same id if submitted on multiple governors
	 * across multiple networks. This also means that in order to execute the same operation twice (on the same
	 * governor) the proposer will have to change the description in order to avoid proposal id conflicts.
	 */
	function hashProposal(
		address wallet,
		uint256 amount,
		bytes32 titleHash,
		bytes32 descriptionHash
	) public pure virtual override returns (uint256) {
		return
			uint256(
				keccak256(
					abi.encode(wallet, amount, titleHash, descriptionHash)
				)
			);
	}

	/**
	 * @dev See {IGovernor-state}.
	 */
	function state(
		uint256 proposalId
	) public view virtual override returns (ProposalState) {
		ProposalCore storage proposal = _proposals[proposalId];

		if (proposal.executed) {
			return ProposalState.Executed;
		}

		if (proposal.canceled) {
			return ProposalState.Canceled;
		}

		uint256 snapshot = proposalSnapshot(proposalId);

		if (snapshot == 0) {
			revert("Governor: unknown proposal id");
		}

		uint256 currentTimepoint = clock();

		if (snapshot >= currentTimepoint) {
			return ProposalState.Pending;
		}

		uint256 deadline = proposalDeadline(proposalId);

		bool voteSucceded = _voteSucceeded(proposalId);

		if (deadline >= currentTimepoint) {
			if (voteSucceded) {
				return ProposalState.PreSucceeded;
			}

			return ProposalState.Active;
		}

		if (voteSucceded) {
			return ProposalState.Succeeded;
		} else {
			return ProposalState.Defeated;
		}
	}

	/**
	 * @dev Part of the Governor Bravo's interface: _"The number of votes required in order for a voter to become a proposer"_.
	 */
	function proposalThreshold() public view virtual returns (uint256) {
		return 0;
	}

	/**
	 * @dev See {IGovernor-proposalSnapshot}.
	 */
	function proposalSnapshot(
		uint256 proposalId
	) public view virtual override returns (uint256) {
		return _proposals[proposalId].voteStart;
	}

	/**
	 * @dev See {IGovernor-proposalDeadline}.
	 */
	function proposalDeadline(
		uint256 proposalId
	) public view virtual override returns (uint256) {
		return _proposals[proposalId].voteEnd;
	}

	/**
	 * @dev Returns the account that created a given proposal.
	 */
	function proposalProposer(
		uint256 proposalId
	) public view virtual override returns (address) {
		return _proposals[proposalId].proposer;
	}

	/**
	 * @dev Is the proposal successful or not.
	 */
	function _voteSucceeded(
		uint256 proposalId
	) internal view virtual returns (bool);

	/**
	 * @dev Get the voting weight of `account` at a specific `timepoint`, for a vote as described by `params`.
	 */
	function _getVotes(
		address account,
		uint256 timepoint,
		bytes memory params
	) internal view virtual returns (uint256);

	function _isProposalActive(
		uint256 proposalId
	) internal view virtual returns (bool);

	/**
	 * @dev Register a vote for `proposalId` by `account` with a given `support`, voting `weight` and voting `params`.
	 *
	 * Note: Support is generic and can represent various things depending on the voting system used.
	 */
	function _countVote(
		uint256 proposalId,
		address account,
		uint256 weight,
		bytes memory params
	) internal virtual;

	/**
	 * @dev Default additional encoded parameters used by castVote methods that don't include them
	 *
	 * Note: Should be overridden by specific implementations to use an appropriate value, the
	 * meaning of the additional params, in the context of that implementation
	 */
	function _defaultParams() internal view virtual returns (bytes memory) {
		return "";
	}

	/**
	 * @dev See {IGovernor-propose}. This function has opt-in frontrunning protection, described in {_isValidDescriptionForProposer}.
	 */
	function propose(
		address wallet,
		uint256 amount,
		string memory title,
		string memory description
	) public virtual override returns (uint256) {
		address proposer = _msgSender();
		require(
			_isValidDescriptionForProposer(proposer, description),
			"Governor: proposer restricted"
		);

		uint256 currentTimepoint = clock();
		require(
			getVotes(proposer, currentTimepoint - 1) >= proposalThreshold(),
			"Governor: proposer votes below proposal threshold"
		);

		uint256 proposalId = hashProposal(
			wallet,
			amount,
			keccak256(bytes(title)),
			keccak256(bytes(description))
		);

		_proposalDetails[proposalId] = ProposalDetails({
			wallet: wallet,
			amount: amount,
			title: title,
			description: description
		});

		require(
			_proposals[proposalId].voteStart == 0,
			"Governor: proposal already exists"
		);

		uint256 snapshot = currentTimepoint + votingDelay();
		uint256 deadline = snapshot + votingPeriod();

		_proposals[proposalId] = ProposalCore({
			proposer: proposer,
			voteStart: SafeCast.toUint64(snapshot),
			voteEnd: SafeCast.toUint64(deadline),
			executed: false,
			canceled: false,
			__gap_unused0: 0,
			__gap_unused1: 0
		});

		ProposalCore memory _proposalCore = _proposals[proposalId];

		emit ProposalCreated(
			proposalId,
			proposer,
			wallet,
			amount,
			_proposalCore.voteStart,
			_proposalCore.voteEnd,
			title,
			description
		);

		return proposalId;
	}

	/**
	 * @dev See {IGovernor-execute}.
	 */
	function execute(
		uint256 proposalId
	) public virtual override returns (uint256) {
		ProposalDetails memory __proposalDetails = _proposalDetails[proposalId];

		ProposalState currentState = state(proposalId);
		require(
			currentState == ProposalState.Succeeded ||
				currentState == ProposalState.PreSucceeded,
			"Governor: proposal not successful"
		);

		emit ProposalExecuted(proposalId);

		_beforeExecute(proposalId);
		_execute(
			proposalId,
			__proposalDetails.wallet,
			__proposalDetails.amount
		);
		_afterExecute(proposalId);

		return proposalId;
	}

	function fill(uint256 proposalId) public virtual returns (uint256) {
		return _fill(proposalId);
	}

	function _fill(uint256 proposalId) internal virtual returns (uint256) {
		ProposalDetails memory __proposalDetails = _proposalDetails[proposalId];

		ProposalState currentState = state(proposalId);
		require(
			currentState == ProposalState.Succeeded ||
				currentState == ProposalState.PreSucceeded ||
				currentState == ProposalState.Active,
			"Governor: proposal not active"
		);

		emit ProposalFilled(proposalId);

		_proposals[proposalId].executed = true;
		_transfer(__proposalDetails.wallet, __proposalDetails.amount);
		return proposalId;
	}

	function _transfer(
		address wallet,
		uint256 amount
	) internal virtual returns (uint256) {
		require(
			usdc.transferFrom(msg.sender, wallet, amount),
			"Governor: USDC transfer failed"
		);
		return amount;
	}

	/**
	 * @dev See {IGovernor-cancel}.
	 */
	function cancel(
		uint256 proposalId
	) public virtual override returns (uint256) {
		require(
			_msgSender() == _proposals[proposalId].proposer,
			"Governor: only proposer can cancel"
		);
		return _cancel(proposalId);
	}

	function _reserveTransfer(
		address wallet,
		uint256 amount
	) internal virtual {}

	/**
	 * @dev Internal execution mechanism. Can be overridden to implement different execution mechanism
	 */
	function _execute(
		uint256 proposalId /* proposalId */,
		address wallet,
		uint256 amount
	) internal virtual {
		_proposals[proposalId].executed = true;
		_reserveTransfer(wallet, amount);
	}

	/**
	 * @dev Hook before execution is triggered.
	 */
	function _beforeExecute(uint256 /* proposalId */) internal virtual {}

	/**
	 * @dev Hook after execution is triggered.
	 */
	function _afterExecute(uint256 /* proposalId */) internal virtual {}

	/**
	 * @dev Internal cancel mechanism: locks up the proposal timer, preventing it from being re-submitted. Marks it as
	 * canceled to allow distinguishing it from executed proposals.
	 *
	 * Emits a {IGovernor-ProposalCanceled} event.
	 */
	function _cancel(uint256 proposalId) internal virtual returns (uint256) {
		ProposalState currentState = state(proposalId);

		require(
			currentState != ProposalState.Canceled &&
				currentState != ProposalState.Defeated &&
				currentState != ProposalState.Executed,
			"Governor: proposal not active"
		);
		_proposals[proposalId].canceled = true;

		emit ProposalCanceled(proposalId);

		return proposalId;
	}

	/**
	 * @dev See {IGovernor-getVotes}.
	 */
	function getVotes(
		address account,
		uint256 timepoint
	) public view virtual override returns (uint256) {
		return _getVotes(account, timepoint, _defaultParams());
	}

	/**
	 * @dev See {IGovernor-getVotesWithParams}.
	 */
	function getVotesWithParams(
		address account,
		uint256 timepoint,
		bytes memory params
	) public view virtual override returns (uint256) {
		return _getVotes(account, timepoint, params);
	}

	/**
	 * @dev See {IGovernor-castVote}.
	 */
	function castVote(
		uint256 proposalId
	) public virtual override returns (uint256) {
		address voter = _msgSender();
		return _castVote(proposalId, voter, "");
	}

	/**
	 * @dev See {IGovernor-castVoteWithReason}.
	 */
	function castVoteWithReason(
		uint256 proposalId,
		string calldata reason
	) public virtual override returns (uint256) {
		address voter = _msgSender();
		return _castVote(proposalId, voter, reason);
	}

	/**
	 * @dev See {IGovernor-castVoteWithReasonAndParams}.
	 */
	function castVoteWithReasonAndParams(
		uint256 proposalId,
		string calldata reason,
		bytes memory params
	) public virtual override returns (uint256) {
		address voter = _msgSender();
		return _castVote(proposalId, voter, reason, params);
	}

	/**
	 * @dev See {IGovernor-castVoteBySig}.
	 */
	function castVoteBySig(
		uint256 proposalId,
		uint8 v,
		bytes32 r,
		bytes32 s
	) public virtual override returns (uint256) {
		address voter = ECDSA.recover(
			_hashTypedDataV4(
				keccak256(abi.encode(BALLOT_TYPEHASH, proposalId))
			),
			v,
			r,
			s
		);
		return _castVote(proposalId, voter, "");
	}

	/**
	 * @dev See {IGovernor-castVoteWithReasonAndParamsBySig}.
	 */
	function castVoteWithReasonAndParamsBySig(
		uint256 proposalId,
		string calldata reason,
		bytes memory params,
		uint8 v,
		bytes32 r,
		bytes32 s
	) public virtual override returns (uint256) {
		address voter = ECDSA.recover(
			_hashTypedDataV4(
				keccak256(
					abi.encode(
						EXTENDED_BALLOT_TYPEHASH,
						proposalId,
						keccak256(bytes(reason)),
						keccak256(params)
					)
				)
			),
			v,
			r,
			s
		);

		return _castVote(proposalId, voter, reason, params);
	}

	/**
	 * @dev Internal vote casting mechanism: Check that the vote is pending, that it has not been cast yet, retrieve
	 * voting weight using {IGovernor-getVotes} and call the {_countVote} internal function. Uses the _defaultParams().
	 *
	 * Emits a {IGovernor-VoteCast} event.
	 */
	function _castVote(
		uint256 proposalId,
		address account,
		string memory reason
	) internal virtual returns (uint256) {
		return _castVote(proposalId, account, reason, _defaultParams());
	}

	function _arrayContains(
		uint256[] memory array,
		uint256 value
	) internal pure returns (bool) {
		for (uint256 i = 0; i < array.length; i++) {
			if (array[i] == value) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @dev Internal vote casting mechanism: Check that the vote is pending, that it has not been cast yet, retrieve
	 * voting weight using {IGovernor-getVotes} and call the {_countVote} internal function.
	 *
	 * Emits a {IGovernor-VoteCast} event.
	 */
	function _castVote(
		uint256 proposalId,
		address account,
		string memory reason,
		bytes memory params
	) internal virtual returns (uint256) {
		ProposalCore storage proposal = _proposals[proposalId];
		ProposalState currentState = state(proposalId);

		require(
			currentState == ProposalState.Active ||
				currentState == ProposalState.PreSucceeded,
			"Governor: vote not currently active"
		);

		uint256 weight = _getVotes(account, proposal.voteEnd, params);
		_countVote(proposalId, account, weight, params);

		uint256[] storage votedProposals = _votedProposals[account];

		if (!_arrayContains(votedProposals, proposalId)) {
			votedProposals.push(proposalId);
		}

		if (params.length == 0) {
			emit VoteCast(account, proposalId, weight, reason);
		} else {
			emit VoteCastWithParams(
				account,
				proposalId,
				weight,
				reason,
				params
			);
		}

		return weight;
	}

	/**
	 * @dev Address through which the governor executes action. Will be overloaded by module that execute actions
	 * through another contract such as a timelock.
	 */
	function _executor() internal view virtual returns (address) {
		return address(this);
	}

	/**
	 * @dev See {IERC721Receiver-onERC721Received}.
	 */
	function onERC721Received(
		address,
		address,
		uint256,
		bytes memory
	) public virtual override returns (bytes4) {
		return this.onERC721Received.selector;
	}

	/**
	 * @dev See {IERC1155Receiver-onERC1155Received}.
	 */
	function onERC1155Received(
		address,
		address,
		uint256,
		uint256,
		bytes memory
	) public virtual override returns (bytes4) {
		return this.onERC1155Received.selector;
	}

	/**
	 * @dev See {IERC1155Receiver-onERC1155BatchReceived}.
	 */
	function onERC1155BatchReceived(
		address,
		address,
		uint256[] memory,
		uint256[] memory,
		bytes memory
	) public virtual override returns (bytes4) {
		return this.onERC1155BatchReceived.selector;
	}

	/**
	 * @dev Check if the proposer is authorized to submit a proposal with the given description.
	 *
	 * If the proposal description ends with `#proposer=0x???`, where `0x???` is an address written as a hex string
	 * (case insensitive), then the submission of this proposal will only be authorized to said address.
	 *
	 * This is used for frontrunning protection. By adding this pattern at the end of their proposal, one can ensure
	 * that no other address can submit the same proposal. An attacker would have to either remove or change that part,
	 * which would result in a different proposal id.
	 *
	 * If the description does not match this pattern, it is unrestricted and anyone can submit it. This includes:
	 * - If the `0x???` part is not a valid hex string.
	 * - If the `0x???` part is a valid hex string, but does not contain exactly 40 hex digits.
	 * - If it ends with the expected suffix followed by newlines or other whitespace.
	 * - If it ends with some other similar suffix, e.g. `#other=abc`.
	 * - If it does not end with any such suffix.
	 */
	function _isValidDescriptionForProposer(
		address proposer,
		string memory description
	) internal view virtual returns (bool) {
		uint256 len = bytes(description).length;

		// Length is too short to contain a valid proposer suffix
		if (len < 52) {
			return true;
		}

		// Extract what would be the `#proposer=0x` marker beginning the suffix
		bytes12 marker;
		assembly {
			// - Start of the string contents in memory = description + 32
			// - First character of the marker = len - 52
			//   - Length of "#proposer=0x0000000000000000000000000000000000000000" = 52
			// - We read the memory word starting at the first character of the marker:
			//   - (description + 32) + (len - 52) = description + (len - 20)
			// - Note: Solidity will ignore anything past the first 12 bytes
			marker := mload(add(description, sub(len, 20)))
		}

		// If the marker is not found, there is no proposer suffix to check
		if (marker != bytes12("#proposer=0x")) {
			return true;
		}

		// Parse the 40 characters following the marker as uint160
		uint160 recovered = 0;
		for (uint256 i = len - 40; i < len; ++i) {
			(bool isHex, uint8 value) = _tryHexToUint(bytes(description)[i]);
			// If any of the characters is not a hex digit, ignore the suffix entirely
			if (!isHex) {
				return true;
			}
			recovered = (recovered << 4) | value;
		}

		return recovered == uint160(proposer);
	}

	/**
	 * @dev Try to parse a character from a string as a hex value. Returns `(true, value)` if the char is in
	 * `[0-9a-fA-F]` and `(false, 0)` otherwise. Value is guaranteed to be in the range `0 <= value < 16`
	 */
	function _tryHexToUint(bytes1 char) private pure returns (bool, uint8) {
		uint8 c = uint8(char);
		unchecked {
			// Case 0-9
			if (47 < c && c < 58) {
				return (true, c - 48);
			}
			// Case A-F
			else if (64 < c && c < 71) {
				return (true, c - 55);
			}
			// Case a-f
			else if (96 < c && c < 103) {
				return (true, c - 87);
			}
			// Else: not a hex char
			else {
				return (false, 0);
			}
		}
	}
}
