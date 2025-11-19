// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20Metadata, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ICoreWriter} from "./ICoreWriter.sol";
import {HyperliquidActions} from "./HyperliquidActions.sol";
import {HyperliquidBuffer} from "./HyperliquidBuffer.sol";

/**
 * @title HyperliquidVault
 * @notice ERC4626 adapter that represents Hypercore / Hyperliquid exposure while
 *         keeping the Dome friendly ERC4626 surface area.
 *
 *         Assets flow:
 *         - Depositors provide USDC via {deposit}/{mint}.
 *         - The vault can automatically forward freshly deposited USDC to the buffer/Hyperliquid
 *           via the auto-deploy configuration, keeping the flow to a single transaction,
 *           while still exposing {deployToHyperliquid} for manual calls (redeploying profits, etc.).
 *         - When positions close, the buffer returns principal + profit to the vault and calls
 *           {reconcileFromHyperliquid} to realise profits and update bookkeeping.
 *
 *         Profit split:
 *         - A portion defined by `bufferFeeBps` is paid to the buffer wallet.
 *         - Another defined by `ownerFeeBps` is paid to the system owner (same owner as the Dome protocol).
 *         - The remainder compounds for depositors.
 *
 *         The buffer can nominate a new system owner through {bufferSetOwner} to align with
 *         the requirement "buffer is deployer who can change the owner".
 */
