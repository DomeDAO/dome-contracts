require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");

const { DOME_CREATION_FEE, SYSTEM_OWNER_PERCENTAGE, SYSTEM_OWNER } =
	process.env;

async function main() {
	const [deployer] = await ethers.getSigners();

	const DomeFactory = await ethers.getContractFactory("DomeFactory");
	const GovernanceFactory =
		await ethers.getContractFactory("GovernanceFactory");
	const DomeProtocol = await ethers.getContractFactory("DomeProtocol");

	const domeFactory = await DomeFactory.connect(deployer).deploy();
	const governanceFactory = await GovernanceFactory.connect(deployer).deploy();

	await Promise.all([domeFactory.deployed(), governanceFactory.deployed()]);

	console.log(
		`DomeFactory was successfully deployed at : ${domeFactory.address}`
	);
	console.log(
		`GovernanceFactory was successfully deployed at : ${governanceFactory.address}`
	);

	const domeCreationFee = DOME_CREATION_FEE;
	const systemOwnerPercentage = SYSTEM_OWNER_PERCENTAGE;
	const systemOwner = SYSTEM_OWNER;

	console.log(`\nDeploying DomeProtocol  with the following parameters:`);
	console.log(
		`Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(`SystemOwner: ${systemOwner}`);
	console.log(`System owner percentage: ${systemOwnerPercentage / 10000} %`);
	console.log(`GovernanceFactory: ${governanceFactory.address}`);
	console.log(`DomeFactory: ${domeFactory.address}`);

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

	const domeProtocol = await DomeProtocol.connect(deployer).deploy(
		systemOwner,
		domeFactory.address,
		governanceFactory.address,
		systemOwnerPercentage,
		domeCreationFee
	);

	await domeProtocol.deployed();
	const bufferAddress = await domeProtocol.callStatic.BUFFER();

	console.log(
		`DomeProtocol was successfully deployed at ${domeProtocol.address} with BUFFER at ${bufferAddress}`
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
