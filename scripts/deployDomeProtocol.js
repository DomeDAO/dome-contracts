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
		GovernanceFactory,
		WrappedVotingFactory,
		PriceTrackerFactory,
		DomeProtocol,
	] = await Promise.all([
		ethers.getContractFactory("DomeFactory"),
		ethers.getContractFactory("GovernanceFactory"),
		ethers.getContractFactory("WrappedVotingFactory"),
		ethers.getContractFactory("PriceTracker"),
		ethers.getContractFactory("DomeProtocol"),
	]);

	const UNISWAP_ROUTER = MAINNET.ADDRESSES.SUSHI_ROUTER_02;
	const USDC = MAINNET.ADDRESSES.USDC;

	const priceTrackerConstructorArguments = [UNISWAP_ROUTER, USDC];

	console.log("You are going to deploy:\n");
	console.log("- DomeFactory");
	console.log("- GovernanceFactory");
	console.log("- WrappedVotingFactory");
	console.log(
		`- PriceTracker with UniswapLike proxy contract at ${UNISWAP_ROUTER}`
	);

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed...", (ans) => {
			resolve(ans);
		})
	);

	console.log("Deploying contracts...");
	let gasPrice = await getGasPrice(10); // Increases by %
	// let nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
	// const [domeFactory, governanceFactory, wrappedVotingFactory, priceTracker] =
	// 	await Promise.all([
	// 		DomeFactory.deploy({ nonce: nonce, gasPrice }),
	// 		GovernanceFactory.deploy({ nonce: ++nonce, gasPrice }),
	// 		WrappedVotingFactory.deploy({ nonce: ++nonce, gasPrice }),
	// 		PriceTrackerFactory.deploy(...priceTrackerConstructorArguments, {
	// 			nonce: ++nonce,
	// 			gasPrice
	// 		}),
	// 	]);
	// console.log("Successfully deployed factories...");

	const wrappedVotingFactory = await WrappedVotingFactory.deploy({ gasPrice });

	console.log("WVF: ", wrappedVotingFactory.address);

	process.exit(1);

	// console.log("\nDeployment addresses: ");
	// console.log(`- DomeFactory: ${domeFactory.address}`);
	// console.log(`- GovernanceFactory: ${governanceFactory.address}`);
	// console.log(`- WrappedVotingFactory: ${wrappedVotingFactory.address}`);
	// console.log(`- PriceTracker: ${priceTracker.address}`);

	// console.log(`\nDeploying DomeProtocol  with the following parameters:`);
	// console.log(
	// 	`- Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	// );
	// console.log(`- SystemOwner: ${systemOwner}`);
	// console.log(`- System owner percentage: ${systemOwnerPercentage / 10000} %`);
	// console.log(`- DomeFactory: ${domeFactory.address}`);
	// console.log(`- GovernanceFactory: ${governanceFactory.address}`);
	// console.log(`- WrappedVotingFactory: ${wrappedVotingFactory.address}`);
	// console.log(`- PriceTracker: ${priceTracker.address}`);

	// await Promise.all([
	// 	domeFactory.deployed(),
	// 	governanceFactory.deployed(),
	// 	wrappedVotingFactory.deployed(),
	// 	priceTracker.deployed(),
	// ]);

	// await new Promise((resolve) =>
	// 	rl.question("\nPress any key to proceed...", (ans) => {
	// 		rl.close();
	// 		resolve(ans);
	// 	})
	// );

	// const protocolConstructorArguments = [
	// 	systemOwner,
	// 	domeFactory.address,
	// 	governanceFactory.address,
	// 	wrappedVotingFactory.address,
	// 	priceTracker.address,
	// 	systemOwnerPercentage,
	// 	domeCreationFee,
	// ];


	// console.log("Deploying Dome protocol....");

	// let gasPrice = await getGasPrice(10); // Increases by %
	// nonce = await deployer.getTransactionCount();
	// const domeProtocol = await DomeProtocol.connect(deployer).deploy(
	// 	...protocolConstructorArguments,
	// 	{ gasPrice, nonce }
	// );

	// await domeProtocol.deployed();
	// const bufferAddress = await domeProtocol.callStatic.BUFFER();
	// const rewardTokenAddress = await domeProtocol.callStatic.REWARD_TOKEN();

	// console.log(`DomeProtocol was deployed at ${domeProtocol.address}`);
	// console.log(`- BUFFER at ${bufferAddress}`);
	// console.log(`- REWARD_TOKEN at ${rewardTokenAddress}`);

	// const deployment = {
	// 	DOME_PROTOCOL: {
	// 		address: domeProtocol.address,
	// 		constructorArguments: protocolConstructorArguments,
	// 	},
	// 	DOME_FACTORY: {
	// 		address: domeFactory.address,
	// 		constructorArguments: [],
	// 	},
	// 	GOVERNANCE_FACTORY: {
	// 		address: governanceFactory.address,
	// 		constructorArguments: [],
	// 	},
	// 	WRAPPEDVOTING_FACTORY: {
	// 		address: wrappedVotingFactory.address,
	// 		constructorArguments: [],
	// 	},
	// 	PRICE_TRACKER: {
	// 		address: priceTracker.address,
	// 		constructorArguments: priceTrackerConstructorArguments,
	// 	},
	// 	BUFFER: {
	// 		address: bufferAddress,
	// 		constructorArguments: [domeProtocol.address],
	// 	},
	// 	REWARD_TOKEN: {
	// 		address: rewardTokenAddress,
	// 		constructorArguments: [domeProtocol.address],
	// 	},
	// };

	// const network = await deployer.provider.getNetwork();
	// writeDeploy(network.name, deployment);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
