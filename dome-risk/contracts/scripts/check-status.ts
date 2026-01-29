import { ethers } from "ethers";

// Latest deployment
const deployments = {
  contracts: {
    vault: "0xd34DE947Da5eBfB855255E6Ba17D290763D48803",
    share: "0x43137336F0B5373c7C4F482E21eD7f3791384134",
    strategy: "0xf1D0892A1aF071647f16CC6bFcA380D2dB35bA48",
    bridge: "0xeB8A96078eB7D3B99f9a503FCB5181ec6B0FEab9",
    usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    hyperliquidVault: "0x93ad52177d0795de8c67c92b1a72035293cb7aac",
  }
};

// Minimal ABIs for read functions
const VAULT_ABI = [
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function getUserAccounting(address) view returns (tuple(uint256 deposited, uint256 withdrawn, uint256 donated))",
];
const SHARE_ABI = ["function balanceOf(address) view returns (uint256)"];
const STRATEGY_ABI = ["function totalAssets() view returns (uint256)"];
const BRIDGE_ABI = [
  "function totalShares() view returns (uint256)",
  "function getTotalEquity() view returns (uint256)",
  "function getVaultEquity() view returns (uint64, uint64)",
];

async function main() {
  console.log("=== Dome Risk Status Check ===\n");

  const provider = new ethers.JsonRpcProvider("https://rpc.hyperliquid.xyz/evm");

  const vault = new ethers.Contract(deployments.contracts.vault, VAULT_ABI, provider);
  const share = new ethers.Contract(deployments.contracts.share, SHARE_ABI, provider);
  const strategy = new ethers.Contract(deployments.contracts.strategy, STRATEGY_ABI, provider);
  const bridge = new ethers.Contract(deployments.contracts.bridge, BRIDGE_ABI, provider);

  const userAddress = "0x9bDca32FAFbAcB2D937A2d3538C7b8ECA3e59946";

  // User's position in dome-risk
  console.log("User:", userAddress);
  const shareBalance = await share.balanceOf(userAddress);
  console.log("NGO-H Share Balance:", ethers.formatEther(shareBalance));

  const userAccounting = await vault.getUserAccounting(userAddress);
  console.log("Total Deposited (USDC):", ethers.formatUnits(userAccounting.deposited, 6));
  console.log("Total Withdrawn (USDC):", ethers.formatUnits(userAccounting.withdrawn, 6));
  console.log("Total Donated (USDC):", ethers.formatUnits(userAccounting.donated, 6));

  // Vault totals
  console.log("\n--- Vault Status ---");
  const totalAssets = await vault.totalAssets();
  console.log("Vault Total Assets (USDC):", ethers.formatUnits(totalAssets, 6));
  const totalSupply = await vault.totalSupply();
  console.log("Vault Total Supply (shares):", ethers.formatEther(totalSupply));

  // Strategy status
  console.log("\n--- Strategy Status ---");
  const strategyAssets = await strategy.totalAssets();
  console.log("Strategy Total Assets (USDC):", ethers.formatUnits(strategyAssets, 6));

  // Bridge status
  console.log("\n--- Bridge Status ---");
  const bridgeTotalShares = await bridge.totalShares();
  console.log("Bridge Total Shares:", ethers.formatUnits(bridgeTotalShares, 6));
  
  const bridgeEquity = await bridge.getTotalEquity();
  console.log("Bridge Total Equity (from precompile or fallback):", ethers.formatUnits(bridgeEquity, 6));

  try {
    const [equity, lockedUntil] = await bridge.getVaultEquity();
    console.log("Vault Equity (precompile):", ethers.formatUnits(equity, 6), "USDC");
    if (lockedUntil > 0) {
      const lockDate = new Date(Number(lockedUntil) * 1000);
      console.log("Locked Until:", lockDate.toISOString());
    } else {
      console.log("Locked Until: Not locked");
    }
  } catch (e) {
    console.log("Vault Equity (precompile): Unable to query");
  }

  console.log("\n--- Hyperliquid Vault Config ---");
  console.log("Target HEP Vault:", deployments.contracts.hyperliquidVault);
  console.log("Bridge Address (depositor on HEP):", deployments.contracts.bridge);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
