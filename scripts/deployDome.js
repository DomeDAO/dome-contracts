require("dotenv").config();
const { ethers } = require("hardhat");
const readline = require("readline");
const { POLYGON } = require("../test/constants");
const { getDomeEnvVars } = require("../config");
const { writeDeploy, getGasPrice } = require("./utils");
const { convertDurationToBlocks } = require("../test/utils");
const { DOME_PROTOCOL_ADDRESS } = getDomeEnvVars();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function main() {
	const [deployer] = await ethers.getSigners();

	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL_ADDRESS
	);

	const domeCreationFee = await domeProtocol.callStatic.domeCreationFee();
	const bufferAddress = await domeProtocol.callStatic.BUFFER();

	const domeInfo = {
		CID: "FIRST_DOME",
		tokenName: "Dome First Token",
		tokenSymbol: "DFT",
	};

	const bufferBeneficiary = {
		beneficiaryCID: "BUFFER",
		wallet: bufferAddress,
		percent: 10000, // 10000= 100.00
	};

	// Percentage of beneficiaries should sum up to 10.000, or the deployment will be failed
	const beneficiariesInfo = [bufferBeneficiary];

	// convertDurationToBlocks function understands only predefined time ranges
	// such as: minute, hour, day, week, month
	// without any time range specified it will be parsed as secs
	const governanceSettings = {
		votingDelay: convertDurationToBlocks(process.env.VOTING_DELAY),
		votingPeriod: convertDurationToBlocks(process.env.VOTING_PERIOD),
		proposalThreshold: 1,
	};

	const yieldProtocol = POLYGON.MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC;
	const depositorYieldPercent = process.env.DEPOSITOR_YIELD_PERCENTAGE || 0;

	console.log(`Deploying Dome with the following parameters:`);
	console.log(`- DomeInfo: ${JSON.stringify(domeInfo)}`);
	console.log(`- BeneficiariesInfo: ${JSON.stringify(beneficiariesInfo)}`);
	console.log(
		`- Dome creation fee: ${ethers.utils.formatEther(domeCreationFee)} eth.`
	);
	console.log(`- Yield protocol: ${yieldProtocol}`);
	console.log(
		`- Depositor yield percentage: ${depositorYieldPercent / 10000} %`
	);
	console.log(`- Dome Owner: ${deployer.address}`);
	console.log(`----------Governance----------`);
	console.log(`- Voting Delay: ${governanceSettings.votingDelay} `);
	console.log(`- Voting Period: ${governanceSettings.votingPeriod} `);
	console.log(
		`- Voting Proposal Threshold: ${governanceSettings.proposalThreshold} `
	);

	await new Promise((resolve) =>
		rl.question("\nPress any key to proceed...", (ans) => {
			rl.close();
			resolve(ans);
		})
	);

	const domeCreationArguments = [
		domeInfo,
		beneficiariesInfo,
		governanceSettings,
		depositorYieldPercent,
		yieldProtocol,
	];

	const domeAddress = await domeProtocol
		.connect(deployer)
		.callStatic.createDome(...domeCreationArguments, {
			value: domeCreationFee,
		});

	const gasPrice = await getGasPrice(10);
	console.log("GAS PRICE: ", gasPrice);
	const tx = await domeProtocol
		.connect(deployer)
		.createDome(...domeCreationArguments, { value: domeCreationFee, gasPrice });

	console.log(`Dome was deployed at: ${domeAddress}`);

	const systemOwner = await domeProtocol.callStatic.owner();
	const systemOwnerPercentage =
		await domeProtocol.callStatic.systemOwnerPercentage();
	const domeConstructorArguments = [
		domeInfo,
		beneficiariesInfo,
		yieldProtocol,
		systemOwner,
		domeProtocol.address,
		systemOwnerPercentage,
		depositorYieldPercent,
	];

	const deployment = {
		DOME: {
			protocol: domeProtocol.address,
			address: domeAddress,
			constructorArguments: domeConstructorArguments,
		},
	};

	console.log(deployment.DOME);

	const governanceAddress = await getGovernanceAddress(domeProtocol, domeAddress);

	console.log("GOVERNANCE ADDRESS: ", governanceAddress);
	if (governanceAddress !== ethers.constants.AddressZero) {
		const governance = await ethers.getContractAt(
			"DomeGovernor",
			governanceAddress
		);

		const wrappedVotingAddress = await governance.callStatic.token();
		const governanceConstructorArguments = [
			wrappedVotingAddress,
			governanceSettings.votingDelay,
			governanceSettings.votingPeriod,
			governanceSettings.proposalThreshold,
		];

		const wrappedConstructorArguments = [domeAddress, domeProtocol.address];

		deployment.GOVERNANCE = {
			address: governanceAddress,
			constructorArguments: governanceConstructorArguments,
		};

		deployment.WRAPPED_VOTING = {
			address: wrappedVotingAddress,
			constructorArguments: wrappedConstructorArguments,
		};
	}

	const network = await deployer.provider.getNetwork();

	console.log(deployment);
	writeDeploy(network.name, deployment);
}

async function getGovernanceAddress(domeProtocol, domeAddress) {
	let attempts = 5;

	for (let i = 0; i < attempts; i++) {
		const address = await domeProtocol.callStatic.domeGovernance(domeAddress);

		if (address !== ethers.constants.AddressZero) {
			return address;
		}

		console.log("PROVIDER RETURN ZERO ADDRESS FOR GOVERNANCE, TRYING AGAIN IN 5s...")
		console.log(`Attempts: ${i}/${attempts}`)
		await new Promise(resolve => setTimeout(resolve, 5000));
	}

	return ethers.constants.AddressZero;
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
