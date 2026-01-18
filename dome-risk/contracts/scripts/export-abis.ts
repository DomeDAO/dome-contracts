import fs from "fs";
import path from "path";

const ARTIFACTS_DIR = path.join(__dirname, "../artifacts/contracts");
const OUTPUT_DIR = path.join(__dirname, "../abi");

// Contracts to export (excluding mocks and interfaces unless needed)
const CONTRACTS_TO_EXPORT = [
  "Vault.sol/Vault.json",
  "Share.sol/Share.json",
  "Governance.sol/Governance.json",
  "GovernanceBuffer.sol/GovernanceBuffer.json",
  "hyperliquid/HyperliquidBridgeAdapter.sol/HyperliquidBridgeAdapter.json",
  "hyperliquid/HyperliquidStrategyVault.sol/HyperliquidStrategyVault.json",
  // Interfaces (useful for frontend integration)
  "interfaces/IStrategyVault.sol/IStrategyVault.json",
  "interfaces/IGovernanceBuffer.sol/IGovernanceBuffer.json",
  "hyperliquid/interfaces/IHyperliquidBridgeAdapter.sol/IHyperliquidBridgeAdapter.json",
];

interface Artifact {
  contractName: string;
  abi: unknown[];
}

function exportAbis() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const exportedAbis: Record<string, unknown[]> = {};

  for (const contractPath of CONTRACTS_TO_EXPORT) {
    const fullPath = path.join(ARTIFACTS_DIR, contractPath);

    if (!fs.existsSync(fullPath)) {
      console.warn(`Warning: ${contractPath} not found, skipping...`);
      continue;
    }

    const artifact: Artifact = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    const contractName = artifact.contractName;

    // Export individual ABI file
    const abiOutputPath = path.join(OUTPUT_DIR, `${contractName}.json`);
    fs.writeFileSync(abiOutputPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`Exported: ${contractName}.json`);

    // Add to combined export
    exportedAbis[contractName] = artifact.abi;
  }

  // Export combined ABIs file
  const combinedOutputPath = path.join(OUTPUT_DIR, "index.json");
  fs.writeFileSync(combinedOutputPath, JSON.stringify(exportedAbis, null, 2));
  console.log(`\nExported combined ABIs to: index.json`);

  // Generate TypeScript index for easy imports
  const tsIndex = `// Auto-generated ABI exports
${CONTRACTS_TO_EXPORT.map((p) => {
  const name = path.basename(p, ".json");
  return `import ${name}ABI from "./${name}.json";`;
}).join("\n")}

export {
${CONTRACTS_TO_EXPORT.map((p) => `  ${path.basename(p, ".json")}ABI,`).join("\n")}
};

// Combined export
export const abis = {
${CONTRACTS_TO_EXPORT.map((p) => {
  const name = path.basename(p, ".json");
  return `  ${name}: ${name}ABI,`;
}).join("\n")}
} as const;
`;

  const tsIndexPath = path.join(OUTPUT_DIR, "index.ts");
  fs.writeFileSync(tsIndexPath, tsIndex);
  console.log(`Generated TypeScript index: index.ts`);

  console.log(`\nAll ABIs exported to: ${OUTPUT_DIR}`);
}

exportAbis();
