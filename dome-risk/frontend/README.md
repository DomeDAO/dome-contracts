# Dome Risk - NGO Vault Frontend (React + Vite)

Dashboard for testing the HyperEVM NGO vault end-to-end:

- Deposit (stake) USDC into `NGOVault`
- Redeem shares (may queue if Hyperliquid liquidity is locked)
- View **your** queued withdrawal + view the **global** queue (from logs)
- Process one queued withdrawal or **process all**
- Submit/vote/fund governance projects + view donation buffer balance

## Quick start

```bash
cd /home/aurelien/Documents/github/dome-contracts/dome-risk/frontend
npm install
npm run dev
```

Then:

1. Open the printed `http://localhost:5173/`
2. Connect MetaMask (or any injected wallet)
3. Switch to the right chain (HyperEVM testnet is chain id `998`)
4. Load contract addresses (see next section)

## Where do I put the contract addresses?

You have **two** ways:

### Option A (recommended): `public/deployments/<chainId>.json`

Create/update:

- `dome-risk/frontend/public/deployments/998.json` for HyperEVM testnet
- `dome-risk/frontend/public/deployments/999.json` for HyperEVM mainnet

The app reads this file when you click **Load from JSON**. It expects:

```json
{
	"contracts": {
		"vault": "0x...",
		"usdc": "0x...",
		"share": "0x...",
		"governance": "0x...",
		"buffer": "0x..."
	}
}
```

Tip: after deploying from `dome-risk/contracts`, copy the addresses from the deploy output JSON into this file.

### Option B: paste into the UI

In **Deployment Settings**, paste:

- `Vault address`
- `USDC address`
- `Share token address`
- `Governance address`
- `Buffer address`

These values are saved to **`localStorage`** in your browser, so you only enter them once per browser.

## Global queue (important)

The global queue is built by scanning `WithdrawalQueued` logs, so you must set:

- `VITE_QUEUE_FROM_BLOCK` to the vault deployment block (or earlier)

Copy `.env.example` → `.env.local` and edit:

```bash
cp .env.example .env.local
```

Then set:

- `VITE_QUEUE_FROM_BLOCK=123456`

Optional (recommended for log scanning reliability):

- `VITE_RPC_URL=https://rpc.hyperliquid-testnet.xyz/evm`

## Production build

```bash
npm run build
npm run preview
```

## Notes

- Deposits/redeems are blocked while **your** withdrawal is queued (matches the smart contract guard).
- “Process all” will submit multiple transactions sequentially (your wallet will ask you to confirm each one).
