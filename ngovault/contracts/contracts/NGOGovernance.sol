// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { NGOShare } from "./NGOShare.sol";
import { INGOGovernanceBuffer } from "./interfaces/INGOGovernanceBuffer.sol";

contract NGOGovernance {
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
        uint256 votes;
        bool funded;
        string description;
    }

    error NoEligibleProject();
    error InvalidProject();
    error VotingNotStarted();
    error VotingEnded();
    error AlreadyVoted();
    error NoVotingPower();
    error VotingStillActive();

    IERC20 public immutable asset;
    NGOShare public immutable shareToken;
    INGOGovernanceBuffer public immutable buffer;

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProjectSubmitted(
        uint256 indexed projectId,
        address indexed wallet,
        uint256 amount,
        uint256 votingStart,
        uint256 votingEnd
    );
    event Voted(uint256 indexed projectId, address indexed voter, uint256 weight);
    event ProjectFunded(uint256 indexed projectId, address indexed wallet, uint256 amount);

    constructor(IERC20 _asset, NGOShare _shareToken, INGOGovernanceBuffer _buffer) {
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

        uint256 weight = shareToken.balanceOf(msg.sender);
        if (weight == 0) {
            revert NoVotingPower();
        }

        hasVoted[projectId][msg.sender] = true;
        project.votes += weight;

        emit Voted(projectId, msg.sender, weight);
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

            if (bestId == 0 || project.votes > bestVotes) {
                bestId = candidateId;
                bestVotes = project.votes;
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

