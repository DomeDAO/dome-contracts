// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ICoreWriter} from "../hyperliquid/ICoreWriter.sol";

contract MockCoreWriter is ICoreWriter {
	bytes public lastPayload;
	address public lastCaller;

	function sendRawAction(bytes calldata data) external override {
		lastPayload = data;
		lastCaller = msg.sender;
		emit RawAction(msg.sender, data);
	}
}

