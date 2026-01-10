import React from "react";

export function DeploymentSettings({
  addresses,
  onChangeAddress,
  onLoadFromJson,
  onClearSaved,
  chainId,
}) {
  return (
    <section className="panel">
      <h2>Deployment Settings</h2>
      <div className="grid">
        <label>
          <span>Vault address</span>
          <input value={addresses.vault} onChange={(e) => onChangeAddress("vault", e.target.value)} placeholder="0x..." />
        </label>
        <label>
          <span>USDC address</span>
          <input value={addresses.asset} onChange={(e) => onChangeAddress("asset", e.target.value)} placeholder="0x..." />
        </label>
        <label>
          <span>Share token address</span>
          <input value={addresses.share} onChange={(e) => onChangeAddress("share", e.target.value)} placeholder="0x..." />
        </label>
        <label>
          <span>Governance address</span>
          <input
            value={addresses.governance}
            onChange={(e) => onChangeAddress("governance", e.target.value)}
            placeholder="0x..."
          />
        </label>
        <label>
          <span>Buffer address</span>
          <input value={addresses.buffer} onChange={(e) => onChangeAddress("buffer", e.target.value)} placeholder="0x..." />
        </label>
      </div>
      <p className="muted">
        Paste deployed contract addresses for the current network or host <code>/deployments/&lt;chainId&gt;.json</code>{" "}
        and click “Load from JSON”.
      </p>
      <div className="button-row">
        <button className="secondary" onClick={onLoadFromJson}>
          Load from JSON{chainId ? ` (${chainId})` : ""}
        </button>
        <button className="ghost" onClick={onClearSaved}>
          Clear saved
        </button>
      </div>
    </section>
  );
}


