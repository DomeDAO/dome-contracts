## Hyperliquid Vault Overview

`HyperliquidVault` is an ERC-4626 adapter that keeps the existing Dome deposit/withdraw UX while routing capital to Hyperliquid via HyperCore. It wraps USDC and tracks both on-chain balances and capital that is temporarily deployed through the `buffer` wallet (the Hyperliquid vault leader).

### Contracts

| Contract                                        | Purpose                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `contracts/hyperliquid/HyperliquidVault.sol`    | ERC-4626 implementation with auto-deploy, PnL reporting, IOU/voting power, and HyperCore forwarding |
| `contracts/hyperliquid/HyperliquidBuffer.sol`   | Treasury that records reserves per vault and settles payouts for winning projects                   |
| `contracts/hyperliquid/HyperliquidGovernor.sol` | Lightweight governor that reuses the Dome voting flow for Hyperliquid vaults                        |
| `contracts/hyperliquid/HyperliquidActions.sol`  | Utility library for encoding HyperCore `CoreWriter` payloads                                        |
| `contracts/hyperliquid/ICoreWriter.sol`         | Minimal interface for the system contract at `0x3333…3333`                                          |
| `contracts/mocks/MockCoreWriter.sol`            | Test double used by Hardhat tests                                                                   |

### Roles

- **Buffer Operator** – the address allowed to deploy/withdraw capital from Hyperliquid (`deployToHyperliquid`, `recordLoss`, etc.).
- **Buffer Treasury** – the on-chain treasury contract that accumulates profit share, tracks vault reserves, and releases funds to winning projects.
- **Owner** – receives the owner portion of realised profit, can pause/unpause the vault, and adjust fees.
- **Depositors** – interact with the vault through standard ERC-4626 functions (`deposit`, `withdraw`, `mint`, `redeem`).
- **IOU token holders** – every share of the vault mints an on-chain IOU (configurable name/symbol, defaults to `Hyperliquid IOU (hlIOU)`) that implements `ERC20Votes`. Delegating this token grants governance power identical to other Dome vaults, while the tokens themselves remain redeemable for underlying USDC.

### Capital Lifecycle

1. Depositors supply USDC into the vault; shares are minted via ERC-4626 math.
2. With auto-deploy enabled, the vault immediately forwards the freshly deposited USDC to the buffer/Hyperliquid action in the same transaction; `deployToHyperliquid` remains available for manual redeployments.
3. While positions are live, the buffer periodically calls `reportDeployedValue(currentEquity)` so share/IOU prices reflect live PnL and new deposits mint at the correct ratio.
4. When positions unwind, the buffer funds the vault with principal + realised PnL, then calls `reconcileFromHyperliquid(principal, profit)`:
   - `deployedAssets` decreases.
   - Profit is split between buffer, owner, and depositors using `bufferFeeBps` / `ownerFeeBps`.
5. Losses are recorded via `recordLoss(lossAmount)` which simply reduces `deployedAssets`.

### Withdrawal Cooldown

Hyperliquid itself prevents withdrawing capital during the first 24 hours after a deposit. The vault now enforces the same policy:

- Every deployment (manual or through auto-deploy) schedules a `nextWithdrawalTimestamp = block.timestamp + 24h`.
- `reconcileFromHyperliquid` reverts with `WithdrawalCooldownActive(nextWithdrawalTimestamp)` until that timestamp has passed.
- Operators and UIs can call `withdrawalCooldownInfo()` to fetch the timestamp and a ready/remaining indicator.

In practice you should batch deposits, deploy once, let positions run for a day, reconcile, then deploy the next batch. Redeploying immediately after a reconciliation automatically starts the new 24‑hour cooldown.

### Deploy Script

`scripts/deployHyperliquidVault.js` deploys the vault and accepts the following environment variables:

