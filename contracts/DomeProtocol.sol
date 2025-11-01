// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DomeInfo, BeneficiaryInfo} from "./DomeCore.sol";
import {Buffer} from "./Buffer.sol";
import {RewardToken} from "./RewardToken.sol";
import {YieldProviderType} from "./interfaces/YieldProviderTypes.sol";

struct GovernanceSettings {
	uint256 votingDelay /* in blocks */;
	uint256 votingPeriod /* in blocks */;
	uint256 proposalThreshold /* in blocks */;
}

interface IGovernanceFactory {
	function createGovernance(
		address token,
		uint256 votingDelay,
		uint256 votingPeriod,
		uint256 proposalThreshold,
		address usdcAddress
	) external returns (address governanceAddress);
}

interface IWrappedVotingFactory {
	function createWrapper(
		address token
	) external returns (address wrappedVoting);
}

interface IDomeFactory {
	function initialize(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		address systemOwner,
		address buffer,
		address _yieldProtocol,
		YieldProviderType _yieldProviderType,
		uint16 systemOwnerPercentage,
		uint16 _depositorYieldPercent
	) external returns (address);
}

interface IPriceTracker {
	function convertToUSDC(
		address asset,
		uint256 amount
	) external view returns (uint256);
}

interface IRewardToken {
	function mint(address to, uint256 amount) external;
}

struct YieldProviderConfig {
	address provider;
	YieldProviderType providerType;
	bool enabled;
}

struct YieldProviderInfo {
	YieldProviderType providerType;
	bool enabled;
}

