import path from "path";
import dotenv from "dotenv";
import { ethers, network } from "hardhat";
import { getCreateAddress } from "ethers";
import fs from "fs/promises";
import { HYPER_EVM_NETWORKS, HyperEVMNetwork } from "../config/hyperevm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const optionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  // Strip surrounding quotes if users wrap values in "" or ''
  return trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
};

type DeploymentConfig = {
  usdc: string;
  hyperliquidVault: string;
  coreWriter: string;
  coreDepositWallet: string;
  donationBps: number;
  shareName: string;
  shareSymbol: string;
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
const DEFAULT_CORE_DEPOSIT_WALLET = "0x6b9e773128f453f5c2c60935ee2de2cbc5390a24";

function loadConfig(): DeploymentConfig {
  const envDonation = Number(process.env.HYPER_EVM_DONATION_BPS ?? "1000");
  if (Number.isNaN(envDonation)) {
    throw new Error("Invalid HYPER_EVM_DONATION_BPS value");
  }

  const config: DeploymentConfig = {
    usdc: optionalEnv("HYPER_EVM_USDC") ?? "",
    hyperliquidVault: optionalEnv("HYPER_EVM_HYPER_VAULT") ?? DEFAULT_HYPERLIQUID_NATIVE_VAULT,
    coreWriter: optionalEnv("HYPER_EVM_CORE_WRITER") ?? DEFAULT_CORE_WRITER,
    coreDepositWallet: optionalEnv("HYPER_EVM_CORE_DEPOSIT_WALLET") ?? DEFAULT_CORE_DEPOSIT_WALLET,
    donationBps: envDonation,
    shareName: optionalEnv("HYPER_EVM_SHARE_NAME") ?? "NGO Hyper Share",
    shareSymbol: optionalEnv("HYPER_EVM_SHARE_SYMBOL") ?? "NGO-H",
    outputFile: optionalEnv("HYPER_EVM_DEPLOY_OUTPUT") ?? "../deployments/hyperevm.json",
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

  if (!ethers.isAddress(config.coreDepositWallet)) {
    throw new Error(
      [
        "Missing Hyperliquid CoreDepositWallet address.",
        "Set HYPER_EVM_CORE_DEPOSIT_WALLET env var if a non-default address is required. Refer to:",
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

  // Get deployer - use Ledger address directly if configured (avoids eth_accounts RPC call
  // which HyperEVM doesn't support), otherwise fall back to getSigners() for private key mode
  const ledgerAddress = optionalEnv("HYPER_EVM_LEDGER_ADDRESS");
  let deployer;
  if (ledgerAddress) {
    // For Ledger: get signer by address directly (bypasses eth_accounts)
    deployer = await ethers.getSigner(ledgerAddress);
    console.log(`Using Ledger deployer: ${deployer.address}`);
  } else {
    // For private key: use getSigners()
    const signers = await ethers.getSigners();
    if (!signers.length) {
      throw new Error(
        "No deployer account configured. Set HYPER_EVM_PRIVATE_KEY or HYPER_EVM_LEDGER_ADDRESS in .env."
      );
    }
    deployer = signers[0];
    console.log(`Deploying from ${deployer.address}`);
  }

  const baseNonce = await deployer.getNonce();
  // Contracts/transactions are executed in the following order:
  // bridge (nonce), strategy (nonce + 1), authorize tx (nonce + 2),
  // share (nonce + 3), buffer (nonce + 4), governance (nonce + 5),
  // buffer.setGovernance (nonce + 6), vault (nonce + 7).
  // We need the predicted vault address beforehand to pass into the share constructor.
  const vaultDeploymentNonce = baseNonce + 7;
  const predictedVaultAddress = getCreateAddress({
    from: deployer.address,
    nonce: vaultDeploymentNonce,
  });

  console.log(`Predicted NGOVault address: ${predictedVaultAddress}`);

  // Pass deployer signer explicitly to contract factories to avoid eth_accounts RPC calls
  const BridgeFactory = await ethers.getContractFactory("HyperliquidBridgeAdapter", deployer);
  const bridge = await BridgeFactory.deploy(
    config.usdc,
    config.hyperliquidVault,
    config.coreWriter,
    config.coreDepositWallet
  );
  await bridge.waitForDeployment();
  console.log(`HyperliquidBridgeAdapter deployed at ${await bridge.getAddress()}`);

  const StrategyFactory = await ethers.getContractFactory("HyperliquidStrategyVault", deployer);
  const strategy = await StrategyFactory.deploy(config.usdc, await bridge.getAddress());
  await strategy.waitForDeployment();
  console.log(`HyperliquidStrategyVault deployed at ${await strategy.getAddress()}`);

  await (await bridge.setAuthorizedStrategy(await strategy.getAddress(), true)).wait();
  console.log("Strategy authorized on bridge");

  const ShareFactory = await ethers.getContractFactory("Share", deployer);
  const share = await ShareFactory.deploy(config.shareName, config.shareSymbol, predictedVaultAddress);
  await share.waitForDeployment();
  console.log(`Share deployed at ${await share.getAddress()}`);

  const BufferFactory = await ethers.getContractFactory("GovernanceBuffer", deployer);
  const governanceBuffer = await BufferFactory.deploy(config.usdc, ethers.ZeroAddress);
  await governanceBuffer.waitForDeployment();
  console.log(`GovernanceBuffer deployed at ${await governanceBuffer.getAddress()}`);

  const GovernanceFactory = await ethers.getContractFactory("Governance", deployer);
  const governance = await (GovernanceFactory as any).deploy(
    config.usdc,
    await share.getAddress(),
    await governanceBuffer.getAddress()
  );
  await governance.waitForDeployment();
  console.log(`Governance deployed at ${await governance.getAddress()}`);

  await (await (governanceBuffer as any).setGovernance(await governance.getAddress())).wait();
  console.log("Governance buffer linked to Governance");

  const VaultFactory = await ethers.getContractFactory("Vault", deployer);
  const vault = await (VaultFactory as any).deploy(
    config.usdc,
    await share.getAddress(),
    await strategy.getAddress(),
    config.donationBps,
    await governance.getAddress(),
    await governanceBuffer.getAddress()
  );
  await vault.waitForDeployment();
  console.log(`Vault deployed at ${await vault.getAddress()}`);

  const deploymentSummary = {
    network: network.name,
    chainId: network.config.chainId,
    docs: HYPERLIQUID_DOC_REFERENCES,
    contracts: {
      usdc: config.usdc,
      hyperliquidVault: config.hyperliquidVault,
      coreWriter: config.coreWriter,
      coreDepositWallet: config.coreDepositWallet,
      bridge: await bridge.getAddress(),
      strategy: await strategy.getAddress(),
      share: await share.getAddress(),
      governance: await governance.getAddress(),
      buffer: await governanceBuffer.getAddress(),
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


