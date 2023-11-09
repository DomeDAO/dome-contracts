require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const { POLYGON } = require("../test/constants");
const { getProtocolEnvVars } = require("../config");
const { writeDeploy } = require("./utils");

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

	const UNISWAP_ROUTER = POLYGON.ADDRESSES.SUSHI_ROUTER02;
	const USDC = POLYGON.ADDRESSES.USDC;

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
			// rl.close();
			resolve(ans);
		})
	);

	console.log("Deploying contracts...");
	let nonce = await deployer.getTransactionCount();
	const [domeFactory, governanceFactory, wrappedVotingFactory, priceTracker] =
		await Promise.all([
			DomeFactory.deploy({ nonce: nonce }),
			GovernanceFactory.deploy({ nonce: ++nonce }),
			WrappedVotingFactory.deploy({ nonce: ++nonce }),
			PriceTrackerFactory.deploy(...priceTrackerConstructorArguments, {
				nonce: ++nonce,
			}),
		]);

	console.log("\nDeployment addresses: ");
	console.log(`- DomeFactory: ${domeFactory.address}`);
	console.log(`- GovernanceFactory: ${governanceFactory.address}`);
	console.log(`- WrappedVotingFactory: ${wrappedVotingFactory.address}`);
	console.log(`- PriceTracker: ${priceTracker.address}`);

	const domeCreationFee = DOME_CREATION_FEE;
	const systemOwnerPercentage = SYSTEM_OWNER_PERCENTAGE;
	const systemOwner = SYSTEM_OWNER;

	console.log(`\nDeploying DomeProtocol  with the following parameters:`);
	console.log(
		`- Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(`- SystemOwner: ${systemOwner}`);
	console.log(`- System owner percentage: ${systemOwnerPercentage / 10000} %`);
	console.log(`- DomeFactory: ${domeFactory.address}`);
	console.log(`- GovernanceFactory: ${governanceFactory.address}`);
	console.log(`- WrappedVotingFactory: ${wrappedVotingFactory.address}`);
	console.log(`- PriceTracker: ${priceTracker.address}`);

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed...", (ans) => {
			rl.close();
			resolve(ans);
		})
	);

	const protocolConstructorArguments = [
		systemOwner,
		domeFactory.address,
		governanceFactory.address,
		wrappedVotingFactory.address,
		priceTracker.address,
		systemOwnerPercentage,
		domeCreationFee,
	];

	const domeProtocol = await DomeProtocol.connect(deployer).deploy(
		...protocolConstructorArguments
	);

	await domeProtocol.deployed();
	const bufferAddress = await domeProtocol.callStatic.BUFFER();
	const rewardTokenAddress = await domeProtocol.REWARD_TOKEN();

	console.log(`DomeProtocol was deployed at ${domeProtocol.address}`);
	console.log(`- BUFFER at ${bufferAddress}`);
	console.log(`- REWARD_TOKEN at ${rewardTokenAddress}`);

	const deployment = {
		DOME_PROTOCOL: {
			address: domeProtocol.address,
			constructorArguments: protocolConstructorArguments,
		},
		DOME_FACTORY: {
			address: domeFactory.address,
			constructorArguments: [],
		},
		GOVERNANCE_FACTORY: {
			address: governanceFactory.address,
			constructorArguments: [],
		},
		WRAPPEDVOTING_FACTORY: {
			address: wrappedVotingFactory.address,
			constructorArguments: [],
		},
		PRICE_TRACKER: {
			address: priceTracker.address,
			constructorArguments: priceTrackerConstructorArguments,
		},
		BUFFER: {
			address: bufferAddress,
			constructorArguments: [domeProtocol.address],
		},
		REWARD_TOKEN: {
			address: rewardTokenAddress,
			constructorArguments: [domeProtocol.address],
		},
	};

	const network = await deployer.provider.getNetwork();
	writeDeploy(network.name, deployment);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
