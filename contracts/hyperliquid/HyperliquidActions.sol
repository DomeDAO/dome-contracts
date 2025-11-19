// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HyperliquidActions
 * @notice Helper utilities for encoding HyperCore actions in the format
 *         described in https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
 */
library HyperliquidActions {
	uint8 internal constant ACTION_VERSION = 0x01;

	// Common action identifiers
	uint24 internal constant ACTION_ADD_API_WALLET = 9;
	uint24 internal constant ACTION_CANCEL_ORDER_BY_OID = 10;
	uint24 internal constant ACTION_CANCEL_ORDER_BY_CLOID = 11;
	uint24 internal constant ACTION_APPROVE_BUILDER_FEE = 12;
	uint24 internal constant ACTION_SEND_ASSET = 13;
	uint24 internal constant ACTION_REFLECT_EVM_SUPPLY_CHANGE = 14; // testnet only as per docs

	error ActionEncodingTooLarge();

	/**
	 * @notice Encodes an action according to the Hyperliquid spec:
	 *         byte 0   -> version
	 *         bytes1-3 -> action id (big endian)
	 *         bytes4+  -> ABI-encoded payload
	 */
	function encodeAction(uint24 actionId, bytes memory encodedArgs)
		internal
		pure
		returns (bytes memory payload)
	{
		if (encodedArgs.length > type(uint24).max) {
			revert ActionEncodingTooLarge();
		}

		payload = new bytes(4 + encodedArgs.length);
		payload[0] = bytes1(ACTION_VERSION);
		payload[1] = bytes1(uint8(actionId >> 16));
		payload[2] = bytes1(uint8(actionId >> 8));
		payload[3] = bytes1(uint8(actionId));

		for (uint256 i = 0; i < encodedArgs.length; i++) {
			payload[4 + i] = encodedArgs[i];
		}
	}
}

