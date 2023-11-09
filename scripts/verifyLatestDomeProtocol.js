const { ethers, run } = require("hardhat");
const { getLatestProtocolDeploy } = require("./utils");

async function main() {
	const network = await ethers.provider.getNetwork();
	const {
		DOME_PROTOCOL,
		DOME_FACTORY,
		GOVERNANCE_FACTORY,
		WRAPPEDVOTING_FACTORY,
		PRICE_TRACKER,
		BUFFER,
		REWARD_TOKEN,
	} = getLatestProtocolDeploy(network.name);

	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL.address
	);

	const domeFactoryAddress = await domeProtocol.callStatic.DOME_FACTORY();
	const governanceFactoryAddress =
		await domeProtocol.callStatic.GOVERNANCE_FACTORY();
	const wrappedVotingFactoryAddress =
		await domeProtocol.callStatic.WRAPPEDVOTING_FACTORY();
	const priceTrackerAddress = await domeProtocol.callStatic.PRICE_TRACKER();

	await run("verify:verify", {
		address: domeProtocol.address,
		constructorArguments: DOME_PROTOCOL.constructorArguments,
	});

	await run("verify:verify", {
		address: domeFactoryAddress,
		constructorArguments: DOME_FACTORY.constructorArguments,
	});

	await run("verify:verify", {
		address: governanceFactoryAddress,
		constructorArguments: GOVERNANCE_FACTORY.constructorArguments,
	});

	await run("verify:verify", {
		address: wrappedVotingFactoryAddress,
		constructorArguments: WRAPPEDVOTING_FACTORY.constructorArguments,
	});

	await run("verify:verify", {
		address: priceTrackerAddress,
		constructorArguments: PRICE_TRACKER.constructorArguments,
	});

	await run("verify:verify", {
		address: BUFFER.address,
		constructorArguments: BUFFER.constructorArguments,
	});

	await run("verify:verify", {
		address: REWARD_TOKEN.address,
		constructorArguments: REWARD_TOKEN.constructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
