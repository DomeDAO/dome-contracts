// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IHyperliquidVaultMetadata {
	function asset() external view returns (address);
}

/**
 * @title HyperliquidBuffer
 * @notice Holds reserves produced by Hyperliquid vaults and releases funds for winning projects.
 *         Each vault must be registered alongside its governance contract before interacting.
 */
contract HyperliquidBuffer is Ownable {
	using SafeERC20 for IERC20;

	struct VaultConfig {
		bool registered;
		address governance;
		address asset;
	}

	mapping(address => VaultConfig) public vaultConfigs;
	mapping(address => uint256) private _vaultReserves;

	event VaultRegistered(
		address indexed vault,
		address indexed governance,
		address indexed asset
	);
	event GovernanceUpdated(address indexed vault, address indexed governance);
	event ReserveIn(address indexed vault, uint256 amount);
	event ReserveOut(address indexed vault, address indexed wallet, uint256 amount);

	error VaultNotRegistered();
	error UnauthorizedGovernance();
	error InvalidConfiguration();
	error InsufficientReserve();

	function registerVault(
		address vault,
		address governance,
		address asset
	) external onlyOwner {
		if (vault == address(0) || asset == address(0)) {
			revert InvalidConfiguration();
		}

		vaultConfigs[vault] = VaultConfig({
			registered: true,
			governance: governance,
			asset: asset
		});

		emit VaultRegistered(vault, governance, asset);
	}

	function updateGovernance(address vault, address governance) external onlyOwner {
		VaultConfig storage config = vaultConfigs[vault];
		if (!config.registered) {
			revert VaultNotRegistered();
		}

		config.governance = governance;
		emit GovernanceUpdated(vault, governance);
	}

	function addReserve(uint256 amount) external {
		VaultConfig storage config = vaultConfigs[msg.sender];
		if (!config.registered) {
			revert VaultNotRegistered();
		}

		_vaultReserves[msg.sender] += amount;
		emit ReserveIn(msg.sender, amount);
	}

	function submitTransfer(
		address vault,
		address token,
		address wallet,
		uint256 amount
	) external returns (uint256) {
		VaultConfig storage config = vaultConfigs[vault];
		if (!config.registered) {
			revert VaultNotRegistered();
		}

		if (config.governance != msg.sender || msg.sender == address(0)) {
			revert UnauthorizedGovernance();
		}

		if (config.asset != token) {
			revert InvalidConfiguration();
		}

		if (_vaultReserves[vault] < amount) {
			revert InsufficientReserve();
		}

		_vaultReserves[vault] -= amount;
		IERC20(token).safeTransfer(wallet, amount);
		emit ReserveOut(vault, wallet, amount);
		return amount;
	}

	function vaultReserves(address vault) external view returns (uint256) {
		return _vaultReserves[vault];
	}
}