| Variable                     | Description                                         | Default           |
| ---------------------------- | --------------------------------------------------- | ----------------- |
| `HYPERLIQUID_USDC`           | USDC token address on HyperEVM                      | **required**      |
| `HYPERLIQUID_CORE_WRITER`    | CoreWriter address                                  | `0x3333…3333`     |
| `HYPERLIQUID_BUFFER`         | Buffer operator/manager (calls Hyperliquid actions) | deployer signer   |
| `HYPERLIQUID_TREASURY`       | Address of the deployed `HyperliquidBuffer`         | **required**      |
| `HYPERLIQUID_OWNER`          | System owner (receives owner fee)                   | deployer signer   |
| `HYPERLIQUID_BUFFER_FEE_BPS` | Treasury profit share in basis points               | `500`             |
| `HYPERLIQUID_OWNER_FEE_BPS`  | Owner fee in basis points                           | `500`             |
| `HYPERLIQUID_IOU_NAME`       | ERC20/permit name for the IOU token                 | `Hyperliquid IOU` |
| `HYPERLIQUID_IOU_SYMBOL`     | ERC20 symbol for the IOU token                      | `hlIOU`           |

Example:

```bash
npx hardhat run scripts/deployHyperliquidVault.js --network hyperliquidTestnet \
  --show-stack-traces \
  --env HYPERLIQUID_USDC=0x... \
  --env HYPERLIQUID_OWNER=0xOwner \
  --env HYPERLIQUID_BUFFER=0xBuffer \
  --env HYPERLIQUID_BUFFER_FEE_BPS=750
```

### Integrating with Dome Protocol

1. Deploy `HyperliquidVault` on the desired network.
2. Deploy a `HyperliquidBuffer` treasury and call `registerVault(vault, governance, usdc)` to whitelist the vault.
3. Deploy `HyperliquidGovernor` with the vault address as the voting token, then call `updateGovernance` on the buffer to allow payouts.
4. Register the vault address through `configureYieldProviders` on `DomeProtocol`, setting the provider type to `YIELD_PROVIDER_TYPE_HYPERLIQUID`. While creating a Dome, pass the deployed vault as the yield provider so IOU voting aligns with the rest of the protocol.

### Project Voting Lifecycle

1. Profits realised through `reconcileFromHyperliquid` send the treasury share directly to the `HyperliquidBuffer`, which tracks `vaultReserves`.
2. Delegated IOU holders create projects via `HyperliquidGovernor.propose(wallet, amount, title, description)`.
3. Votes accrue using the same “highest vote wins” logic as the Dome governor. Anyone can call `triggerProposal()` to execute the proposal with the most votes.
4. During execution the governor instructs the buffer to `submitTransfer`, debiting reserves and transferring USDC to the project wallet.

This mirrors the legacy Dome flow: the manager keeps control over Hyperliquid positions, while treasury funds are always disbursed via on-chain governance.

### Auto-Deploy Configuration

To keep staking UX to a single transaction you can automatically forward newly deposited USDC to Hyperliquid:

```solidity
await vault.updateAutoDeployConfig(
	true,                // enable auto deployments
	ACTION_SEND_ASSET,   // HyperCore action id (13)
	buffer.address       // destination sent to HyperCore
);
```

When enabled, every successful `deposit`/`mint` transfers the fresh assets to the buffer and emits the configured HyperCore action through the `CoreWriter` system contract. Manual calls to `deployToHyperliquid` are still available for re-deploying returned capital or custom strategy steps, but the default path (user approves + deposits) now makes Hyperliquid receive the funds immediately while IOU shares are minted for the depositor in the same transaction.

### Staking Flow (Example)

```js
// 1. Deposit – IOUs are minted and capital is auto-deployed to Hyperliquid in one tx
await usdc.approve(vault.address, amount);
await vault.deposit(amount, signer.address);

// 2. Delegate voting power (hlIOU = your voting token)
await vault.delegate(signer.address);

// 3. Buffer (or keeper) reports Hyperliquid equity so shares reflect PnL
await vault.connect(bufferOperator).reportDeployedValue(latestEquity);

// 4. Create proposals once reserves are available
await governor.propose(
	projectWallet,
	requestedAmount,
	"Fund Project",
	"Description"
);
```

To exit, the keeper brings funds back (calling `reconcileFromHyperliquid`) and the user calls `vault.redeem(...)`. The new `positionValue(owner)` helper returns the current value of any IOU stack (`convertToAssets(balanceOf(owner))`), which front-ends can show to users even before funds are bridged home.

### Testing

```
npm run test -- test/hyperliquid/vault.test.js
```

The dedicated test suite achieves full branch coverage for the new contracts by:

- Mocking HyperCore actions with `MockCoreWriter`.
- Exercising profit distribution and fee routing.
- Verifying access control for buffer/owner specific functions.
- Checking loss accounting and action forwarding helpers.
