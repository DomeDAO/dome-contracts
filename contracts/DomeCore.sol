//SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {IERC4626, IERC20Metadata, ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {DomeBase, SafeERC20} from "./base/DomeBase.sol";
import {YieldProviderType} from "./interfaces/YieldProviderTypes.sol";

struct BeneficiaryInfo {
	string beneficiaryCID;
	address wallet;
	uint16 percent; // Percentage has 2 deciaml points, 100% == 10.000
}

struct DomeInfo {
	string CID;
	string tokenName;
	string tokenSymbol;
}

interface IBuffer {
	function addReserve(uint256 amount) external;
}

interface IDomeProtocol {
	function BUFFER() external view returns (address);

	function domeCreators(address) external view returns (address);

	function mintRewardTokens(
		address asset,
		address to,
		uint256 amount
	) external returns (uint256);
}

contract Dome is ERC20, IERC4626, DomeBase {
	using SafeERC20 for IERC20;

	address public immutable DOME_PROTOCOL;
	IERC4626 public immutable yieldProtocol;
	YieldProviderType public immutable yieldProviderType;

	uint256 public totalAssets;
	mapping(address => uint256) private _assets;
	mapping(address => uint256) private _depositorYield;

	mapping(address => uint256) private _stakerRewards;

	string public DOME_CID;

	BeneficiaryInfo[] public beneficiaries;

	uint16 public immutable depositorYieldPercent;
	uint256 public depositorsYield;

	bool public rewardsPaused = true;

	error InActive();
	error Unauthorized();

	event YieldClaimed(address _yieldProtocol, uint256 _amount);
	event Distribute(address indexed beneficiary, uint256 amount);
	event Donate(address indexed donor, address indexed token, uint256 amount);
	event Burn(address indexed donor, uint256 shares);

	constructor(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		address _yieldProtocol,
		YieldProviderType _yieldProviderType,
		address _systemOwner,
		address _domeProtocol,
		uint16 systemOwnerPercent,
		uint16 _depositorYieldPercent
	)
		ERC20(domeInfo.tokenName, domeInfo.tokenSymbol)
		DomeBase(_systemOwner, systemOwnerPercent)
	{
		DOME_PROTOCOL = _domeProtocol;
		DOME_CID = domeInfo.CID;
		yieldProtocol = IERC4626(_yieldProtocol);
		yieldProviderType = _yieldProviderType;

		uint16 _totalPercent = 0;
		for (uint8 i = 0; i < beneficiariesInfo.length; i++) {
			beneficiaries.push(beneficiariesInfo[i]);
			_totalPercent += beneficiariesInfo[i].percent;
		}
		if (_totalPercent != 10000) {
			revert InvalidFeePercent();
		}

		depositorYieldPercent = _depositorYieldPercent;

		// Initial max approve to yieldProtocol
		_approveToken(yieldProtocol.asset(), _yieldProtocol, type(uint256).max);
	}

	/**
	 * @dev Returns the decimals places of the token.
	 */
	function decimals()
		public
		view
		override(ERC20, IERC20Metadata)
		returns (uint8)
	{
		return IERC20Metadata(yieldProtocol.asset()).decimals();
	}

	/**
	 * @dev Returns BUFFER address linked to the dome
	 */
	function BUFFER() public view returns (address) {
		return IDomeProtocol(DOME_PROTOCOL).BUFFER();
	}

	/**
	 * @dev Returns Dome creator address
	 */
	function domeOwner() public view returns (address) {
		return IDomeProtocol(DOME_PROTOCOL).domeCreators(address(this));
	}

	/**
	 * @dev Returns underlying asset address
	 */
	function asset() public view returns (address) {
		return yieldProtocol.asset();
	}

	/**
	 * @dev Returns total shares owned by the dome
	 */
	function totalShares() public view returns (uint256) {
		return _getBalance(address(yieldProtocol));
	}

	/**
	 * @dev Pauses reward token issuance
	 */
	function pauseRewards() external {
		if (msg.sender != domeOwner() && msg.sender != systemOwner) {
			revert Unauthorized();
		}

		rewardsPaused = true;
	}

	/**
	 * @dev Unpauses reward token issuance
	 */
	function unpauseRewards() external {
		if (msg.sender != domeOwner() && msg.sender != systemOwner) {
			revert Unauthorized();
		}

		rewardsPaused = false;
	}

	/**
	 * Deposits assets and enteres dome
	 * @param assets asset amount to deposit
	 * @param receiver receiver address of shares
	 */
	function deposit(
		uint256 assets,
		address receiver
	) external override returns (uint256) {
		assets = _pullTokens(yieldProtocol.asset(), assets);
		uint256 shares = yieldProtocol.previewDeposit(assets);

		_deposit(msg.sender, receiver, assets, shares);

		return shares;
	}

	/**
	 * Mintes shares and enteres dome
	 * @param shares shares amount to receive
	 * @param receiver share receiver address
	 */
	function mint(
		uint256 shares,
		address receiver
	) external override returns (uint256) {
		uint256 assets = yieldProtocol.previewMint(shares);
		assets = _pullTokens(yieldProtocol.asset(), assets);
		_assets[receiver] += assets;

		_deposit(msg.sender, receiver, assets, shares);

		return assets;
	}

	/**
	 * Internal deposit handler
	 * @param caller caller address
	 * @param receiver shares receiver
	 * @param assets assets amount
	 * @param shares shares amount
	 */
	function _deposit(
		address caller,
		address receiver,
		uint256 assets,
		uint256 shares
	) private {
		uint256 yieldSharesBalanceBefore = _getBalance(address(yieldProtocol));
		yieldProtocol.mint(shares, address(this));
		uint256 yieldSharesReceived = _getBalance(address(yieldProtocol)) -
			yieldSharesBalanceBefore;

		if (!(yieldSharesReceived > 0)) {
			revert TransferFailed();
		}

		// We mint our wrapped share only after share validation
		_mint(receiver, yieldSharesReceived);
		totalAssets += assets;
		_assets[receiver] += assets;

		emit Deposit(caller, receiver, assets, yieldSharesReceived);
	}

	/**
	 * Withdraw assets and exit dome
	 * @param assets assets to withdraw
	 * @param receiver assets receiver
	 * @param owner owner of the assets
	 */
	function withdraw(
		uint256 assets,
		address receiver,
		address owner
	) external override returns (uint256) {
		uint256 shares = previewWithdraw(assets);

		_withdraw(msg.sender, receiver, owner, assets, shares);

		return shares;
	}

	/**
	 * Redeem shares and exit dome
	 * @param shares shares amount to redeem
	 * @param receiver shares receiver
	 * @param owner owner of the shares
	 */
	function redeem(
		uint256 shares,
		address receiver,
		address owner
	) public virtual override returns (uint256) {
		uint256 assets = previewRedeem(shares);

		_withdraw(msg.sender, receiver, owner, assets, shares);

		return assets;
	}

	/**
	 * Internal withdraw handler
	 * @param caller caller address
	 * @param receiver receiver address
	 * @param assets assets amount
	 * @param shares shares amount
	 */
	function _withdraw(
		address caller,
		address receiver,
		address owner,
		uint256 assets,
		uint256 shares
	) internal returns (uint256) {
		if (caller != owner) {
			_decreaseAllowance(owner, caller, shares);
		}

		if (assets > _assets[owner]) {
			_stakerRewards[owner] = 0;
		}

		(uint256 updatedAssetAmount, uint256 yield) = _assetsWithdrawForOwner(
			owner,
			assets
		);

		_burn(owner, shares);

		_assets[owner] -= updatedAssetAmount;
		totalAssets -= updatedAssetAmount;

		yieldProtocol.withdraw(
			updatedAssetAmount + yield,
			receiver,
			address(this)
		);

		emit Withdraw(
			caller,
			receiver,
			owner,
			updatedAssetAmount + yield,
			shares
		);

		return updatedAssetAmount + yield;
	}

	/**
	 * Decreases share spending allowance
	 * @param owner shares owner address
	 * @param spender shares spender address
	 * @param amount amount of tokens
	 */
	function _decreaseAllowance(
		address owner,
		address spender,
		uint256 amount
	) internal {
		uint256 currentAllowance = allowance(owner, spender);
		if (currentAllowance != type(uint256).max) {
			require(
				currentAllowance >= amount,
				"ERC20: insufficient allowance"
			);
			unchecked {
				_approve(owner, spender, currentAllowance - amount);
			}
		}
	}

	/**
	 * Retuns available yield asset amounts
	 * @return assets available generated assets
	 * @return shares available generated sharse
	 */
	function availableYield()
		public
		view
		returns (uint256 assets, uint256 shares)
	{
		uint256 domeTotalSharesBalance = _getBalance(address(yieldProtocol));
		uint256 domeAssetBalance = yieldProtocol.previewRedeem(
			domeTotalSharesBalance
		);

		uint256 depositorsTotalAssetsWithYield = yieldProtocol.previewRedeem(
			totalSupply()
		);

		if (depositorsTotalAssetsWithYield < totalAssets) {
			return (0, 0);
		}

		uint256 generatedYield = depositorsTotalAssetsWithYield - totalAssets;
		uint256 depositorsYieldPortion = (generatedYield *
			depositorYieldPercent) / 10000;

		uint256 netYield = domeAssetBalance -
			totalAssets -
			depositorsYieldPortion;

		// Getting differed values from shares to assets later
		// Need to reconvert them to validate
		shares = yieldProtocol.convertToShares(netYield);
		netYield = yieldProtocol.convertToAssets(shares);
		return (netYield, shares);
	}

	/**
	 * Distributes provided assets among beneficiares
	 * @param amount amount to distribute
	 */
	function _distribute(uint256 amount) internal {
		for (uint256 i; i < beneficiaries.length; i++) {
			uint256 distributeAmount = (amount * beneficiaries[i].percent) /
				10000;

			// If beneficiary is Buffer, we send assets to them
			IERC20(yieldProtocol.asset()).safeTransfer(
				beneficiaries[i].wallet,
				distributeAmount
			);

			if (beneficiaries[i].wallet == BUFFER()) {
				IBuffer(BUFFER()).addReserve(distributeAmount);
			}

			emit Distribute(beneficiaries[i].wallet, distributeAmount);
		}
	}

	/**
	 * Claims generated yield and distributes amoung beneficiares
	 */
	function claimYieldAndDistribute() external {
		(uint256 assets, uint256 shares) = availableYield();

		assets = yieldProtocol.redeem(shares, address(this), address(this));
		assets = _subtractFees(yieldProtocol.asset(), assets);

		_distribute(assets);
		emit YieldClaimed(address(yieldProtocol), assets);
	}

	/**
	 * Preview assets withdrawal
	 * @param assets withdraw assets amount
	 */
	function previewWithdraw(
		uint256 assets
	) public view returns (uint256 shares) {
		if (assets > _assets[msg.sender]) {
			return balanceOf(msg.sender);
		}

		return yieldProtocol.previewWithdraw(assets);
	}

	/**
	 * Returns max redeem amount for owner
	 * @param owner share owner address
	 */
	function maxRedeem(
		address owner
	) external view returns (uint256 maxShares) {
		return balanceOf(owner);
	}

	/**
	 * Returns max withdrawal amount for owner
	 * @param owner share owner address
	 */
	function maxWithdraw(
		address owner
	) external view returns (uint256 maxAssets) {
		uint256 shares = balanceOf(owner);
		uint256 assets = yieldProtocol.previewRedeem(shares);

		(uint256 updatedAssets, uint256 yield) = _assetsWithdrawForOwner(
			owner,
			assets
		);

		return updatedAssets + yield;
	}

	/**
	 * Preview assets redeem
	 * @param assets redeem shares amount
	 */
	function previewRedeem(
		uint256 shares
	) public view returns (uint256 assets) {
		assets = yieldProtocol.previewRedeem(shares);
		(uint256 updatedAssets, uint256 yield) = _assetsWithdrawForOwner(
			msg.sender,
			assets
		);

		return updatedAssets + yield;
	}

	/**
	 * Internal function for withdrawal calculation for owner
	 * @param owner shares owner address
	 * @param assets amount of assets
	 * @return assets amount
	 * @return yield yield portion of owner
	 */
	function _assetsWithdrawForOwner(
		address owner,
		uint256 assets
	) private view returns (uint256, uint256 yield) {
		uint256 totalAssetsFromShares = yieldProtocol.previewRedeem(
			balanceOf(owner)
		);

		if (assets > _assets[owner]) {
			uint256 generatedYield = totalAssetsFromShares - _assets[owner];
			uint256 depositorsYieldPortion = (generatedYield *
				depositorYieldPercent) / 10000;

			return (_assets[owner], depositorsYieldPortion);
		}

		return (assets, 0);
	}

	/**
	 * Returns generated yield amount for staker
	 * @param owner shares owner address
	 */
	function generatedYieldOf(address owner) public view returns (uint256) {
		uint256 totalAssetsFromShares = yieldProtocol.previewRedeem(
			balanceOf(owner)
		);

		if (_assets[owner] > totalAssetsFromShares) {
			return 0;
		}

		return totalAssetsFromShares - _assets[owner];
	}

	/**
	 * Claims reward tokens
	 */
	function claim() external returns (uint256) {
		if (rewardsPaused) {
			revert InActive();
		}

		uint256 generatedYield = generatedYieldOf(msg.sender);

		uint256 depositorsYieldPortion = (generatedYield *
			depositorYieldPercent) / 10000;
		generatedYield = generatedYield - depositorsYieldPortion;

		uint256 systemFeePortion = (generatedYield * systemFeePercent) / 10000;
		uint256 rewardAmount = (generatedYield - systemFeePortion) -
			_stakerRewards[msg.sender];
		_stakerRewards[msg.sender] += rewardAmount;

		return
			IDomeProtocol(DOME_PROTOCOL).mintRewardTokens(
				yieldProtocol.asset(),
				msg.sender,
				rewardAmount
			);
	}

	/**
	 * Donates ERC20-compatible tokens
	 * @param token address of token
	 * @param amount amount to donate
	 */
	function donate(address token, uint256 amount) external payable {
		if (token == address(this)) {
			burn(amount);
		} else {
			amount = _pullTokens(token, amount);
			_donate(token, amount);
		}

		emit Donate(msg.sender, token, amount);
	}

	/**
	 * Internal donation handler, donation will be distributed among beneficiaries
	 * @param token address of token
	 * @param amount amount to donate
	 */
	function _donate(address token, uint256 amount) internal {
		uint256 bufferPercent;
		for (uint256 i; i < beneficiaries.length; i++) {
			if (beneficiaries[i].wallet == BUFFER()) {
				bufferPercent = beneficiaries[i].percent;
			}
		}

		uint256 additionalPercent;
		// Redistribute buffer's percent among other beneficiaries
		if (token != asset() && bufferPercent > 0) {
			additionalPercent = bufferPercent / (beneficiaries.length - 1);
		}

		for (uint256 i; i < beneficiaries.length; i++) {
			uint256 percent = beneficiaries[i].percent;

			if (additionalPercent > 0) {
				if (beneficiaries[i].wallet == BUFFER()) {
					continue;
				}

				percent += additionalPercent;
			}

			uint256 distributeAmount = (amount * percent) / 10000;
			// If beneficiary is Buffer, we send assets to them
			IERC20(token).safeTransfer(
				beneficiaries[i].wallet,
				distributeAmount
			);

			if (additionalPercent == 0 && beneficiaries[i].wallet == BUFFER()) {
				IBuffer(BUFFER()).addReserve(distributeAmount);
			}

			emit Distribute(beneficiaries[i].wallet, distributeAmount);
		}
	}

	/**
	 * Burns share tokens, and distributes underlying assets among beneficiaries
	 * @param shares shares amount to burn
	 */
	function burn(uint shares) public {
		uint256 assets = previewRedeem(shares);

		uint256 amount = _withdraw(
			msg.sender,
			address(this),
			msg.sender,
			assets,
			shares
		);

		_distribute(amount);
		emit Burn(msg.sender, shares);
	}

	function _afterTokenTransfer(
		address from,
		address to,
		uint256 amount
	) internal override {
		super._afterTokenTransfer(from, to, amount);
	}

	function _mint(address to, uint256 amount) internal override {
		super._mint(to, amount);
	}

	function _burn(address account, uint256 amount) internal override {
		super._burn(account, amount);
	}

	function convertToShares(
		uint256 assets
	) external view returns (uint256 shares) {
		return yieldProtocol.convertToShares(assets);
	}

	function convertToAssets(
		uint256 shares
	) external view returns (uint256 assets) {
		return yieldProtocol.convertToAssets(shares);
	}

	function maxDeposit(
		address receiver
	) external view returns (uint256 maxAssets) {
		return yieldProtocol.maxDeposit(receiver);
	}

	function previewDeposit(
		uint256 assets
	) external view returns (uint256 shares) {
		return yieldProtocol.previewDeposit(assets);
	}

	function maxMint(
		address receiver
	) external view returns (uint256 maxShares) {
		return yieldProtocol.maxMint(receiver);
	}

	function previewMint(
		uint256 shares
	) external view returns (uint256 assets) {
		return yieldProtocol.previewMint(shares);
	}
}
