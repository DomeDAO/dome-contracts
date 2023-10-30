require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const { POLYGON } = require("../test/constants");
const { getProtocolEnvVars } = require("../config");

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

	const [domeFactory, governanceFactory, wrappedVotingFactory, priceTracker] =
		await Promise.all([
			DomeFactory.deploy(),
			GovernanceFactory.deploy(),
			WrappedVotingFactory.deploy(),
			PriceTrackerFactory.deploy(UNISWAP_ROUTER, USDC),
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
		`Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(`- SystemOwner: ${systemOwner}`);
	console.log(`- System owner percentage: ${systemOwnerPercentage / 10000} %`);
	console.log(`- DomeFactory: ${domeFactory.address}`);
	console.log(`- GovernanceFactory: ${governanceFactory.address}`);
	console.log(`- WrappedVotingFactory: ${wrappedVotingFactory.address}`);
	console.log(`- PriceTracker: ${priceTracker.address}`);

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed ?", (ans) => {
			rl.close();
			resolve(ans);
		})
	);

	const domeProtocol = await DomeProtocol.connect(deployer).deploy(
		systemOwner,
		domeFactory.address,
		governanceFactory.address,
		wrappedVotingFactory.address,
		priceTracker.address,
		systemOwnerPercentage,
		domeCreationFee
	);

	await domeProtocol.deployed();
	const bufferAddress = await domeProtocol.callStatic.BUFFER();
	const rewardTokenAddress = await domeProtocol.REWARD_TOKEN();

	console.log(`DomeProtocol was deployed at ${domeProtocol.address}`);
	console.log(`- BUFFER at ${bufferAddress}`);
	console.log(`- REWARD_TOKEN at ${rewardTokenAddress}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
