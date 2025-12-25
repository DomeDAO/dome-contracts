import { BrowserProvider, Contract, Interface, JsonRpcProvider, isAddress } from "ethers";

import NGOVaultArtifact from "../abi/NGOVault.json";
import NGOShareArtifact from "../abi/NGOShare.json";
import NGOGovernanceArtifact from "../abi/NGOGovernance.json";
import NGOGovernanceBufferArtifact from "../abi/NGOGovernanceBuffer.json";
import IERC20Artifact from "../abi/IERC20.json";
import IERC20MetadataArtifact from "../abi/IERC20Metadata.json";

export const ABI = Object.freeze({
  NGOVault: NGOVaultArtifact.abi,
  NGOShare: NGOShareArtifact.abi,
  NGOGovernance: NGOGovernanceArtifact.abi,
  NGOGovernanceBuffer: NGOGovernanceBufferArtifact.abi,
  IERC20: IERC20Artifact.abi,
  IERC20Metadata: IERC20MetadataArtifact.abi,
});

export const IFACE = Object.freeze({
  NGOVault: new Interface(ABI.NGOVault),
  NGOGovernance: new Interface(ABI.NGOGovernance),
});

export function getInjectedBrowserProvider() {
  if (typeof window === "undefined") return null;
  if (!window.ethereum) return null;
  return new BrowserProvider(window.ethereum);
}

export function getRpcProvider(rpcUrl) {
  if (!rpcUrl) return null;
  return new JsonRpcProvider(rpcUrl);
}

export function makeContracts(addresses, runner) {
  return makeContractsWithOptions(addresses, runner);
}

export function isValidAddress(ethers, value) {
  try {
    return ethers.isAddress(value ?? "");
  } catch {
    return false;
  }
}

export function normalizeAccount(value) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value.address === "string") return value.address;
  return undefined;
}

export function makeContractsWithOptions(addresses, runner, { require = [] } = {}) {
  if (!runner) {
    throw new Error("Missing provider/signer (runner). Connect wallet or configure an RPC provider first.");
  }

  const missing = [];
  for (const key of require) {
    const value = addresses?.[key];
    if (!isAddress(value ?? "")) {
      missing.push(key);
    }
  }
  if (missing.length) {
    throw new Error(`Missing/invalid mandatory address(es): ${missing.join(", ")}`);
  }

  const vault = isAddress(addresses?.vault ?? "") ? new Contract(addresses.vault, ABI.NGOVault, runner) : null;
  const share = isAddress(addresses?.share ?? "") ? new Contract(addresses.share, ABI.NGOShare, runner) : null;
  const asset = isAddress(addresses?.asset ?? "")
    ? // IERC20Metadata extends IERC20 (approve/allowance/balanceOf + symbol/decimals)
      new Contract(addresses.asset, ABI.IERC20Metadata, runner)
    : null;
  const governance = isAddress(addresses?.governance ?? "") ? new Contract(addresses.governance, ABI.NGOGovernance, runner) : null;
  const buffer = isAddress(addresses?.buffer ?? "") ? new Contract(addresses.buffer, ABI.NGOGovernanceBuffer, runner) : null;

  return { vault, share, asset, governance, buffer };
}


