const { ethers, run } = require("hardhat");
const { getDomeEnvVars, getEnvVars } = require("../config");

const { DOME_PROTOCOL_ADDRESS } = getDomeEnvVars();
getEnvVars("POLYGON_API_KEY");

async function main() {
	const domeInfo = {
		CID: "<DOME_CID>",
		tokenName: "<DOME_TOKEN_NAME>",
		tokenSymbol: "<DOME_TOKEN_SYMBOL>",
	};

	const bufferBeneficiary = {
		beneficiaryCID: "<BENEFICIARY_CID>",
		wallet: "<BENEFICIARY_WALLET_ADDRESS>",
		percent: "<BENEFICIARY_PERCENT>",
	};

	const beneficiariesInfo = [bufferBeneficiary];
	const yieldProtocol = "<YIELD_PROTOCOL>";
	const depositorYieldPercent = "<DEPOSITOR_YIELD_PERCENT>";

	const systemOwner = "<SYSTEM_OWNER>";
	const systemOwnerPercentage = "<SYSTEM_OWNER_PERCENTAGE>";
	const domeProtocolAddress = "<DOME_PROTOCOL_ADDRESS>";

	const dome = await ethers.getContractAt("Dome", DOME_PROTOCOL_ADDRESS);

	const constructorArguments = dome.interface.encodeDeploy(
		domeInfo,
		beneficiariesInfo,
		yieldProtocol,
		systemOwner,
		domeProtocolAddress,
		systemOwnerPercentage,
		depositorYieldPercent
	);

	await run("verify:verify", {
		address: dome.address,
		constructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode(1);
});
