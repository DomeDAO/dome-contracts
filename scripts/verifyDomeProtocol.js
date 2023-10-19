const { ethers, run } = require("hardhat");

const {
	DOME_CREATION_FEE,
	SYSTEM_OWNER_PERCENTAGE,
	SYSTEM_OWNER,
	DOME_PROTOCOL_ADDRESS,
} = process.env;

async function main() {
	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL_ADDRESS
	);

	const governanceFactory = await domeProtocol.callStatic.GOVERNANCE_FACTORY();
	const domeFactory = await domeProtocol.callStatic.DOME_FACTORY();

	const constructorArguments = domeProtocol.interface.encodeDeploy(
		SYSTEM_OWNER,
		domeFactory,
		governanceFactory,
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
