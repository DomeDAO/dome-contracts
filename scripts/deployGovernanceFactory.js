require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const { writeDeploy, getGasPrice } = require("./utils");

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function main() {
	const [deployer] = await ethers.getSigners();

	const GovernanceFactory =
		await ethers.getContractFactory("GovernanceFactory");

	console.log("You are going to deploy:\n");
	console.log("- DomeFactory");
	console.log("- GovernanceFactory");
	console.log("- WrappedVotingFactory");
	console.log();

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed...", (ans) => {
			resolve(ans);
		})
	);

	console.log("Deploying GovernanceFactory...");
	let gasPrice = await getGasPrice(10); // Increases by %
	let nonce = await ethers.provider.getTransactionCount(
		deployer.address,
		"latest"
	);
	const governanceFactory = GovernanceFactory.deploy({
		nonce: nonce,
		gasPrice,
	});
	console.log("Successfully GovernanceFactory...");

	console.log("\nDeployment addresses: ");
	console.log(`- GovernanceFactory: ${governanceFactory.address}`);

	await governanceFactory.deployed();

	const deployment = {
		GOVERNANCE_FACTORY: {
			address: governanceFactory.address,
			constructorArguments: [],
		},
	};

	const network = await deployer.provider.getNetwork();
	writeDeploy(network.name, deployment, "GovernanceFactory");
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
