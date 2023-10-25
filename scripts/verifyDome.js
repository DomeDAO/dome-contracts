const { ethers, run } = require("hardhat");

async function main() {
	const domeAddress = "0x...0";

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

	const dome = await ethers.getContractAt("Dome", domeAddress);

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
