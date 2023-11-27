require("dotenv").config();
const { ethers, run } = require("hardhat");
const { POLYGON } = require("../test/constants");
const { addLiquidityETH, mint } = require("../test/utils");
const {
	writeDeploy,
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
	const network = await ethers.provider.getNetwork();

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

	const UNISWAP_ROUTER = POLYGON.TESTNET.SUSHI_ROUTER_02;
	const UNDERLYING_ASSET = POLYGON.TESTNET.USDC;

	let nonce = await deployer.getTransactionCount();
	const priceTrackerConstructorArguments = [UNISWAP_ROUTER, UNDERLYING_ASSET];
	const [
		domeFactory,
		governanceFactory,
		wrappedVotingFactory,
		priceTracker,
		fakeERC4626,
	] = await Promise.all([
		DomeFactory.deploy({ nonce: nonce }),
		GovernanceFactory.deploy({ nonce: ++nonce }),
		WrappedVotingFactory.deploy({ nonce: ++nonce }),
		PriceTrackerFactory.deploy(...priceTrackerConstructorArguments, {
			nonce: ++nonce,
		}),
		FakeERC4626Factory.deploy(UNDERLYING_ASSET, "ERC4626 Faker", "fERC4626", {
			nonce: ++nonce,
		}),
	]);

	await mint(UNDERLYING_ASSET, deployer, ethers.utils.parseEther("2000"));
	await addLiquidityETH(
		deployer,
		UNDERLYING_ASSET,
		ethers.utils.parseUnits("100", 6),
		ethers.utils.parseEther("0.001")
	);

	const domeCreationFee = ethers.utils.parseEther("0");
	const systemOwnerPercentage = 1000;

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

	const depositorYieldPercent = 1000;

	const domeCreationArguments = [
		domeInfo,
		beneficiariesInfo,
		depositorYieldPercent,
		yieldProtocol,
	];

	const domeAddress = await domeProtocol
		.connect(deployer)
		.callStatic.createDome(...domeCreationArguments, {
			value: domeCreationFee,
		});

	await domeProtocol.connect(deployer).createDome(...domeCreationArguments, {
		value: domeCreationFee,
	});

	console.log(`Dome was deployed at: ${domeAddress}`);
	console.log("YieldProtocol: ", yieldProtocol);

	const dome = await ethers.getContractAt("Dome", domeAddress);
	const underlyingAsset = await dome.asset();
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

	const network = await deployer.provider.getNetwork();
	writeDeploy(network.name, deployment);

	return {
		domeAddress: domeAddress,
	};
}

async function verifyDome(network) {
	const { DOME } = getLatestDomeDeploy(network.name);

	const dome = await ethers.getContractAt("Dome", DOME.address);

	await run("verify:verify", {
		address: dome.address,
		constructorArguments: DOME.constructorArguments,
	});
}

async function verifyProtocol(network) {
	const {
		DOME_PROTOCOL,
		DOME_FACTORY,
		GOVERNANCE_FACTORY,
		WRAPPEDVOTING_FACTORY,
		PRICE_TRACKER,
		BUFFER,
		REWARD_TOKEN,
	} = getLatestProtocolDeploy(network.name);

	const domeProtocol = await ethers.getContractAt(
		"DomeProtocol",
		DOME_PROTOCOL.address
	);

	const domeFactoryAddress = await domeProtocol.callStatic.DOME_FACTORY();
	const governanceFactoryAddress =
		await domeProtocol.callStatic.GOVERNANCE_FACTORY();
	const wrappedVotingFactoryAddress =
		await domeProtocol.callStatic.WRAPPEDVOTING_FACTORY();
	const priceTrackerAddress = await domeProtocol.callStatic.PRICE_TRACKER();

	await run("verify:verify", {
		address: domeProtocol.address,
		constructorArguments: DOME_PROTOCOL.constructorArguments,
	});

	await run("verify:verify", {
		address: domeFactoryAddress,
		constructorArguments: DOME_FACTORY.constructorArguments,
	});

	await run("verify:verify", {
		address: governanceFactoryAddress,
		constructorArguments: GOVERNANCE_FACTORY.constructorArguments,
	});

	await run("verify:verify", {
		address: wrappedVotingFactoryAddress,
		constructorArguments: WRAPPEDVOTING_FACTORY.constructorArguments,
	});

	await run("verify:verify", {
		address: priceTrackerAddress,
		constructorArguments: PRICE_TRACKER.constructorArguments,
	});

	await run("verify:verify", {
		address: BUFFER.address,
		constructorArguments: BUFFER.constructorArguments,
	});

	await run("verify:verify", {
		address: REWARD_TOKEN.address,
		constructorArguments: REWARD_TOKEN.constructorArguments,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
