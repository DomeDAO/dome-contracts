require("dotenv").config();
const { ethers, run } = require("hardhat");
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
	console.log("- GovernanceFactory");

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

	console.log("Waiting 15s before verification");
	await new Promise((resolve) => setTimeout(resolve, 15000));

	console.log("Verifying");
	await run("verify:verify", {
		address: deployment.GOVERNANCE_FACTORY.address,
		constructorArguments: deployment.GOVERNANCE_FACTORY.constructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
