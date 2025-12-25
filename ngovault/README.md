# HyperEVM NGO Vault (Hyperliquid)

NGO Vault is a HyperEVM-native ERC-4626 style vault that aggregates USDC donations, deploys capital into Hyperliquid's native vault, and routes profits toward civil society projects. Depositors receive `NGOShare` (18‑decimals) receipts, while a configurable portion of every profitable withdrawal is donated to the governance buffer that funds approved initiatives.

> **Key constraints:** withdrawals are subject to Hyperliquid's ~24h liquidity release window and operations may only stage funds for Hyperliquid once per day. Those guardrails are enforced operationally (runbook & monitoring) and partially on-chain via withdrawal queuing.

---

## Contract Topology

| Component | Location | Responsibility |
| --- | --- | --- |
| `NGOVault` | `contracts/contracts/NGOVault.sol` | Entry point for deposits, redemptions, accounting, and queuing during Hyperliquid lockups. |
| `NGOShare` | `contracts/contracts/NGOShare.sol` | Share token minted/burned exclusively by the vault. |
| `NGOGovernance` | `contracts/contracts/NGOGovernance.sol` | Registers/votes on projects and instructs the buffer to release donated funds. |
| `NGOGovernanceBuffer` | `contracts/contracts/NGOGovernanceBuffer.sol` | Custodies donated USDC until governance disbursement. |
| `HyperliquidStrategyVault` | `contracts/contracts/hyperliquid/HyperliquidStrategyVault.sol` | ERC-4626 strategy wrapper that talks to the bridge. |
| `HyperliquidBridgeAdapter` | `contracts/contracts/hyperliquid/HyperliquidBridgeAdapter.sol` | Handles deposits/redemptions against Hyperliquid's native vault and emits `CoreWriter` actions. |

### Fund Lifecycle

1. **Deposit (any time)** – Users send USDC to `NGOVault.deposit`, which forwards assets into `HyperliquidStrategyVault`. Shares are priced against the strategy's managed assets (`totalAssets()`). Deposits are blocked if a withdrawal is already queued for that user, preventing re-entrancy and enforcing the "one action at a time" UX guard.
2. **Strategy deployment (once per day)** – Ops aggregates same-day inflows in the strategy and invokes `bridge.stake`. While not programmatically enforced, runbook adherence keeps Hyperliquid submissions under the platform's daily transfer expectations.
3. **Withdrawal attempts** – `NGOVault.redeem` tries to pull funds back through the strategy and bridge immediately. If Hyperliquid still locks liquidity (≈24h), the request is stored in `queuedWithdrawals` with timestamp metadata and contributes to `totalQueuedWithdrawalAssets`, preventing newly arriving deposits from being over-counted in share pricing.
4. **Processing queued requests** – Anyone may call `processQueuedWithdrawal` once Hyperliquid releases liquidity; the vault re-attempts the withdrawal, updates per-user accounting, and transfers net proceeds plus the donation to the buffer/governance recipient.
5. **Donation & governance** – Profit portions (default 10%, configurable via `donationBps`) flow into the buffer. `NGOGovernance` tracks voting windows (7 day delay, 180 day duration) and, once a project wins, instructs the buffer to disburse funds.

---

## Deploying to HyperEVM

All commands are executed from `ngovault/contracts`.

```bash
cd /home/aurelien/Documents/github/dome-contracts/ngovault/contracts
npm install
```

1. Copy `.env.example` (or create `.env`) and set:

   ```
   HYPER_EVM_PRIVATE_KEY=0xabc...                # funded HyperEVM key
   HYPER_EVM_USDC=0x...                          # canonical USDC (see Hyperliquid docs)
   HYPER_EVM_NETWORK=testnet                     # or mainnet
   HYPER_EVM_HYPER_VAULT=0x93ad...               # default native vault OK for most cases
   HYPER_EVM_CORE_WRITER=0x3333...               # CoreWriter system contract
   HYPER_EVM_DONATION_BPS=1000                   # 10% default
   HYPER_EVM_SHARE_NAME="NGO Hyper Share"
   HYPER_EVM_SHARE_SYMBOL="NGO-H"
   HYPER_EVM_DEPLOY_OUTPUT=../deployments/hyperevm.json
   ```

