// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DomeInfo, BeneficiaryInfo} from "./DomeCore.sol";
import {Buffer} from "./Buffer.sol";
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

		BUFFER = address(new Buffer(address(this)));
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

	function updateBuffer(address _buffer) external onlyOwner {
		BUFFER = _buffer;
	}

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

	function changeSystemOwnerPercentage(uint16 percentage) external onlyOwner {
		if (percentage > 2500) {
			revert InvalidFeePercent();
		}

		systemOwnerPercentage = percentage;
	}

	function changeDomeCreationFee(uint256 value) external onlyOwner {
		domeCreationFee = value;
	}

	function withdraw(address recipient) external onlyOwner {
		(bool success, ) = recipient.call{value: address(this).balance}("");

		if (!success) {
			revert TransferFailed();
		}
	}

	receive() external payable {}
}
