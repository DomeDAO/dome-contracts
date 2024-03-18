require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const {
	POLYGON: { MAINNET },
} = require("../test/constants");
const { getProtocolEnvVars } = require("../config");
const { writeDeploy, getGasPrice } = require("./utils");

const { DOME_CREATION_FEE, SYSTEM_OWNER_PERCENTAGE, SYSTEM_OWNER } =
	getProtocolEnvVars();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function main() {
	const [deployer] = await ethers.getSigners();

	const [
		DomeFactory,
	] = await Promise.all([
		ethers.getContractFactory("DomeFactory"),
	]);

	console.log("You are going to deploy:\n");
	console.log("- DomeFactory");

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed...", (ans) => {
			resolve(ans);
		})
	);

	console.log("Deploying contracts...");
	let gasPrice = await getGasPrice(10); // Increases by %
	let nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
	const [domeFactory] =
		await Promise.all([
			DomeFactory.deploy({ nonce: nonce, gasPrice }),
		]);
	console.log("Successfully deployed factories...");

	console.log("\nDeployment addresses: ");
	console.log(`- DomeFactory: ${domeFactory.address}`);

	await Promise.all([
		domeFactory.deployed(),
	]);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
