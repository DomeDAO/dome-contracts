require("dotenv").config();
const { ethers } = require("hardhat");

function getEnv(name, fallback) {
	const value = process.env[name] ?? fallback;
	if (!value) {
		throw new Error(`Missing required env var ${name}`);
	}
	return value;
}

async function main() {
	const [signer] = await ethers.getSigners();
	const usdc = getEnv("HYPERLIQUID_USDC");
	const coreWriter = getEnv(
		"HYPERLIQUID_CORE_WRITER",
		"0x3333333333333333333333333333333333333333"
	);
	const buffer = getEnv("HYPERLIQUID_BUFFER", signer.address);
	const owner = getEnv("HYPERLIQUID_OWNER", signer.address);
	const treasury = getEnv("HYPERLIQUID_TREASURY");
	const bufferFeeBps = parseInt(getEnv("HYPERLIQUID_BUFFER_FEE_BPS", "500"), 10);
	const ownerFeeBps = parseInt(getEnv("HYPERLIQUID_OWNER_FEE_BPS", "500"), 10);
	const iouName = getEnv("HYPERLIQUID_IOU_NAME", "Hyperliquid IOU");
	const iouSymbol = getEnv("HYPERLIQUID_IOU_SYMBOL", "hlIOU");

	console.log("Deploying HyperliquidVault with params:");
	console.log(`- USDC: ${usdc}`);
	console.log(`- CoreWriter: ${coreWriter}`);
	console.log(`- Buffer: ${buffer}`);
	console.log(`- Owner: ${owner}`);
	console.log(`- Treasury: ${treasury}`);
	console.log(`- Buffer fee (bps): ${bufferFeeBps}`);
	console.log(`- Owner fee (bps): ${ownerFeeBps}`);
	console.log(`- IOU name: ${iouName}`);
	console.log(`- IOU symbol: ${iouSymbol}`);

	const Vault = await ethers.getContractFactory("HyperliquidVault");
	const vault = await Vault.deploy(
		usdc,
		coreWriter,
		buffer,
		owner,
		treasury,
		bufferFeeBps,
		ownerFeeBps,
		iouName,
		iouSymbol
	);
	await vault.deployed();

	console.log(`HyperliquidVault deployed at ${vault.address}`);
	console.log(
		`Total assets (initial): ${await vault.totalAssets()} (${await vault.symbol()})`
	);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

