const { ethers, run } = require("hardhat");
const { getProtocolVerifyEnvVars, getEnvVars } = require("../config");
const { getNetworkConstants } = require("../test/constants");

const {
	DOME_CREATION_FEE,
	SYSTEM_OWNER_PERCENTAGE,
	SYSTEM_OWNER,
	DOME_PROTOCOL_ADDRESS,
} = getProtocolVerifyEnvVars();

const EXPLORER_API_KEYS = {
	137: "POLYGON_API_KEY",
	80002: "POLYGON_API_KEY",
	42161: "ARBITRUM_API_KEY",
	421614: "ARBITRUM_API_KEY",
};

async function main() {
	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL_ADDRESS
	);
	const network = await ethers.provider.getNetwork();
	const apiKeyEnv = EXPLORER_API_KEYS[network.chainId];

	if (apiKeyEnv) {
		getEnvVars([apiKeyEnv]);
	}

	const networkConfig = getNetworkConstants(network.chainId);

	if (!networkConfig) {
		throw new Error(`Unsupported network with chainId ${network.chainId}`);
	}

	const usdcAddress = networkConfig.ADDRESSES?.USDC;

	if (!usdcAddress) {
		throw new Error(
			`Missing USDC address configuration for chainId ${network.chainId}`
		);
	}

	console.log("Verifying DomeProtocol...");
	console.log("DomeProtocolAddress: ", domeProtocol.address);
	const domeFactoryAddress = await domeProtocol.callStatic.DOME_FACTORY();
	const governanceFactoryAddress =
		await domeProtocol.callStatic.GOVERNANCE_FACTORY();
	const wrappedVotingFactoryAddress =
		await domeProtocol.callStatic.WRAPPEDVOTING_FACTORY();

	const domeProtocolConstructorArguments = [
		SYSTEM_OWNER,
		domeFactoryAddress,
		governanceFactoryAddress,
		wrappedVotingFactoryAddress,
		SYSTEM_OWNER_PERCENTAGE,
		DOME_CREATION_FEE,
		usdcAddress,
	];

	await run("verify:verify", {
		address: domeProtocol.address,
		constructorArguments: domeProtocolConstructorArguments,
	});

	await run("verify:verify", {
		address: domeFactoryAddress,
		constructorArguments: [],
	});

	await run("verify:verify", {
		address: governanceFactoryAddress,
		constructorArguments: [],
	});

	await run("verify:verify", {
		address: wrappedVotingFactoryAddress,
		constructorArguments: [],
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
