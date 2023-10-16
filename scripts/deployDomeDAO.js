const { ethers } = require("hardhat");
const readline = require("readline");

async function main() {
	const [deployer] = await ethers.getSigners();

	const DomeFactory = await ethers.getContractFactory("DomeFactory");
	const GovernanceFactory =
		await ethers.getContractFactory("GovernanceFactory");
	const DomeDAO = await ethers.getContractFactory("DomeDAO");

	const domeFactory = await DomeFactory.deploy();
	const governanceFactory = await GovernanceFactory.deploy();

	await Promise.all([domeFactory.deployed(), governanceFactory.deployed()]);

	console.log(
		`DomeFactory was successfully deployed at : ${domeFactory.address}`
	);
	console.log(
		`GovernanceFactory was successfully deployed at : ${governanceFactory.address}`
	);

	const domeCreationFee = ethers.utils.parseEther("1");
	const systemOwnerPercentage = 1000;
	const systemOwner = deployer.address;

	console.log(`\nDeploying DomeDAO with the following parameters:`);
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

	const domeDAO = await DomeDAO.deploy(
		systemOwner,
		domeFactory.address,
		governanceFactory.address,
		systemOwnerPercentage,
		domeCreationFee
	);

	await domeDAO.deployed();
	const bufferAddress = await domeDAO.callStatic.BUFFER();

	console.log(
		`DomeDAO was successfully deployed at ${domeDAO.address} with BUFFER at ${bufferAddress}`
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
