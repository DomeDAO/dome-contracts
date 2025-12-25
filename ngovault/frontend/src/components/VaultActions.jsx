import React from "react";
import { formatUsd, formatToken } from "../utils/format";

export function VaultActions({
  meta,
  userStats,
  depositAmount,
  setDepositAmount,
  depositPreview,
  onDeposit,
  redeemAmount,
  setRedeemAmount,
  redeemPreview,
  onRedeem,
  canTransact,
  busy,
  onFillMaxDeposit,
  onFillMaxRedeem,
  account,
}) {
  return (
    <section className="panel">
      <h2>Actions</h2>
      <div className="form-grid">
        <label>
          <span>Deposit {meta.assetSymbol}</span>
          <div className="input-row">
            <input
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
            />
            <button type="button" className="ghost small" onClick={onFillMaxDeposit} disabled={!account}>
              Max
            </button>
          </div>
          <div className="muted hint">
            Balance: {formatUsd(userStats.usdcBalance, meta.assetDecimals)} {meta.assetSymbol}
          </div>
        </label>
        <div className="action-stack">
          <button onClick={onDeposit} disabled={!canTransact || busy.deposit}>
            {busy.deposit ? "Depositing..." : "Deposit"}
          </button>
          <p className="muted hint">{depositPreview}</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>Redeem {meta.shareSymbol}</span>
          <div className="input-row">
            <input
              value={redeemAmount}
              onChange={(e) => setRedeemAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
            />
            <button type="button" className="ghost small" onClick={onFillMaxRedeem} disabled={!account}>
              Max
            </button>
          </div>
          <div className="muted hint">
            Balance: {formatToken(userStats.shareBalance, meta.shareDecimals)} {meta.shareSymbol}
          </div>
        </label>
        <div className="action-stack">
          <button onClick={onRedeem} disabled={!canTransact || busy.redeem}>
            {busy.redeem ? "Redeeming..." : "Redeem"}
          </button>
          <p className="muted hint">{redeemPreview}</p>
        </div>
      </div>
    </section>
  );
}


