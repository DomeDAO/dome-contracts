const { ethers, run } = require("hardhat");
const { getProtocolVerifyEnvVars, getEnvVars } = require("../config");
const { POLYGON } = require("../test/constants");

const {
	DOME_CREATION_FEE,
	SYSTEM_OWNER_PERCENTAGE,
	SYSTEM_OWNER,
	DOME_PROTOCOL_ADDRESS,
} = getProtocolVerifyEnvVars();

getEnvVars(["POLYGON_API_KEY"]);

async function main() {
	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL_ADDRESS
	);

	const domeFactoryAddress = await domeProtocol.callStatic.DOME_FACTORY();
	const governanceFactoryAddress =
		await domeProtocol.callStatic.GOVERNANCE_FACTORY();
	const wrappedVotingFactoryAddress =
		await domeProtocol.callStatic.WRAPPEDVOTING_FACTORY();
	const priceTrackerAddress = await domeProtocol.callStatic.PRICE_TRACKER();

	const domeProtocolConstructorArguments = [
		SYSTEM_OWNER,
		domeFactoryAddress,
		governanceFactoryAddress,
		wrappedVotingFactoryAddress,
		priceTrackerAddress,
		SYSTEM_OWNER_PERCENTAGE,
		DOME_CREATION_FEE,
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

	const PRICE_TRACKER_ROUTER = POLYGON.ADDRESSES.SUSHI_ROUTER02;
	const PRICE_TRACKER_TOKEN = POLYGON.ADDRESSES.USDC;

	const priceTrackerConstructorArguments = [
		PRICE_TRACKER_ROUTER,
		PRICE_TRACKER_TOKEN,
	];

	await run("verify:verify", {
		address: priceTrackerAddress,
		constructorArguments: priceTrackerConstructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
