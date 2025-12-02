# NGO Vault React frontend

A tiny React + Vite dashboard for exercising the HyperEVM vault deployment (deposit, redeem, queued withdrawal processing).

## Quick start

```bash
cd /home/aurelien/Documents/github/dome-contracts/ngovault/frontend
npm install
npm run dev
```

Then:

1. Open the printed `http://localhost:5173/`.
2. Connect MetaMask (or any injected wallet) to HyperEVM chain id `998`.
3. Press **Load from JSON** to auto-populate contract addresses from `public/deployments/998.json` (update that file if you redeploy).
4. Interact via the dashboard. Deposits/withdrawals mirror the vault contract guards and will highlight queued withdrawal status as Hyperliquid liquidity unlocks (≈24h).

## Production build

```
npm run build
npm run preview # optional smoke-test of the static build
```

Copy the generated `dist/` folder to any static host.

## Notes

- The app polls every 20 seconds while the tab is open and also refreshes on visibility changes or wallet events.
- Deposits/redeems are blocked while a queued withdrawal exists; use the **Process Withdrawal** button once funds are ready.
- Contract addresses persist in `localStorage` per browser to minimize re-entry across sessions.
# NGO Vault Frontend

Lightweight static UI (no build tooling required) for testing the HyperEVM deployment.

## Quick start

1. `cd /home/aurelien/Documents/github/dome-contracts/ngovault/frontend`
2. Serve the directory with any static server (examples):
   - `npx http-server -c-1 .`
   - `python -m http.server 4173`
3. Visit the printed URL (usually `http://localhost:8080`) and connect MetaMask to HyperEVM (chain id `998`).
4. Click **Load from JSON** to auto-fill vault, share, and USDC addresses from `deployments/998.json`.  
   - Update that JSON if you redeploy.
5. Use the **Actions** panel to deposit USDC or redeem shares.
6. If Hyperliquid liquidity is still locked (≈24h window), the withdrawal automatically lands in the **Withdrawal Queue** section where you can monitor readiness and click **Process Withdrawal** once funds are released.

> Tip: You can also paste addresses manually; they persist in local storage so you only have to enter them once per network.

## Notes

- The UI polls every 20 seconds while the tab is focused and whenever you reconnect your wallet.
- Deposits are disabled while a withdrawal is queued, matching the contract’s guard.
- Status logs at the bottom mirror the latest action/result to simplify debugging transactions.

