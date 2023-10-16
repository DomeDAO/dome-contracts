// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IDomeDAO {
	function domeCreators(address) external view returns (address);

	function governanceToDome(address) external view returns (address);
}

contract Buffer is Ownable {
	using SafeERC20 for IERC20;

	address public immutable DOME_DAO;

	// Mapping from {domeAddress} to {underlyingAssetAmount}
	mapping(address => uint256) public domeReserves;

	event ReserveIn(address dome, uint256 amount);
	event ReserveOut(address dome, uint256 amount);

	error Unauthorized();
	error TransferFailed();

	constructor(address _domeDAO) {
		DOME_DAO = _domeDAO;
	}

	modifier onlyDomes() {
		if (!_isDome(msg.sender)) {
			revert Unauthorized();
		}
		_;
	}

	modifier onlyGovernances() {
		if (!_isGovernance(msg.sender)) {
			revert Unauthorized();
		}
		_;
	}

	function _isDome(address _address) private view returns (bool) {
		return IDomeDAO(DOME_DAO).domeCreators(_address) != address(0);
	}

	function _isGovernance(address _address) private view returns (bool) {
		return IDomeDAO(DOME_DAO).governanceToDome(_address) != address(0);
	}

	function addReserve(uint256 amount) external onlyDomes {
		domeReserves[msg.sender] += amount;

		emit ReserveIn(msg.sender, amount);
	}

	function submitTransfer(
		address dome,
		address token,
		address wallet,
		uint256 amount
	) external onlyGovernances returns (uint256) {
		uint256 tokenBalance = domeReserves[dome];

		if (tokenBalance < amount) {
			revert TransferFailed();
		}

		domeReserves[dome] -= amount;
		IERC20(token).safeTransfer(wallet, amount);

		emit ReserveOut(dome, amount);

		return amount;
	}

	receive() external payable {}
}
