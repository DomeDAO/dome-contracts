export type HyperEVMNetwork = "mainnet" | "testnet";

export const HYPER_EVM_NETWORKS: Record<
  HyperEVMNetwork,
  {
    chainId: number;
    rpcUrl: string;
  }
> = {
  mainnet: {
    chainId: 999,
    rpcUrl: "https://rpc.hyperliquid.xyz/evm",
  },
  testnet: {
    chainId: 998,
    rpcUrl: "https://rpc.hyperliquid-testnet.xyz/evm",
  },
};

