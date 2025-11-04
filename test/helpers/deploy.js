const { ethers } = require("hardhat");
const {
	POLYGON: { MAINNET },
} = require("../constants");

async function deployMockEnvironment() {
	const signers = await ethers.getSigners();
	const [owner, ...others] = signers;

	const [
		DomeFactory,
		GovernanceFactory,
		WrappedVotingFactory,
		DomeProtocol,
		MockERC20,
		MockERC4626,
	] = await Promise.all([
		ethers.getContractFactory("DomeFactory"),
		ethers.getContractFactory("GovernanceFactory"),
		ethers.getContractFactory("WrappedVotingFactory"),
		ethers.getContractFactory("DomeProtocol"),
		ethers.getContractFactory("MockERC20"),
		ethers.getContractFactory("MockERC4626"),
	]);

	const usdc = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
	await usdc.deployed();
	const wmatic = await MockERC20.deploy("Mock WMATIC", "mWMATIC", 18);
	await wmatic.deployed();
	const usdt = await MockERC20.deploy("Mock USDT", "mUSDT", 6);
	await usdt.deployed();
	const dai = await MockERC20.deploy("Mock DAI", "mDAI", 18);
	await dai.deployed();

	const domeFactory = await DomeFactory.deploy();
	const governanceFactory = await GovernanceFactory.deploy();
	const wrappedVotingFactory = await WrappedVotingFactory.deploy();

	await Promise.all([
		domeFactory.deployed(),
		governanceFactory.deployed(),
		wrappedVotingFactory.deployed(),
	]);

	const domeCreationFee = ethers.utils.parseEther("1");
	const systemOwnerPercentage = 1000;

	const aaveProvider = await MockERC4626.deploy(
		usdc.address,
		"Mock AAVE Vault",
		"mAAVE"
	);
	await aaveProvider.deployed();

	const hyperliquidProvider = await MockERC4626.deploy(
		usdc.address,
		"Mock Hyperliquid Vault",
		"mHYPER"
	);
	await hyperliquidProvider.deployed();

	const domeProtocol = await DomeProtocol.deploy(
		owner.address,
		domeFactory.address,
		governanceFactory.address,
		wrappedVotingFactory.address,
		systemOwnerPercentage,
		domeCreationFee,
		usdc.address
	);

	await domeProtocol.deployed();

	const providerType = await domeProtocol.YIELD_PROVIDER_TYPE_AAVE();
	await domeProtocol.configureYieldProviders([
		{ provider: aaveProvider.address, providerType, enabled: true },
	]);

	MAINNET.ADDRESSES.USDC = usdc.address;
	MAINNET.ADDRESSES.WMATIC = wmatic.address;
	MAINNET.ADDRESSES.USDT = usdt.address;
	MAINNET.ADDRESSES.DAI = dai.address;
	MAINNET.YIELD_PROTOCOLS.AAVE_POLYGON_USDC = aaveProvider.address;
	MAINNET.YIELD_PROTOCOLS.HYPERLIQUID_POLYGON_USDC =
		hyperliquidProvider.address;

	return {
		owner,
		others,
		contracts: {
			domeFactory,
			governanceFactory,
			wrappedVotingFactory,
			domeProtocol,
		},
		mocks: {
			usdc,
			wmatic,
			usdt,
			dai,
			aaveProvider,
			hyperliquidProvider,
		},
		params: {
			domeCreationFee,
			systemOwnerPercentage,
		},
	};
}

module.exports = {
	deployMockEnvironment,
};
