require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const {
	HARDHAT_DEV_MNEMONIC,
	POLYGON_RPC_URL,
	POLYGON_API_KEY,
	COINMARKETCAP_API,
	MAINNET_RPC_URL,
	MAINNET_API_KEY,
	DEPLOY_PRIV_KEY,
	GOERLI_RPC_URL,
	MUMBAI_RPC_URL,
} = process.env;

module.exports = {
	defaultNetwork: "hardhat",
	paths: {
		cache: "./hh-cache",
		artifacts: "./artifacts",
		sources: "./contracts",
		tests: "./test",
	},
	solidity: {
		version: "0.8.20",
		settings: {
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	networks: {
		hardhat: {
			accounts: {
				mnemonic: HARDHAT_DEV_MNEMONIC,
				count: 10,
				accountsBalance: "1000000000000000000000000",
			},
			forking: {
				url: POLYGON_RPC_URL || "",
			},
			chainId: 137,
		},
		polygon: {
			chainId: 137,
			url: POLYGON_RPC_URL || "",
			accounts: DEPLOY_PRIV_KEY ? [DEPLOY_PRIV_KEY] : [],
		},
		mainnet: {
			url: MAINNET_RPC_URL || "",
			accounts: DEPLOY_PRIV_KEY ? [DEPLOY_PRIV_KEY] : [],
		},
		goerli: {
			url: GOERLI_RPC_URL || "",
			accounts: DEPLOY_PRIV_KEY ? [DEPLOY_PRIV_KEY] : [],
		},
		mumbai: {
			url: MUMBAI_RPC_URL || "",
			accounts: DEPLOY_PRIV_KEY ? [DEPLOY_PRIV_KEY] : [],
		},
		node_network: {
			url: "http://127.0.0.1:8545/",
		},
	},
	gasReporter: {
		enabled: false,
		currency: "USD",
		token: "ETH",
		coinmarketcap: COINMARKETCAP_API,
		gasPrice: 20,
	},
	etherscan: {
		apiKey: {
			polygon: POLYGON_API_KEY || "",
			mainnet: MAINNET_API_KEY || "",
		},
	},
	typechain: {
		outDir: "typechain",
		target: "ethers-v5",
	},
	mocha: {
		timeout: 10000000,
	},
};
