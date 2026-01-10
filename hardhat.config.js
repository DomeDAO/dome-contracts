require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ledger");


const {
	POLYGON_RPC_URL,
	POLYGON_API_KEY,
	COINMARKETCAP_API,
	MAINNET_RPC_URL,
	MAINNET_API_KEY,
	DEPLOY_PRIV_KEY,
	GOERLI_RPC_URL,
	AMOY_RPC_URL,
	ARBITRUM_RPC_URL,
	ARBITRUM_SEPOLIA_RPC_URL,
	ARBITRUM_API_KEY,
	ENABLE_HARDHAT_FORKING,
} = process.env;

const normalizePrivateKey = (key) => {
    if (!key) {
        return undefined;
    }

    const trimmed = key.trim();

    if (trimmed.length === 0) {
        return undefined;
    }

    const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;

    return prefixed.length === 66 ? prefixed : undefined;
};

const deployerPrivateKey = normalizePrivateKey(DEPLOY_PRIV_KEY);
const deployerAccounts = deployerPrivateKey ? [deployerPrivateKey] : undefined;

const shouldForkPolygon =
	ENABLE_HARDHAT_FORKING === "true" && Boolean(POLYGON_RPC_URL);

const hardhatNetwork = {
    accounts: {
        count: 10,
        accountsBalance: "1000000000000000000000000",
    },
    chainId: 137,
};

if (shouldForkPolygon) {
	hardhatNetwork.forking = {
		url: POLYGON_RPC_URL,
	};
}

module.exports = {
	defaultNetwork: "hardhat",
	paths: {
		cache: "./hh-cache",
		artifacts: "./artifacts",
		sources: "./dome-safe",
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
		hardhat: hardhatNetwork,
		polygon: {
			chainId: 137,
			url: POLYGON_RPC_URL || "",
			ledgerAccounts: [
				"0x9bDca32FAFbAcB2D937A2d3538C7b8ECA3e59946",
			],
		},
        arbitrumOne: {
            chainId: 42161,
            url: ARBITRUM_RPC_URL || "",
            ...(deployerAccounts ? { accounts: deployerAccounts } : {}),
        },
        mainnet: {
            url: MAINNET_RPC_URL || "",
            ...(deployerAccounts ? { accounts: deployerAccounts } : {}),
        },
        goerli: {
            url: GOERLI_RPC_URL || "",
            ...(deployerAccounts ? { accounts: deployerAccounts } : {}),
        },
        amoy: {
            chainId: 80002,
            url: AMOY_RPC_URL || "",
            ...(deployerAccounts ? { accounts: deployerAccounts } : {}),
        },
        arbitrumSepolia: {
            chainId: 421614,
            url: ARBITRUM_SEPOLIA_RPC_URL || "",
            ...(deployerAccounts ? { accounts: deployerAccounts } : {}),
        },
		node_network: {
			url: "http://127.0.0.1:8545/",
		},
	},
	gasReporter: {
		enabled: true,
		currency: "USD",
		token: "ETH",
		coinmarketcap: COINMARKETCAP_API,
		gasPrice: 20,
	},
	etherscan: {
		apiKey: {
			polygonAmoy: POLYGON_API_KEY || "",
			polygon: POLYGON_API_KEY || "",
			mainnet: MAINNET_API_KEY || "",
			arbitrumOne: ARBITRUM_API_KEY || "",
			arbitrumSepolia: ARBITRUM_API_KEY || "",
		},
		customChains: [
			{
				network: "polygonAmoy",
				chainId: 80002,
				urls: {
					apiURL:
						"https://www.oklink.com/api/explorer/v1/contract/verify/async/api/polygonAmoy",
					browserURL: "https://www.oklink.com/polygonAmoy",
				},
			}
		]
	},
	typechain: {
		outDir: "typechain",
		target: "ethers-v5",
	},
	mocha: {
		timeout: 10000000,
	},
};
