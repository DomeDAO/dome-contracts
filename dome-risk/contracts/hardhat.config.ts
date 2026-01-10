import path from "path";
import dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { HYPER_EVM_NETWORKS, HyperEVMNetwork } from "./config/hyperevm";

dotenv.config({ path: path.join(__dirname, ".env") });

const optionalEnv = (key: string): string | undefined => {
  const value = process.env[key];
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  return trimmed.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
};

const selectedNetwork = (optionalEnv("HYPER_EVM_NETWORK") as HyperEVMNetwork) ?? "testnet";
const networkDefaults = HYPER_EVM_NETWORKS[selectedNetwork] ?? HYPER_EVM_NETWORKS.testnet;

const hyperevmRpcUrl = optionalEnv("HYPER_EVM_RPC") ?? networkDefaults.rpcUrl;
const chainIdOverride = optionalEnv("HYPER_EVM_CHAIN_ID");
const hyperevmChainId = chainIdOverride !== undefined ? Number(chainIdOverride) : networkDefaults.chainId;
const hyperevmKey = optionalEnv("HYPER_EVM_PRIVATE_KEY");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hyperevm: {
      url: hyperevmRpcUrl,
      chainId: hyperevmChainId,
      accounts: hyperevmKey ? [hyperevmKey] : [],
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 120_000,
  },
};

export default config;

