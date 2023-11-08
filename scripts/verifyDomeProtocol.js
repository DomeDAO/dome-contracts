const { ethers, run } = require("hardhat");
const { getProtocolVerifyEnvVars, getEnvVars } = require("../config");

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

	const domeFactory = await domeProtocol.callStatic.DOME_FACTORY();
	const governanceFactory = await domeProtocol.callStatic.GOVERNANCE_FACTORY();
	const wrappedVotingFactory =
		await domeProtocol.callStatic.WRAPPEDVOTING_FACTORY();
	const priceTracker = await domeProtocol.callStatic.PRICE_TRACKER();

	const constructorArguments = domeProtocol.interface.encodeDeploy(
		SYSTEM_OWNER,
		domeFactory,
		governanceFactory,
		wrappedVotingFactory,
		priceTracker,
		SYSTEM_OWNER_PERCENTAGE,
		DOME_CREATION_FEE
	);

	await run("verify:verify", {
		address: domeProtocol.address,
		constructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
