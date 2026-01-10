import React from "react";

export function Header({ connectionBadge, onRefreshStats, disableRefresh, onConnectWallet, account }) {
  return (
    <header>
      <div>
        <h1>NGO Vault</h1>
        <p className="muted">Stake USDC on HyperEVM and track Hyperliquid bridge settlements.</p>
        <p className="muted badge">{connectionBadge}</p>
      </div>
      <div className="header-actions">
        <button className="secondary" onClick={onRefreshStats} disabled={disableRefresh}>
          Refresh Stats
        </button>
        <button onClick={onConnectWallet}>{account ? "Switch Wallet" : "Connect Wallet"}</button>
      </div>
    </header>
  );
}


