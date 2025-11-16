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
	console.log("Starting deployment...");
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
		FakeERC20,
		FakeERC4626
	] = await Promise.all([
		ethers.getContractFactory("FakeERC20"),
		ethers.getContractFactory("FakeERC4626"),
	]);

	console.log("Deploying protocol...");
	let nonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
	let gasPrice = await getGasPrice(10);

	console.log("Deploying fake artefacts");
	const fakeERC20 = await FakeERC20.deploy("Fake USDC", "fUSDC", { nonce: nonce++, gasPrice });
	console.log(`FakeERC20 deployed at ${fakeERC20.address}`);
	const fakeERC4626 = await FakeERC4626.deploy(fakeERC20.address, "Fake ERC4626", "fERC4626", { nonce: nonce++, gasPrice });
	console.log(`FakeERC4626 deployed at ${fakeERC4626.address}`);

	console.log("Deploying contracts...");
	const [
		DomeFactory,
		GovernanceFactory,
		WrappedVotingFactory,
		DomeProtocol,
	] = await Promise.all([
		ethers.getContractFactory("DomeFactory"),
		ethers.getContractFactory("GovernanceFactory"),
		ethers.getContractFactory("WrappedVotingFactory"),
		ethers.getContractFactory("DomeProtocol"),
	]);

	const UNISWAP_ROUTER = AMOY.ADDRESSES.SUSHI_ROUTER_02;
	const USDC = fakeERC20.address;

	console.log("You are going to deploy:\n");
	console.log("- DomeFactory");
	console.log("- GovernanceFactory");
	console.log("- WrappedVotingFactory");
	console.log(
	);

	console.log("Deploying contracts...");
	const [domeFactory, governanceFactory, wrappedVotingFactory] = await Promise.all([
		DomeFactory.deploy({ nonce: nonce, gasPrice }),
		GovernanceFactory.deploy({ nonce: ++nonce, gasPrice }),
		WrappedVotingFactory.deploy({ nonce: ++nonce, gasPrice }),
	]);
	console.log("Successfully deployed factories...");

	console.log("\nDeployment addresses: ");
	console.log(`- DomeFactory: ${domeFactory.address}`);
	console.log(`- GovernanceFactory: ${governanceFactory.address}`);
	console.log(`- WrappedVotingFactory: ${wrappedVotingFactory.address}`);

	await Promise.all([
		domeFactory.deployed(),
		governanceFactory.deployed(),
		wrappedVotingFactory.deployed(),
	]);

	console.log("Successfully deployed contracts...");

	console.log("Minting fake tokens...");
	console.log("Minting 2000 fake tokens to deployer...");
	await mint(fakeERC20.address, deployer.address, ethers.utils.parseEther("2000"), deployer);
	console.log("Successfully minted fake tokens...");
	console.log("Minting 2000 fake tokens to fakeERC4626...");
	await mint(fakeERC20.address, fakeERC4626.address, ethers.utils.parseEther("2000"), deployer);
	console.log("Successfully minted fake tokens...");


	console.log("Deploying DomeProtocol...");
	console.log("Parameters definition...");
	const domeCreationFee = ethers.utils.parseEther("0");
	const systemOwnerPercentage = 0;

	const protocolConstructorArguments = [
		deployer.address,
		domeFactory.address,
		governanceFactory.address,
		wrappedVotingFactory.address,
		systemOwnerPercentage,
		domeCreationFee,
		USDC,
	];

	console.log("Deploying DomeProtocol...");
	const domeProtocol = await DomeProtocol.connect(deployer).deploy(
		...protocolConstructorArguments,
		{ gasPrice }
	);

	await domeProtocol.deployed();

	console.log("Successfully deployed DomeProtocol...");

	const bufferAddress = await domeProtocol.callStatic.BUFFER();

	console.log(`DomeProtocol was deployed at ${domeProtocol.address}`);
	console.log(`- BUFFER at ${bufferAddress}`);

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
		BUFFER: {
			address: bufferAddress,
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
