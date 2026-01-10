// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Minimal interface for Hyperliquid's CoreWriter system contract described at
 * https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm/interacting-with-hypercore
 */
interface IHyperliquidCoreWriter {
    function sendRawAction(bytes calldata data) external;
}


