// Auto-generated ABI exports
import VaultABI from "./Vault.json";
import ShareABI from "./Share.json";
import GovernanceABI from "./Governance.json";
import GovernanceBufferABI from "./GovernanceBuffer.json";
import HyperliquidBridgeAdapterABI from "./HyperliquidBridgeAdapter.json";
import HyperliquidStrategyVaultABI from "./HyperliquidStrategyVault.json";
import IStrategyVaultABI from "./IStrategyVault.json";
import IGovernanceBufferABI from "./IGovernanceBuffer.json";
import IHyperliquidBridgeAdapterABI from "./IHyperliquidBridgeAdapter.json";

export {
  VaultABI,
  ShareABI,
  GovernanceABI,
  GovernanceBufferABI,
  HyperliquidBridgeAdapterABI,
  HyperliquidStrategyVaultABI,
  IStrategyVaultABI,
  IGovernanceBufferABI,
  IHyperliquidBridgeAdapterABI,
};

// Combined export
export const abis = {
  Vault: VaultABI,
  Share: ShareABI,
  Governance: GovernanceABI,
  GovernanceBuffer: GovernanceBufferABI,
  HyperliquidBridgeAdapter: HyperliquidBridgeAdapterABI,
  HyperliquidStrategyVault: HyperliquidStrategyVaultABI,
  IStrategyVault: IStrategyVaultABI,
  IGovernanceBuffer: IGovernanceBufferABI,
  IHyperliquidBridgeAdapter: IHyperliquidBridgeAdapterABI,
} as const;
