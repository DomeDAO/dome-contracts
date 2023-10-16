const { ethers } = require("hardhat");
const readline = require("readline");
const { POLYGON } = require("../test/constants");

async function main() {
	const [deployer] = await ethers.getSigners();

	const domeDAOAddress = "0x24C17bf9Af7A0e372D8B3571dBa12C216Bc44E42";

	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol ",
		domeDAOAddress
	);

	const domeCreationFee = await domeProtocol.callStatic.domeCreationFee();

	const CID = "dome";
	const tokenName = "domeToken";
	const tokenSymbol = "domeToken";
	const domeInfo = { CID, tokenName, tokenSymbol };

	const beneficiaryCID = "beneficiary";
	const beneficiaryAddress = "0x05868Fb297322a3b75Bea5DFa9cF2eb13Fb427C6";
	const beneficiaryPercent = 10000;

	const beneficiary = {
		beneficiaryCID,
		wallet: beneficiaryAddress,
		percent: beneficiaryPercent,
	};

	const beneficiariesInfo = [beneficiary];
	const yieldProtocol = POLYGON.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
	const depositorYieldPercent = 1000;

	console.log(`Deploying Dome with the following parameters:`);
	console.log(`DomeInfo: ${JSON.stringify(domeInfo)}`);
	console.log(`BeneficiariesInfo: ${JSON.stringify(beneficiariesInfo)}`);
	console.log(
		`Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(`Depositor yield percentage: ${depositorYieldPercent / 10000} %`);

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