contract HyperliquidVault is
	ERC4626,
	ERC20Permit,
	ERC20Votes,
	Ownable,
	Pausable,
	ReentrancyGuard
{
	using SafeERC20 for IERC20;

	uint16 public constant MAX_BPS = 10_000;
	uint256 public constant WITHDRAWAL_COOLDOWN = 24 hours;

	ICoreWriter public immutable coreWriter;
	address public buffer;
	address public bufferTreasury;

	uint16 public bufferFeeBps;
	uint16 public ownerFeeBps;
	uint256 public deployedAssets;
	uint256 public nextWithdrawalTimestamp;

	struct AutoDeployConfig {
		bool enabled;
		uint24 actionId;
		address destination;
	}

	AutoDeployConfig public autoDeployConfig;

	event BufferUpdated(address indexed oldBuffer, address indexed newBuffer);
	event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
	event FeesUpdated(uint16 bufferFeeBps, uint16 ownerFeeBps);
	event AssetsDeployed(
		uint256 amount,
		uint24 indexed actionId,
		bytes actionPayload
	);
	event AssetsReconciled(uint256 principal, uint256 profit);
	event LossRecorded(uint256 lossAmount);
	event ProfitDistributed(
		uint256 profit,
		uint256 bufferShare,
		uint256 ownerShare
	);
	event HyperliquidActionForwarded(
		address indexed caller,
		uint24 indexed actionId,
		bytes parameters,
		bytes payload
	);
event DeployedValueReported(uint256 previousValue, uint256 newValue);
	event AutoDeployConfigUpdated(
		bool enabled,
		uint24 actionId,
		address indexed destination
	);
	event WithdrawalCooldownScheduled(uint256 indexed readyAt);
	event WithdrawalCooldownCleared(uint256 timestamp);

	error InsufficientIdleAssets();
	error InvalidFeeConfiguration();
	error NotBuffer();
	error NothingToDistribute();
	error InvalidTreasury();
	error InvalidAutoDeployConfig();
	error WithdrawalCooldownActive(uint256 readyAt);

	modifier onlyBuffer() {
		if (msg.sender != buffer) {
			revert NotBuffer();
		}
		_;
	}

	constructor(
		IERC20Metadata usdc,
		ICoreWriter coreWriter_,
		address buffer_,
		address owner_,
		address bufferTreasury_,
		uint16 bufferFeeBps_,
		uint16 ownerFeeBps_,
		string memory name_,
		string memory symbol_
	)
		ERC20(name_, symbol_)
		ERC4626(usdc)
		ERC20Permit(name_)
		Ownable()
	{
		if (
			buffer_ == address(0) ||
			address(coreWriter_) == address(0) ||
			owner_ == address(0) ||
			bufferTreasury_ == address(0)
		) {
			revert InvalidFeeConfiguration();
		}

		coreWriter = coreWriter_;
		buffer = buffer_;
		bufferTreasury = bufferTreasury_;
		_transferOwnership(owner_);
		_setFees(bufferFeeBps_, ownerFeeBps_);
	}

	/*//////////////////////////////////////////////////////////////
                        ERC4626 OVERRIDES
    //////////////////////////////////////////////////////////////*/

	function totalAssets()
		public
		view
		override
		returns (uint256)
	{
		return IERC20(asset()).balanceOf(address(this)) + deployedAssets;
	}

	/*//////////////////////////////////////////////////////////////
                        BUFFER & OWNER CONTROLS
    //////////////////////////////////////////////////////////////*/

	function updateBuffer(address newBuffer) external onlyBuffer {
		if (newBuffer == address(0)) {
			revert InvalidFeeConfiguration();
		}
		address oldBuffer = buffer;
		buffer = newBuffer;
		emit BufferUpdated(oldBuffer, newBuffer);
	}

	function updateTreasury(address newTreasury) external onlyOwner {
		if (newTreasury == address(0)) {
			revert InvalidTreasury();
		}

		address oldTreasury = bufferTreasury;
		bufferTreasury = newTreasury;
		emit TreasuryUpdated(oldTreasury, newTreasury);
	}

	function BUFFER() external view returns (address) {
		return bufferTreasury;
	}

	function bufferSetOwner(address newOwner) external onlyBuffer {
		_transferOwnership(newOwner);
	}

	function pause() external onlyOwner {
		_pause();
	}

	function unpause() external onlyOwner {
		_unpause();
	}

	function updateFees(uint16 bufferFeeBps_, uint16 ownerFeeBps_)
		external
		onlyOwner
	{
		_setFees(bufferFeeBps_, ownerFeeBps_);
	}

	function updateAutoDeployConfig(
		bool enabled,
		uint24 actionId,
		address destination
	) external onlyOwner {
		if (enabled && destination == address(0)) {
			revert InvalidAutoDeployConfig();
		}

		autoDeployConfig = AutoDeployConfig({
			enabled: enabled,
			actionId: actionId,
			destination: destination
		});

		emit AutoDeployConfigUpdated(enabled, actionId, destination);
	}

	/*//////////////////////////////////////////////////////////////
                        HYPERLIQUID CAPITAL FLOWS
    //////////////////////////////////////////////////////////////*/

	function deployToHyperliquid(
		uint256 amount,
		uint24 actionId,
		bytes calldata parameters
	) external onlyBuffer nonReentrant whenNotPaused {
		_deployAssets(amount, actionId, parameters);
	}

	function reconcileFromHyperliquid(uint256 principal, uint256 profit)
		external
		onlyBuffer
		nonReentrant
	{
		_enforceWithdrawalCooldown();
	uint256 totalReduction = principal + profit;
	if (totalReduction > deployedAssets) {
		deployedAssets = 0;
	} else {
		deployedAssets -= totalReduction;
	}

		if (profit > 0) {
			_distributeProfit(profit);
		}

		emit AssetsReconciled(principal, profit);
		_clearWithdrawalCooldown();
	}

	function recordLoss(uint256 lossAmount)
		external
		onlyBuffer
		nonReentrant
	{
		if (lossAmount > deployedAssets) {
			revert InsufficientIdleAssets();
		}

		deployedAssets -= lossAmount;
		emit LossRecorded(lossAmount);
	}

	function sendHyperliquidAction(
		uint24 actionId,
		bytes calldata parameters
	) external onlyBuffer returns (bytes memory payload) {
		payload = HyperliquidActions.encodeAction(actionId, parameters);
		coreWriter.sendRawAction(payload);
		emit HyperliquidActionForwarded(msg.sender, actionId, parameters, payload);
	}

	function sendEncodedHyperliquidAction(bytes calldata payload)
		external
		onlyBuffer
	{
		if (payload.length < 4) {
			revert HyperliquidActions.ActionEncodingTooLarge();
		}
		coreWriter.sendRawAction(payload);
		emit HyperliquidActionForwarded(msg.sender, 0, "", payload);
	}

function reportDeployedValue(uint256 newValue) external onlyBuffer {
	uint256 previous = deployedAssets;
	deployedAssets = newValue;
	emit DeployedValueReported(previous, newValue);
}

	/*//////////////////////////////////////////////////////////////
                        INTERNAL HELPERS
    //////////////////////////////////////////////////////////////*/

	function _setFees(uint16 bufferFeeBps_, uint16 ownerFeeBps_) internal {
		if (bufferFeeBps_ + ownerFeeBps_ >= MAX_BPS) {
			revert InvalidFeeConfiguration();
		}
		bufferFeeBps = bufferFeeBps_;
		ownerFeeBps = ownerFeeBps_;
		emit FeesUpdated(bufferFeeBps_, ownerFeeBps_);
	}

	function _distributeProfit(uint256 profit) internal {
		if (profit == 0) {
			revert NothingToDistribute();
		}

		IERC20 usdc = IERC20(asset());
		uint256 idle = usdc.balanceOf(address(this));
		if (profit > idle) {
			revert InsufficientIdleAssets();
		}

		uint256 bufferShare = (profit * bufferFeeBps) / MAX_BPS;
		uint256 ownerShare = (profit * ownerFeeBps) / MAX_BPS;
		uint256 totalFee = bufferShare + ownerShare;

		if (bufferShare > 0) {
			usdc.safeTransfer(bufferTreasury, bufferShare);
			HyperliquidBuffer(bufferTreasury).addReserve(bufferShare);
		}
		if (ownerShare > 0) {
			usdc.safeTransfer(owner(), ownerShare);
		}

		emit ProfitDistributed(profit, bufferShare, ownerShare);

		if (totalFee < profit) {
			// leftover stays in the vault and automatically accrues to depositors
			return;
		}
	}

	function _afterTokenTransfer(
		address from,
		address to,
		uint256 amount
	) internal override(ERC20, ERC20Votes) {
		super._afterTokenTransfer(from, to, amount);
	}

	function _mint(address to, uint256 amount)
		internal
		override(ERC20, ERC20Votes)
	{
		super._mint(to, amount);
	}

	function _burn(address account, uint256 amount)
		internal
		override(ERC20, ERC20Votes)
	{
		super._burn(account, amount);
	}

	function decimals()
		public
		view
		override(ERC20, ERC4626)
		returns (uint8)
	{
		return super.decimals();
	}

	function deposit(uint256 assets, address receiver)
		public
		override
		whenNotPaused
		returns (uint256 shares)
	{
		shares = super.deposit(assets, receiver);
		_autoDeploy(assets);
	}

	function mint(uint256 shares, address receiver)
		public
		override
		whenNotPaused
		returns (uint256 assets)
	{
		assets = super.mint(shares, receiver);
		_autoDeploy(assets);
	}

	function _deployAssets(
		uint256 amount,
		uint24 actionId,
		bytes memory parameters
	) internal {
		if (amount == 0) {
			revert InsufficientIdleAssets();
		}

		uint256 idle = IERC20(asset()).balanceOf(address(this));
		if (amount > idle) {
			revert InsufficientIdleAssets();
		}

		deployedAssets += amount;
		IERC20(asset()).safeTransfer(buffer, amount);
		_scheduleWithdrawalCooldown();

		bytes memory payload;
		if (actionId != 0 && parameters.length != 0) {
			payload = HyperliquidActions.encodeAction(actionId, parameters);
			coreWriter.sendRawAction(payload);
		}

		emit AssetsDeployed(amount, actionId, payload);
	}

	function _autoDeploy(uint256 assets) internal {
		if (!autoDeployConfig.enabled || assets == 0) {
			return;
		}

		bytes memory params = abi.encode(autoDeployConfig.destination, assets);
		_deployAssets(assets, autoDeployConfig.actionId, params);
	}

	function positionValue(address account) external view returns (uint256) {
		return convertToAssets(balanceOf(account));
	}

	function withdrawalCooldownInfo()
		external
		view
		returns (uint256 readyAt, uint256 secondsRemaining)
	{
		readyAt = nextWithdrawalTimestamp;
		if (readyAt == 0 || block.timestamp >= readyAt) {
			return (readyAt, 0);
		}
		secondsRemaining = readyAt - block.timestamp;
	}

	function _enforceWithdrawalCooldown() internal view {
		uint256 readyAt = nextWithdrawalTimestamp;
		if (readyAt != 0 && block.timestamp < readyAt) {
			revert WithdrawalCooldownActive(readyAt);
		}
	}

	function _scheduleWithdrawalCooldown() internal {
		uint256 readyAt = block.timestamp + WITHDRAWAL_COOLDOWN;
		nextWithdrawalTimestamp = readyAt;
		emit WithdrawalCooldownScheduled(readyAt);
	}

	function _clearWithdrawalCooldown() internal {
		if (nextWithdrawalTimestamp == 0) {
			return;
		}
		nextWithdrawalTimestamp = 0;
		emit WithdrawalCooldownCleared(block.timestamp);
	}
}