contract DomeProtocol is Ownable {
	uint8 public constant YIELD_PROVIDER_TYPE_UNKNOWN = uint8(YieldProviderType.UNKNOWN);
	uint8 public constant YIELD_PROVIDER_TYPE_AAVE = uint8(YieldProviderType.AAVE);
	uint8 public constant YIELD_PROVIDER_TYPE_HYPERLIQUID = uint8(
		YieldProviderType.HYPERLIQUID
	);
	uint16 public systemOwnerPercentage;
	uint256 public domeCreationFee;

	mapping(address => address) public domeCreators;
	mapping(address => address) public domeGovernance;
	mapping(address => address[]) public creatorDomes;
	mapping(address => YieldProviderInfo) public yieldProviders;
	mapping(address => YieldProviderType) public domeYieldProviders;

	address public BUFFER;
	address public GOVERNANCE_FACTORY;
	address public WRAPPEDVOTING_FACTORY;
	address public DOME_FACTORY;
	address public REWARD_TOKEN;
	address public PRICE_TRACKER;
	address private _owner;
	address public USDC_ADDRESS;

	error UnpaidFee();
	error InvalidFeePercent();
	error TransferFailed();
	error Unauthorized();
	error UnsupportedYieldProvider(address provider);
	error InvalidYieldProviderConfig();

	event DomeCreated(
		address indexed creator,
		address domeAddress,
		address yieldProtocol,
		YieldProviderType providerType,
		string CID
	);
	event YieldProviderConfigured(
		address indexed provider,
		YieldProviderType providerType,
		bool enabled
	);

	constructor(
		address systemOwner,
		address _domeFactory,
		address _governanceFactory,
		address _wrappedvotingFactory,
		address _priceTracker,
		uint16 _systemOwnerPercentage,
		uint256 _domeCreationFee,
		address _usdcAddress
	) {
		_transferOwnership(systemOwner);

		if (_systemOwnerPercentage > 2500) {
			revert InvalidFeePercent();
		}

		systemOwnerPercentage = _systemOwnerPercentage;

		domeCreationFee = _domeCreationFee;

		PRICE_TRACKER = _priceTracker;
		BUFFER = address(new Buffer(address(this)));
		REWARD_TOKEN = address(new RewardToken(address(this)));
		DOME_FACTORY = _domeFactory;
		WRAPPEDVOTING_FACTORY = _wrappedvotingFactory;
		GOVERNANCE_FACTORY = _governanceFactory;
		USDC_ADDRESS = _usdcAddress;
	}

	modifier payedEnough() {
		if (msg.value < domeCreationFee) {
			revert UnpaidFee();
		}
		_;
	}

	/**
	 * Ownable function, updates buffer address
	 * @param _buffer address of the buffer
	 */
	function updateBuffer(address _buffer) external onlyOwner {
		BUFFER = _buffer;
	}

	/**
	 * Ownable function, updates factory addresses
	 * @param _domeFactory dome factory address
	 * @param _wrappedvotingFactory wrapped voting factory address
	 * @param _governanceFactory governance factory address
	 */
	function updateFactories(
		address _domeFactory,
		address _wrappedvotingFactory,
		address _governanceFactory
	) external onlyOwner {
		if (_domeFactory != address(0)) {
			DOME_FACTORY = _domeFactory;
		}

		if (_wrappedvotingFactory != address(0)) {
			WRAPPEDVOTING_FACTORY = _wrappedvotingFactory;
		}

		if (_governanceFactory != address(0)) {
			GOVERNANCE_FACTORY = _governanceFactory;
		}
	}

	function configureYieldProviders(
		YieldProviderConfig[] calldata configs
	) external onlyOwner {
		if (configs.length == 0) {
			revert InvalidYieldProviderConfig();
		}

		for (uint256 i = 0; i < configs.length; i++) {
			YieldProviderConfig calldata config = configs[i];

			if (
				config.provider == address(0) ||
				(config.enabled && config.providerType == YieldProviderType.UNKNOWN)
			) {
				revert InvalidYieldProviderConfig();
			}

			yieldProviders[config.provider] = YieldProviderInfo({
				providerType: config.providerType,
				enabled: config.enabled
			});

			emit YieldProviderConfigured(
				config.provider,
				yieldProviders[config.provider].providerType,
				yieldProviders[config.provider].enabled
			);
		}
	}

	/**
	 * Creates dome
	 * @param domeInfo dome creation info
	 * @param beneficiariesInfo beneficiaries array with shares
	 * @param governanceSettings governance settings for dome
	 * @param _depositorYieldPercent percent of generated yield which stays with investor
	 * @param _yieldProtocol yield generation protocol address for dome
	 */
	function createDome(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		GovernanceSettings memory governanceSettings,
		uint16 _depositorYieldPercent,
		address _yieldProtocol
	) external payable payedEnough returns (address domeAddress) {
		YieldProviderInfo memory providerInfo = yieldProviders[_yieldProtocol];

		if (!providerInfo.enabled) {
			revert UnsupportedYieldProvider(_yieldProtocol);
		}

		domeAddress = IDomeFactory(DOME_FACTORY).initialize(
			domeInfo,
			beneficiariesInfo,
			owner(),
			address(this),
			_yieldProtocol,
			providerInfo.providerType,
			systemOwnerPercentage,
			_depositorYieldPercent
		);

		domeYieldProviders[domeAddress] = providerInfo.providerType;

		for (uint8 i; i < beneficiariesInfo.length; i++) {
			if (beneficiariesInfo[i].wallet == BUFFER) {
				address wrappedVoting = IWrappedVotingFactory(
					WRAPPEDVOTING_FACTORY
				).createWrapper(domeAddress);

				address governanceAddress = IGovernanceFactory(
					GOVERNANCE_FACTORY
				).createGovernance(
						wrappedVoting,
						governanceSettings.votingDelay,
						governanceSettings.votingPeriod,
						governanceSettings.proposalThreshold,
						USDC_ADDRESS
					);

				domeGovernance[domeAddress] = governanceAddress;
			}
		}

		domeCreators[domeAddress] = msg.sender;
		creatorDomes[msg.sender].push(domeAddress);

		emit DomeCreated(
			msg.sender,
			domeAddress,
			_yieldProtocol,
			providerInfo.providerType,
			domeInfo.CID
		);
	}

	/**
	 * Mints reward tokens for an account
	 * @param asset underling asset
	 * @param to receiver address
	 * @param amount mint amount
	 */
	function mintRewardTokens(
		address asset,
		address to,
		uint256 amount
	) external returns (uint256) {
		if (domeCreators[msg.sender] == address(0)) {
			revert Unauthorized();
		}

		uint256 convertedAmount = IPriceTracker(PRICE_TRACKER).convertToUSDC(
			asset,
			amount
		);

		IRewardToken(REWARD_TOKEN).mint(to, convertedAmount);

		return convertedAmount;
	}

	/**
	 * Updates price tracker address
	 * @param _priceTracker price tracker address
	 */
	function changePriceTracker(address _priceTracker) external onlyOwner {
		PRICE_TRACKER = _priceTracker;
	}

	/**
	 * Changes system owner percentage
	 * @param percentage percentage of dome procols system owner
	 */
	function changeSystemOwnerPercentage(uint16 percentage) external onlyOwner {
		if (percentage > 2500) {
			revert InvalidFeePercent();
		}

		systemOwnerPercentage = percentage;
	}

	/**
	 * Changes dome creation fee
	 * @param value dome creation fee in wei
	 */
	function changeDomeCreationFee(uint256 value) external onlyOwner {
		domeCreationFee = value;
	}

	/**
	 * Withdraws any ethereum locked in the contract
	 * @param recipient recepient of the funds
	 */
	function withdraw(address recipient) external onlyOwner {
		(bool success, ) = recipient.call{value: address(this).balance}("");

		if (!success) {
			revert TransferFailed();
		}
	}

	receive() external payable {}
}
