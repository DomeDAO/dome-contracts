// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Share } from "./Share.sol";
import { IGovernanceBuffer } from "./interfaces/IGovernanceBuffer.sol";

/// @title Governance
/// @notice Manages project proposals and voting using real-time share balances
/// @dev Votes are calculated at funding time based on current balances, preventing:
///      - Vote weight freezing (stake more = more voting power)
///      - Ghost votes (unstake = lose voting power)
///      - Transfer attacks (transfer shares = lose voting power)
contract Governance {
    using SafeERC20 for IERC20;

    uint256 public constant VOTING_DELAY = 7 days;
    uint256 public constant VOTING_DURATION = 180 days;
    uint256 public constant MIN_VOTING_PERIOD = 7 days;

    struct Project {
        uint256 id;
        address projectWallet;
        uint256 amountRequested;
        uint256 createdAt;
        uint256 votingStart;
        uint256 votingEnd;
        bool funded;
        string description;
    }

    error NoEligibleProject();
    error InvalidProject();
    error VotingNotStarted();
    error VotingEnded();
    error AlreadyVoted();
    error NotVoted();
    error NoVotingPower();
    error VotingStillActive();

    IERC20 public immutable asset;
    Share public immutable shareToken;
    IGovernanceBuffer public immutable buffer;

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;
    
    // Track WHO voted, not HOW MUCH - votes calculated at funding time
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => address[]) private projectVoters;

    event ProjectSubmitted(
        uint256 indexed projectId,
        address indexed wallet,
        uint256 amount,
        uint256 votingStart,
        uint256 votingEnd
    );
    event Voted(uint256 indexed projectId, address indexed voter);
    event VoteRemoved(uint256 indexed projectId, address indexed voter);
    event ProjectFunded(uint256 indexed projectId, address indexed wallet, uint256 amount);

    constructor(IERC20 _asset, Share _shareToken, IGovernanceBuffer _buffer) {
        require(address(_asset) != address(0), "asset zero");
        require(address(_shareToken) != address(0), "share zero");
        require(address(_buffer) != address(0), "buffer zero");
        asset = _asset;
        shareToken = _shareToken;
        buffer = _buffer;
    }

    function submitProject(
        address projectWallet,
        uint256 amountRequested,
        string calldata description
    ) external returns (uint256 projectId) {
        require(projectWallet != address(0), "wallet zero");
        require(amountRequested > 0, "amount zero");

        projectId = ++projectCount;
        uint256 createdAt = block.timestamp;
        Project storage project = projects[projectId];
        project.id = projectId;
        project.projectWallet = projectWallet;
        project.amountRequested = amountRequested;
        project.createdAt = createdAt;
        project.votingStart = createdAt + VOTING_DELAY;
        project.votingEnd = createdAt + VOTING_DURATION;
        project.description = description;

        emit ProjectSubmitted(projectId, projectWallet, amountRequested, project.votingStart, project.votingEnd);
    }

    /// @notice Vote for a project (your current share balance = your voting power)
    /// @dev Voting power is calculated at funding time, not at vote time
    function vote(uint256 projectId) external {
        Project storage project = projects[projectId];
        if (project.id == 0) {
            revert InvalidProject();
        }
        if (block.timestamp < project.votingStart) {
            revert VotingNotStarted();
        }
        if (block.timestamp > project.votingEnd) {
            revert VotingEnded();
        }
        if (hasVoted[projectId][msg.sender]) {
            revert AlreadyVoted();
        }

        uint256 balance = shareToken.balanceOf(msg.sender);
        if (balance == 0) {
            revert NoVotingPower();
        }

        hasVoted[projectId][msg.sender] = true;
        projectVoters[projectId].push(msg.sender);

        emit Voted(projectId, msg.sender);
    }

    /// @notice Remove your vote from a project
    function removeVote(uint256 projectId) external {
        Project storage project = projects[projectId];
        if (project.id == 0) {
            revert InvalidProject();
        }
        if (block.timestamp > project.votingEnd) {
            revert VotingEnded();
        }
        if (!hasVoted[projectId][msg.sender]) {
            revert NotVoted();
        }

        hasVoted[projectId][msg.sender] = false;
        // Note: We don't remove from projectVoters array (gas expensive)
        // The voter just won't count since hasVoted is false

        emit VoteRemoved(projectId, msg.sender);
    }

    /// @notice Get the current vote count for a project (based on real-time balances)
    /// @dev This is the actual voting power - sum of current balances of all voters
    function getProjectVotes(uint256 projectId) public view returns (uint256 totalVotes) {
        address[] memory voters = projectVoters[projectId];
        uint256 length = voters.length;
        
        for (uint256 i = 0; i < length; i++) {
            address voter = voters[i];
            // Only count if still voted (hasn't removed vote)
            if (hasVoted[projectId][voter]) {
                totalVotes += shareToken.balanceOf(voter);
            }
        }
    }

    /// @notice Get the number of voters for a project
    function getVoterCount(uint256 projectId) external view returns (uint256 count) {
        address[] memory voters = projectVoters[projectId];
        uint256 length = voters.length;
        
        for (uint256 i = 0; i < length; i++) {
            if (hasVoted[projectId][voters[i]]) {
                count++;
            }
        }
    }

    function fundTopProject(uint256[] calldata candidateIds) external {
        uint256 length = candidateIds.length;
        if (length == 0) {
            revert NoEligibleProject();
        }
        uint256 bufferBalance = buffer.balance();

        uint256 bestId;
        uint256 bestVotes;

        for (uint256 i = 0; i < length; i++) {
            uint256 candidateId = candidateIds[i];
            Project storage project = projects[candidateId];
            if (project.id == 0) {
                revert InvalidProject();
            }
            if (block.timestamp < project.createdAt + MIN_VOTING_PERIOD) {
                revert VotingStillActive();
            }
            if (block.timestamp > project.createdAt + VOTING_DURATION) {
                revert VotingEnded();
            }
            if (project.funded || project.amountRequested > bufferBalance) {
                continue;
            }

            // Calculate votes based on CURRENT balances
            uint256 projectVotes = getProjectVotes(candidateId);
            
            if (bestId == 0 || projectVotes > bestVotes) {
                bestId = candidateId;
                bestVotes = projectVotes;
            }
        }

        if (bestId == 0) {
            revert NoEligibleProject();
        }

        Project storage winner = projects[bestId];
        winner.funded = true;
        buffer.release(winner.projectWallet, winner.amountRequested);

        emit ProjectFunded(bestId, winner.projectWallet, winner.amountRequested);
    }

    function donationBuffer() external view returns (uint256) {
        return buffer.balance();
    }
}
