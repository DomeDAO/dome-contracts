import { ethers, network } from "hardhat";
import { getCreateAddress } from "ethers";
import path from "path";
import fs from "fs/promises";
import { HYPER_EVM_NETWORKS, HyperEVMNetwork } from "../config/hyperevm";

const optionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return undefined;
  }
  return value;
};

type DeploymentConfig = {
  usdc: string;
  hyperliquidVault: string;
  coreWriter: string;
  donationBps: number;
  shareName: string;
  shareSymbol: string;
  governanceBufferAddress?: string;
  outputFile?: string;
};

const HYPERLIQUID_DOC_REFERENCES = {
  overview: "https://app.hyperliquid.xyz/hyperliquid",
  hyperevmDocs: "https://docs.hyperliquid.xyz/",
  addresses: "https://docs.hyperliquid.xyz/hyperliquid/build-on-hyperliquid/reference/hyperevm-addresses",
  rpc: "https://docs.hyperliquid.xyz/hyperliquid/build-on-hyperliquid/reference/hyperevm-rpc",
};

// Source: Hyperliquid documentation (Hyperevm vaults section). Keep in sync with upstream docs.
const DEFAULT_HYPERLIQUID_NATIVE_VAULT = "0x93ad52177d0795de8c67c92b1a72035293cb7aac";
const DEFAULT_CORE_WRITER = "0x3333333333333333333333333333333333333333";

function loadConfig(): DeploymentConfig {
  const envDonation = Number(process.env.HYPER_EVM_DONATION_BPS ?? "1000");
  if (Number.isNaN(envDonation)) {
    throw new Error("Invalid HYPER_EVM_DONATION_BPS value");
  }

  const config: DeploymentConfig = {
    usdc: process.env.HYPER_EVM_USDC ?? "",
    hyperliquidVault: process.env.HYPER_EVM_HYPER_VAULT ?? DEFAULT_HYPERLIQUID_NATIVE_VAULT,
    coreWriter: process.env.HYPER_EVM_CORE_WRITER ?? DEFAULT_CORE_WRITER,
    donationBps: envDonation,
    shareName: process.env.HYPER_EVM_SHARE_NAME ?? "NGO Hyper Share",
    shareSymbol: process.env.HYPER_EVM_SHARE_SYMBOL ?? "NGO-H",
    governanceBufferAddress: process.env.HYPER_EVM_GOVERNANCE_BUFFER,
    outputFile: process.env.HYPER_EVM_DEPLOY_OUTPUT ?? "../deployments/hyperevm.json",
  };

  if (!ethers.isAddress(config.usdc)) {
    throw new Error(
      [
        "Missing HyperEVM USDC address.",
        "Set HYPER_EVM_USDC env var using the canonical address from Hyperliquid docs:",
        HYPERLIQUID_DOC_REFERENCES.addresses,
      ].join("\n")
    );
  }

  if (!ethers.isAddress(config.hyperliquidVault)) {
    throw new Error(
      [
        "Missing Hyperliquid native vault address.",
        "Set HYPER_EVM_HYPER_VAULT env var based on Hyperliquid docs:",
        HYPERLIQUID_DOC_REFERENCES.addresses,
      ].join("\n")
    );
  }

  if (!ethers.isAddress(config.coreWriter)) {
    throw new Error(
      [
        "Missing Hyperliquid CoreWriter system contract address.",
        "Set HYPER_EVM_CORE_WRITER env var if a non-default address is required. Refer to:",
        HYPERLIQUID_DOC_REFERENCES.hyperevmDocs,
      ].join("\n")
    );
  }

  return config;
}

async function writeDeploymentFile(targetPath: string, payload: Record<string, unknown>) {
  const resolvedPath = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(__dirname, "..", targetPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, JSON.stringify(payload, null, 2));
  console.log(`Deployment metadata written to ${resolvedPath}`);
}

async function main() {
  const selectedNetwork = (optionalEnv("HYPER_EVM_NETWORK") as HyperEVMNetwork) ?? "testnet";
  const networkDefaults = HYPER_EVM_NETWORKS[selectedNetwork] ?? HYPER_EVM_NETWORKS.testnet;
  const chainIdOverride = optionalEnv("HYPER_EVM_CHAIN_ID");
  const expectedChainId = chainIdOverride ? Number(chainIdOverride) : networkDefaults.chainId;

  if (network.config.chainId !== expectedChainId) {
    console.warn(
      `Warning: expected HyperEVM chainId ${expectedChainId} but connected to ${network.config.chainId}. Override if intentional.`
    );
  }

  const config = loadConfig();
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from ${deployer.address}`);

  const baseNonce = await deployer.getNonce();
  // Contracts are deployed in the following order:
  // bridge (nonce), strategy (nonce + 1), authorize tx (nonce + 2),
  // share (nonce + 3), governance (nonce + 4), vault (nonce + 5).
  // We need the predicted vault address beforehand to pass into the share constructor.
  const vaultDeploymentNonce = baseNonce + 5;
  const predictedVaultAddress = getCreateAddress({
    from: deployer.address,
    nonce: vaultDeploymentNonce,
  });

  console.log(`Predicted NGOVault address: ${predictedVaultAddress}`);

  const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter");
  const bridge = await BridgeFactory.deploy(config.usdc, config.hyperliquidVault, config.coreWriter);
  await bridge.waitForDeployment();
  console.log(`HyperliquidBridgeAdapter deployed at ${await bridge.getAddress()}`);

  const StrategyFactory = await ethers.getContractFactory("HyperliquidStrategyVault");
  const strategy = await StrategyFactory.deploy(config.usdc, await bridge.getAddress());
  await strategy.waitForDeployment();
  console.log(`HyperliquidStrategyVault deployed at ${await strategy.getAddress()}`);

  await (await bridge.setAuthorizedStrategy(await strategy.getAddress(), true)).wait();
  console.log("Strategy authorized on bridge");

  const ShareFactory = await ethers.getContractFactory("NGOShare");
  const share = await ShareFactory.deploy(config.shareName, config.shareSymbol, predictedVaultAddress);
  await share.waitForDeployment();
  console.log(`NGOShare deployed at ${await share.getAddress()}`);

  const GovernanceFactory = await ethers.getContractFactory("NGOGovernance");
  const governance = await GovernanceFactory.deploy(config.usdc, await share.getAddress());
  await governance.waitForDeployment();
  console.log(`NGOGovernance deployed at ${await governance.getAddress()}`);

  const VaultFactory = await ethers.getContractFactory("NGOVault");
  const vault = await VaultFactory.deploy(
    config.usdc,
    await share.getAddress(),
    await strategy.getAddress(),
    config.donationBps,
    await governance.getAddress()
  );
  await vault.waitForDeployment();
  console.log(`NGOVault deployed at ${await vault.getAddress()}`);

  const deploymentSummary = {
    network: network.name,
    chainId: network.config.chainId,
    docs: HYPERLIQUID_DOC_REFERENCES,
    contracts: {
      usdc: config.usdc,
      hyperliquidVault: config.hyperliquidVault,
      coreWriter: config.coreWriter,
      bridge: await bridge.getAddress(),
      strategy: await strategy.getAddress(),
      share: await share.getAddress(),
      governance: await governance.getAddress(),
      vault: await vault.getAddress(),
    },
    parameters: {
      donationBps: config.donationBps,
      shareName: config.shareName,
      shareSymbol: config.shareSymbol,
    },
  };

  if (config.outputFile) {
    await writeDeploymentFile(config.outputFile, deploymentSummary);
  }

  console.log("Deployment complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


