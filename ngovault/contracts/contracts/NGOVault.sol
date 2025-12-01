// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IStrategyVault } from "./interfaces/IStrategyVault.sol";
import { NGOShare } from "./NGOShare.sol";
import { NGOGovernance } from "./NGOGovernance.sol";

contract NGOVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant SHARE_SCALAR = 1e12;
    uint16 public constant MAX_DONATION_BPS = 10_000;

    IERC20 public immutable asset;
    NGOShare public immutable shareToken;
    IStrategyVault public immutable underlying;

    NGOGovernance public governance;
    uint16 public donationBps;

    struct UserAccounting {
        uint256 deposited;
        uint256 withdrawn;
        uint256 donated;
    }

    mapping(address => uint256) public totalDeposited;
    mapping(address => uint256) public totalWithdrawn;
    mapping(address => uint256) public totalDonated;
    struct QueuedWithdrawal {
        uint256 shares;
        uint256 assets;
        uint256 net;
        uint256 donation;
        address receiver;
        uint256 timestamp;
    }

    mapping(address => QueuedWithdrawal) public queuedWithdrawals;
    uint256 public totalQueuedWithdrawalAssets;

    event Deposited(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Redeemed(address indexed user, uint256 shares, uint256 grossAssets, uint256 netAssets, uint256 donation);
    event WithdrawalQueued(address indexed user, uint256 shares, uint256 assets);
    event WithdrawalProcessed(address indexed user, address indexed receiver, uint256 netAssets, uint256 donation);
    event DonationBpsUpdated(uint16 newDonationBps);
    event GovernanceUpdated(address newGovernance);

    constructor(
        IERC20 _asset,
        NGOShare _shareToken,
        IStrategyVault _underlying,
        uint16 _donationBps,
        NGOGovernance _governance
    ) Ownable(msg.sender) {
        require(address(_asset) != address(0), "asset zero");
        require(address(_shareToken) != address(0), "share zero");
        require(address(_underlying) != address(0), "underlying zero");
        require(address(_governance) != address(0), "governance zero");
        require(_donationBps <= MAX_DONATION_BPS, "donationBps too high");
        require(_shareToken.vault() == address(this), "share mismatch");

        asset = _asset;
        shareToken = _shareToken;
        underlying = _underlying;
        donationBps = _donationBps;
        governance = _governance;
    }

    function totalAssets() public view returns (uint256) {
        uint256 managed = underlying.totalAssets();
        if (managed <= totalQueuedWithdrawalAssets) {
            return 0;
        }
        return managed - totalQueuedWithdrawalAssets;
    }

    function totalSupply() public view returns (uint256) {
        return shareToken.totalSupply();
    }

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        require(assets > 0, "Zero assets");
        require(receiver != address(0), "Invalid receiver");
        require(queuedWithdrawals[receiver].shares == 0, "Withdrawal pending");

        uint256 assetsBefore = totalAssets();
        uint256 sharesBefore = totalSupply();

        asset.safeTransferFrom(msg.sender, address(this), assets);
        asset.forceApprove(address(underlying), assets);
        underlying.deposit(assets);

        if (sharesBefore == 0 || assetsBefore == 0) {
            shares = assets * SHARE_SCALAR;
        } else {
            shares = (assets * sharesBefore) / assetsBefore;
        }

        require(shares > 0, "Zero shares");

        totalDeposited[receiver] += assets;
        shareToken.mint(receiver, shares);

        emit Deposited(msg.sender, receiver, assets, shares);
    }

    function redeem(uint256 shares, address receiver) external nonReentrant returns (uint256 netToUser, uint256 donation) {
        require(shares > 0, "Zero shares");
        require(receiver != address(0), "Invalid receiver");

        address user = msg.sender;
        require(queuedWithdrawals[user].shares == 0, "Withdrawal pending");

        uint256 supply = totalSupply();
        require(supply > 0, "No supply");

        uint256 assetsTotal = totalAssets();
        uint256 assetsOutGross = (shares * assetsTotal) / supply;

        shareToken.burn(user, shares);

        uint256 balanceBefore = asset.balanceOf(address(this));
        bool withdrawn = _tryWithdrawFromStrategy(assetsOutGross);

        if (withdrawn) {
            uint256 received = asset.balanceOf(address(this)) - balanceBefore;
            (uint256 net, uint256 donationAmount) = _calculatePayout(user, received);
            _applyAccounting(user, net, donationAmount);
            _transferPayout(receiver, net, donationAmount);

            emit Redeemed(user, shares, received, net, donationAmount);
            return (net, donationAmount);
        }

        (uint256 queuedNet, uint256 queuedDonation) = _calculatePayout(user, assetsOutGross);
        _queueWithdrawal(user, receiver, shares, assetsOutGross, queuedNet, queuedDonation);
        return (0, 0);
    }

    function processQueuedWithdrawal(address user) external nonReentrant returns (uint256 netToUser, uint256 donation) {
        QueuedWithdrawal memory request = queuedWithdrawals[user];
        require(request.shares > 0, "No pending withdrawal");

        uint256 balanceBefore = asset.balanceOf(address(this));
        bool withdrawn = _tryWithdrawFromStrategy(request.assets);
        require(withdrawn, "Withdrawal locked");

        uint256 received = asset.balanceOf(address(this)) - balanceBefore;
        require(received >= request.net + request.donation, "Insufficient payout");

        delete queuedWithdrawals[user];
        totalQueuedWithdrawalAssets -= request.assets;

        _applyAccounting(user, request.net, request.donation);
        _transferPayout(request.receiver, request.net, request.donation);

        emit WithdrawalProcessed(user, request.receiver, request.net, request.donation);
        emit Redeemed(user, request.shares, request.assets, request.net, request.donation);
        return (request.net, request.donation);
    }

    function _queueWithdrawal(
        address user,
        address receiver,
        uint256 shares,
        uint256 assets,
        uint256 net,
        uint256 donationAmount
    ) private {
        queuedWithdrawals[user] = QueuedWithdrawal({
            shares: shares,
            assets: assets,
            net: net,
            donation: donationAmount,
            receiver: receiver,
            timestamp: block.timestamp
        });
        totalQueuedWithdrawalAssets += assets;
        emit WithdrawalQueued(user, shares, assets);
    }

    function _tryWithdrawFromStrategy(uint256 assets) private returns (bool) {
        if (assets == 0) {
            return true;
        }

        try underlying.withdraw(assets) returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }

    function _calculatePayout(address user, uint256 received) private view returns (uint256 net, uint256 donationAmount) {
        uint256 deposited = totalDeposited[user];
        uint256 withdrawn = totalWithdrawn[user];
        uint256 donated = totalDonated[user];

        uint256 profitBefore = 0;
        if (withdrawn + donated > deposited) {
            profitBefore = withdrawn + donated - deposited;
        }

        uint256 profitIfNoDonation = 0;
        if (withdrawn + donated + received > deposited) {
            profitIfNoDonation = withdrawn + donated + received - deposited;
        }

        uint256 incrementalProfit = profitIfNoDonation - profitBefore;
        donationAmount = (incrementalProfit * donationBps) / MAX_DONATION_BPS;
        if (donationAmount > received) {
            donationAmount = received;
        }

        net = received - donationAmount;
    }

    function _applyAccounting(address user, uint256 net, uint256 donationAmount) private {
        totalWithdrawn[user] += net;
        totalDonated[user] += donationAmount;
    }

    function _transferPayout(address receiver, uint256 net, uint256 donationAmount) private {
        if (donationAmount > 0) {
            asset.safeTransfer(address(governance), donationAmount);
        }

        if (net > 0) {
            asset.safeTransfer(receiver, net);
        }
    }

    function setDonationBps(uint16 newDonationBps) external onlyOwner {
        require(newDonationBps <= MAX_DONATION_BPS, "donationBps too high");
        donationBps = newDonationBps;
        emit DonationBpsUpdated(newDonationBps);
    }

    function setGovernance(NGOGovernance newGovernance) external onlyOwner {
        require(address(newGovernance) != address(0), "governance zero");
        governance = newGovernance;
        emit GovernanceUpdated(address(newGovernance));
    }

    function getUserAccounting(address user) external view returns (UserAccounting memory) {
        return UserAccounting({
            deposited: totalDeposited[user],
            withdrawn: totalWithdrawn[user],
            donated: totalDonated[user]
        });
    }
}

