// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICoreWriter
 * @notice Minimal interface for the Hyperliquid CoreWriter system contract.
 *         The contract lives at 0x3333333333333333333333333333333333333333 on both
 *         HyperEVM mainnet and testnet per the public documentation.
 */
interface ICoreWriter {
	event RawAction(address indexed caller, bytes data);

	/**
	 * @notice Emits an encoded action that HyperCore will ingest asynchronously.
	 * @dev Implementations are expected to spend ~25k gas before emitting the log.
	 * @param data Versioned action payload (version byte + 3 byte action id + ABI-encoded args).
	 */
	function sendRawAction(bytes calldata data) external;
}

