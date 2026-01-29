import { ethers } from "ethers";
import deployments from "../../deployments/hyperevm-mainnet.json";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
  console.log("=== USDC Balance Check (EVM Side) ===\n");

  const provider = new ethers.JsonRpcProvider("https://rpc.hyperliquid.xyz/evm");
  const usdc = new ethers.Contract(deployments.contracts.usdc, ERC20_ABI, provider);

  const addresses = {
    "User (your Ledger)": "0x9bDca32FAFbAcB2D937A2d3538C7b8ECA3e59946",
    "Vault (dome-risk)": deployments.contracts.vault,
    "Strategy": deployments.contracts.strategy,
    "BridgeAdapter": deployments.contracts.bridge,
    "GovernanceBuffer": deployments.contracts.buffer,
    "CoreDepositWallet (Hyperliquid)": deployments.contracts.coreDepositWallet,
  };

  console.log("USDC Address:", deployments.contracts.usdc);
  console.log("");

  for (const [name, address] of Object.entries(addresses)) {
    const balance = await usdc.balanceOf(address);
    console.log(`${name}:`);
    console.log(`  Address: ${address}`);
    console.log(`  USDC Balance: ${ethers.formatUnits(balance, 6)} USDC\n`);
  }

  console.log("=== Summary ===");
  console.log("If all EVM balances are 0, the USDC has been bridged to Hyperliquid L1 (HyperCore).");
  console.log("The BridgeAdapter's HyperCore account should hold the funds.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
