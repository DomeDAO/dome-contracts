const ETHEREUM = require("./ethereum");
const POLYGON = require("./polygon");
const ARBITRUM = require("./arbitrum");

const NETWORKS_BY_CHAIN = {
	1: ETHEREUM.MAINNET,
	137: POLYGON.MAINNET,
	80002: POLYGON.AMOY,
	42161: ARBITRUM.ONE,
	421614: ARBITRUM.SEPOLIA,
};

function getNetworkConstants(chainId) {
	return NETWORKS_BY_CHAIN[chainId];
}

module.exports = {
	ETHEREUM,
	POLYGON,
	ARBITRUM,
	getNetworkConstants,
};
