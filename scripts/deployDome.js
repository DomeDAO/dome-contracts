require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const { POLYGON } = require("../test/constants");

const { DOME_PROTOCOL_ADDRESS } = process.env;

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
	console.log(`DomeInfo: ${JSON.stringify(domeInfo)}`);
	console.log(`BeneficiariesInfo: ${JSON.stringify(beneficiariesInfo)}`);
	console.log(
		`Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(`Depositor yield percentage: ${depositorYieldPercent / 10000} %`);
	console.log(`Dome Owner: ${deployer.address}`);

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	await new Promise((resolve) =>
		rl.question("\nSubmitting ?", (ans) => {
			rl.close();
			resolve(ans);
		})
	);

	const tx = await domeProtocol
		.connect(deployer)
		.createDome(
			domeInfo,
			beneficiariesInfo,
			depositorYieldPercent,
			yieldProtocol,
			{ value: domeCreationFee }
		);
	const response = await tx.wait();

	const domeAddress = response.events.find(
		(event) =>
			event.topics[0] ===
			"0xf3e2fa62c1f52d87e22f305ca3b16beeeac792b82453f9c10b4a52e79d03db36"
	).args.domeAddress;

	console.log(`Dome was successfully deployed at: ${domeAddress}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
