// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {DomeInfo, BeneficiaryInfo} from "./DomeCore.sol";
import {Buffer} from "./Buffer.sol";

interface IGovernanceFactory {
	function createGovernance(
		address token
	) external returns (address governanceAddress);
}

interface IDomeFactory {
	function initialize(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		address systemOwner,
		address buffer,
		address _yieldProtocol,
		uint16 systemOwnerPercentage,
		uint16 _depositorYieldPercent
	) external returns (address);
}

contract DomeDAO is Ownable {
	uint16 public systemOwnerPercentage;
	uint256 public domeCreationFee;

	mapping(address => address) public domeCreators;
	mapping(address => address) public governanceToDome;
	mapping(address => address[]) public creatorDomes;

	address public BUFFER;
	address public GOVERNANCE_FACTORY;
	address public DOME_FACTORY;
	address private _owner;

	error UnpaidFee();
	error InvalidFeePercent();
	error TransferFailed();

	event DomeCreated(
		address indexed creator,
		address domeAddress,
		address yieldProtocol,
		string CID
	);

	constructor(
		address systemOwner,
		address _domeFactory,
		address _governanceFactory,
		uint16 _systemOwnerPercentage,
		uint256 _domeCreationFee
	) {
		_transferOwnership(systemOwner);
		systemOwnerPercentage = _systemOwnerPercentage;
		domeCreationFee = _domeCreationFee;

		BUFFER = address(new Buffer(address(this)));
		DOME_FACTORY = _domeFactory;
		GOVERNANCE_FACTORY = _governanceFactory;
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
		address _governanceFactory
	) external onlyOwner {
		if (_domeFactory != address(0)) {
			DOME_FACTORY = _domeFactory;
		}

		if (_governanceFactory != address(0)) {
			GOVERNANCE_FACTORY = _governanceFactory;
		}
	}

	function createDome(
		DomeInfo memory domeInfo,
		BeneficiaryInfo[] memory beneficiariesInfo,
		uint16 _depositorYieldPercent,
		address _yieldProtocol
	) external payable payedEnough {
		address domeAddress = IDomeFactory(DOME_FACTORY).initialize(
			domeInfo,
			beneficiariesInfo,
			owner(),
			BUFFER,
			_yieldProtocol,
			systemOwnerPercentage,
			_depositorYieldPercent
		);

		address governanceAddress = IGovernanceFactory(GOVERNANCE_FACTORY)
			.createGovernance(domeAddress);

		domeCreators[domeAddress] = msg.sender;
		governanceToDome[governanceAddress] = domeAddress;
		creatorDomes[msg.sender].push(domeAddress);

		emit DomeCreated(msg.sender, domeAddress, _yieldProtocol, domeInfo.CID);
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
