require("dotenv").config();



const { ethers, run } = require("hardhat");
const {
	POLYGON: { AMOY },
} = require("../test/constants");
const {
	addLiquidityETH,
	mint,
	convertDurationToBlocks,
} = require("../test/utils");
const {
	writeDeploy,
	getGasPrice,
	getLatestDomeDeploy,
	getLatestProtocolDeploy,
} = require("./utils");

async function main() {
	const [deployer] = await ethers.getSigners();

	const { fakeERC4626: yieldProtocol, domeProtocol } =
		await deployProtocol(deployer);
	await deployDome(deployer, domeProtocol, yieldProtocol.address);
	console.log("\nFinished deployment.");

	console.log("\nStarting verification in 20s");
	await new Promise((r) => setTimeout(r, 20000));
	console.log("Starting verification...");
	const network = await deployer.provider.getNetwork();

	await verifyDome(network);
	await verifyProtocol(network);
}

async function deployProtocol(deployer) {
	const [
		DomeFactory,
		GovernanceFactory,
		WrappedVotingFactory,
		PriceTrackerFactory,
		DomeProtocol,
		FakeERC4626Factory,
	] = await Promise.all([
		ethers.getContractFactory("DomeFactory"),
		ethers.getContractFactory("GovernanceFactory"),
		ethers.getContractFactory("WrappedVotingFactory"),
		ethers.getContractFactory("PriceTracker"),
		ethers.getContractFactory("DomeProtocol"),
		ethers.getContractFactory("FakeERC4626"),
	]);

	const UNISWAP_ROUTER = AMOY.ADDRESSES.SUSHI_ROUTER_02;
	const UNDERLYING_ASSET = AMOY.ADDRESSES.USDC;

	let nonce = await deployer.getTransactionCount();
	let gasPrice = await getGasPrice(10);
	const priceTrackerConstructorArguments = [UNISWAP_ROUTER, UNDERLYING_ASSET];
	const [
		domeFactory,
		governanceFactory,
		wrappedVotingFactory,
		priceTracker,
		fakeERC4626,
	] = await Promise.all([
		DomeFactory.deploy({ gasPrice, nonce }),
		GovernanceFactory.deploy({ gasPrice, nonce }),
		WrappedVotingFactory.deploy({ gasPrice, nonce }),
		PriceTrackerFactory.deploy(...priceTrackerConstructorArguments, { gasPrice, nonce }),
		FakeERC4626Factory.deploy(UNDERLYING_ASSET, "ERC4626 Faker", "fERC4626", { gasPrice, nonce }),
	]);

	await mint(UNDERLYING_ASSET, deployer, ethers.utils.parseEther("2000"));
	await addLiquidityETH(
		deployer,
		UNDERLYING_ASSET,
		ethers.utils.parseUnits("100", 6),
		ethers.utils.parseEther("0.001")
	);

	const domeCreationFee = ethers.utils.parseEther("0");
	const systemOwnerPercentage = 0;

	const protocolConstructorArguments = [
		deployer.address,
		domeFactory.address,
		governanceFactory.address,
		wrappedVotingFactory.address,
		priceTracker.address,
		systemOwnerPercentage,
		domeCreationFee,
	];

	const domeProtocol = await DomeProtocol.deploy(
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

	return {
		domeProtocol,
		fakeERC4626,
		bufferAddress,
	};
}

async function deployDome(deployer, domeProtocol, yieldProtocol) {
	const domeCreationFee = await domeProtocol.callStatic.domeCreationFee();
	const bufferAddress = await domeProtocol.callStatic.BUFFER();

	const domeInfo = {
		CID: "<DOME_CID>",
		tokenName: "<DOME_TOKEN_NAME>",
		tokenSymbol: "<DOME_TOKEN_SYMBOL>",
	};

	const bufferBeneficiary = {
		beneficiaryCID: "BUFFER",
		wallet: bufferAddress,
		percent: 10000,
	};

	const beneficiariesInfo = [bufferBeneficiary];

	const governanceSettings = {
		votingDelay: convertDurationToBlocks("0"),
		votingPeriod: convertDurationToBlocks("6 month"),
		proposalThreshold: 1,
	};

	const depositorYieldPercent = 0;

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

	const tx = await domeProtocol
		.connect(deployer)
		.createDome(...domeCreationArguments, {
			value: domeCreationFee,
		});

	await tx.wait();

	console.log(`Dome was deployed at: ${domeAddress}`);
	console.log("YieldProtocol: ", yieldProtocol);

	const dome = await ethers.getContractAt("Dome", domeAddress);
	const underlyingAsset = await dome.callStatic.asset();
	console.log("UnderlyingAsset: ", underlyingAsset);

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
			address: domeAddress,
			constructorArguments: domeConstructorArguments,
		},
	};

	const governanceAddress =
		await domeProtocol.callStatic.domeGovernance(domeAddress);

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

		const wrappedConstructorArguments = [domeAddress];

		deployment.GOVERNANCE = {
			address: governanceAddress,
			constructorArguments: governanceConstructorArguments,
		};

		deployment.WRAPPED_VOTING = {
			address: wrappedVotingAddress,
			constructorArguments: wrappedConstructorArguments,
		};

		console.log(`WRappedVoting deployed at: ${wrappedVotingAddress}`);
		console.log(`Governance deployed at: ${governanceAddress}`);
	}

	const network = await deployer.provider.getNetwork();
	writeDeploy(network.name, deployment);

	return {
		domeAddress: domeAddress,
	};
}

async function verifyDome(network) {
	const deployment = getLatestDomeDeploy(network.name);

	for (const key of Object.keys(deployment)) {
		await run("verify:verify", {
			address: deployment[key].address,
			constructorArguments: deployment[key].constructorArguments,
		});
	}
}

async function verifyProtocol(network) {
	const deployment = getLatestProtocolDeploy(network.name);

	for (const key of Object.keys(deployment)) {
		await run("verify:verify", {
			address: deployment[key].address,
			constructorArguments: deployment[key].constructorArguments,
		});
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
