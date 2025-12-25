import React from "react";
import { formatToken, formatUsd } from "../utils/format";

export function VaultOverview({ meta, vaultStats, userStats, sharePrice, governanceStats }) {
  return (
    <section className="panel">
      <h2>Vault Overview</h2>
      <div className="grid stats">
        <div>
          <span>Total Assets ({meta.assetSymbol})</span>
          <strong>{formatUsd(vaultStats.totalAssets, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Total Supply ({meta.shareSymbol})</span>
          <strong>{formatToken(vaultStats.totalSupply, meta.shareDecimals)}</strong>
        </div>
        <div>
          <span>Price / Share</span>
          <strong>${sharePrice.toFixed(4)}</strong>
        </div>
        <div>
          <span>Queued Withdrawals</span>
          <strong>{formatUsd(vaultStats.totalQueuedAssets, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Donation Rate</span>
          <strong>{(vaultStats.donationBps / 100).toFixed(2)}%</strong>
        </div>
        <div>
          <span>Buffer Balance</span>
          <strong>{formatUsd(governanceStats.bufferBalance, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Projects</span>
          <strong>{governanceStats.projectCount}</strong>
        </div>
      </div>
      <div className="grid stats">
        <div>
          <span>Your {meta.assetSymbol}</span>
          <strong>{formatUsd(userStats.usdcBalance, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Your {meta.shareSymbol}</span>
          <strong>{formatToken(userStats.shareBalance, meta.shareDecimals)}</strong>
        </div>
        <div>
          <span>Total Deposited</span>
          <strong>{formatUsd(userStats.deposited, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Total Withdrawn</span>
          <strong>{formatUsd(userStats.withdrawn, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Total Donated</span>
          <strong>{formatUsd(userStats.donated, meta.assetDecimals)}</strong>
        </div>
      </div>
    </section>
  );
}