2. Point Hardhat at HyperEVM (RPC defaults provided in `config/hyperevm.ts`). Override `HYPER_EVM_RPC` and `HYPER_EVM_CHAIN_ID` if you are on a fork.

3. Deploy everything (bridge → strategy → share → buffer → governance → vault) with the curated script:

   ```bash
   npx hardhat run scripts/deploy-hyperevm.ts --network hyperevm
   ```

   The script verifies env vars, predicts the `NGOVault` address ahead of time (required by `NGOShare`), authorizes the strategy on the bridge, and writes metadata to `deployments/hyperevm*.json`.

4. Sync the React dashboard by copying the resulting contract addresses into `frontend/public/deployments/<chainId>.json`.

---

## Daily Operations Runbook

- **Morning (UTC)** – Aggregate inbound donations off-chain, then perform a single `HyperliquidStrategyVault.deposit` → `bridge.stake` flow so that only one Hyperliquid submission occurs per 24h window.
- **Midday** – Watch `QueuedWithdrawal` events (emitted by `NGOVault`) and the `totalQueuedWithdrawalAssets` metric. If requests exist, schedule a `processQueuedWithdrawal` as soon as Hyperliquid signals liquidity availability.
- **Evening** – Review `NGOGovernanceBuffer.balance()` to ensure donated funds align with expectations and there were no unexpected releases.
- **Monitoring** – Subscribe to `HyperliquidBridgeAdapter.StrategyAuthorizationUpdated` for governance oversight and `CoreWriter` action confirmations to match Hyperliquid settlements.

Because the once-per-day staging is an operational rule rather than a smart-contract limit, document each submission (tx hash, USD amount, timestamp) in your ops log before triggering the bridge. This log doubles as proof for Hyperliquid support if settlement needs to be traced.

---

## Testing & Tooling

- **Unit tests** – `npm run test` (Hardhat network). Coverage: `npm run coverage`.
- **Static checks** – `npm run lint`.
- **Gas snapshots** – enable via `HARDHAT_GAS_REPORT=true` before running tests.
- **Local fork smoke test** – `HYPER_EVM_NETWORK=testnet` plus `HYPER_EVM_RPC=http://127.0.0.1:8545` lets you exercise deployments inside Foundry/Anvil nodes so long as the canonical contracts are preloaded.

---

## Frontend Companion

The lightweight dashboard in `ngovault/frontend` mirrors the vault's guards (queued withdrawals disable deposits, 20s polling cadence). Follow its dedicated README for Vite instructions, then point it at your deployment JSON to:

- Deposit USDC and mint `NGOShare`.
- Observe queued withdrawals during the 24h lock.
- Trigger `processQueuedWithdrawal` once Hyperliquid releases funds.

---

## Security Considerations

- Vault share math excludes `totalQueuedWithdrawalAssets` from `totalAssets()` to avoid over-reporting NAV while funds await unlocks.
- `HyperliquidBridgeAdapter` stores per-strategy share balances and checks `convertToAssets` before redeeming, preventing over-withdraw.
- Only the vault may mint/burn `NGOShare`; governance actions rely on token balances for weight.
- Buffer releases require explicit `NGOGovernance` calls; the owner role is only used to set governance addresses.
- Always verify CoreWriter payloads when upgrading Hyperliquid contracts—action encoding (`0x01` + `0x000002`) must remain in sync with official docs.

Keep `HYPER_EVM_PRIVATE_KEY` cold and rotate donation parameters (`donationBps`) via multisig ownership to avoid unilateral fee changes.












