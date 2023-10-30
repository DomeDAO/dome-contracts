require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const { POLYGON } = require("../test/constants");
const { getDomeEnvVars } = require("../config");
const { DOME_PROTOCOL_ADDRESS } = getDomeEnvVars();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function main() {
	const [deployer] = await ethers.getSigners();

	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL_ADDRESS
	);

	const domeCreationFee = await domeProtocol.callStatic.domeCreationFee();
	const bufferAddress = await domeProtocol.callStatic.BUFFER();

	const domeInfo = {
		CID: "<DOME_CID>",
		tokenName: "<DOME_TOKEN_NAME>",
		tokenSymbol: "<DOME_TOKEN_SYMBOL>",
	};

	const bufferBeneficiary = {
		beneficiaryCID: "BUFFER",
		wallet: bufferAddress,
		percent: 10000,
	};

	const beneficiariesInfo = [bufferBeneficiary];
	const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
	const depositorYieldPercent = 1000;

	console.log(`Deploying Dome with the following parameters:`);
	console.log(`- DomeInfo: ${JSON.stringify(domeInfo)}`);
	console.log(`- BeneficiariesInfo: ${JSON.stringify(beneficiariesInfo)}`);
	console.log(
		`- Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(
		`- Depositor yield percentage: ${depositorYieldPercent / 10000} %`
	);
	console.log(`- Dome Owner: ${deployer.address}`);

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed ?", (ans) => {
			rl.close();
			resolve(ans);
		})
	);

	const domeAddress = await domeProtocol
		.connect(deployer)
		.callStatic.createDome(
			domeInfo,
			beneficiariesInfo,
			depositorYieldPercent,
			yieldProtocol,
			{ value: domeCreationFee }
		);

	await domeProtocol
		.connect(deployer)
		.createDome(
			domeInfo,
			beneficiariesInfo,
			depositorYieldPercent,
			yieldProtocol,
			{ value: domeCreationFee }
		);

	console.log(`Dome was deployed at: ${domeAddress}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
