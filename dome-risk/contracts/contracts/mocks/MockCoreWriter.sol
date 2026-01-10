// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IHyperliquidCoreWriter } from "../hyperliquid/interfaces/IHyperliquidCoreWriter.sol";

contract MockCoreWriter is IHyperliquidCoreWriter {
    event RawActionSent(bytes data);

    bytes[] private actions;

    function sendRawAction(bytes calldata data) external override {
        actions.push(data);
        emit RawActionSent(data);
    }

    function lastAction() external view returns (bytes memory) {
        if (actions.length == 0) {
            return bytes("");
        }
        return actions[actions.length - 1];
    }

    function actionCount() external view returns (uint256) {
        return actions.length;
    }
}


