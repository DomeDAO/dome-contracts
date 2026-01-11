import { run } from "hardhat";
import deploymentData from "../../deployments/hyperevm-mainnet.json";

async function verify(address: string, constructorArguments: any[], contractName: string) {
  console.log(`\nVerifying ${contractName} at ${address}...`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments,
    });
    console.log(`✅ ${contractName} verified!`);
  } catch (error: any) {
    if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
      console.log(`✅ ${contractName} already verified`);
    } else {
      console.error(`❌ ${contractName} verification failed:`, error.message);
    }
  }
}

async function main() {
  const { contracts, parameters } = deploymentData;

  console.log("Starting contract verification on HyperEVM (Sourcify + Etherscan v2)...\n");

  // 1. HyperliquidBridgeAdapter
  await verify(
    contracts.bridge,
    [contracts.usdc, contracts.hyperliquidVault, contracts.coreWriter],
    "HyperliquidBridgeAdapter"
  );

  // 2. HyperliquidStrategyVault
  await verify(
    contracts.strategy,
    [contracts.usdc, contracts.bridge],
    "HyperliquidStrategyVault"
  );

  // 3. Share
  await verify(
    contracts.share,
    [parameters.shareName, parameters.shareSymbol, contracts.vault],
    "Share"
  );

  // 4. GovernanceBuffer
  await verify(
    contracts.buffer,
    [contracts.usdc, "0x0000000000000000000000000000000000000000"],
    "GovernanceBuffer"
  );

  // 5. Governance
  await verify(
    contracts.governance,
    [contracts.usdc, contracts.share, contracts.buffer],
    "Governance"
  );

  // 6. Vault
  await verify(
    contracts.vault,
    [
      contracts.usdc,
      contracts.share,
      contracts.strategy,
      parameters.donationBps,
      contracts.governance,
      contracts.buffer,
    ],
    "Vault"
  );

  console.log("\n🎉 Verification complete!");
  console.log(`View on HyperEVMScan: https://hyperevmscan.io/address/${contracts.vault}#code`);
  console.log(`View on Purrsec: https://purrsec.com/address/${contracts.vault}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
