import React from "react";
import { formatDateTime, formatUsd, shorten } from "../utils/format";

export function UserWithdrawalQueue({
  queueInfo,
  meta,
  queueReadyText,
  onProcess,
  busy,
  signer,
  hasQueuedWithdrawal,
  account,
}) {
  return (
    <section className="panel">
      <h2>Withdrawal Queue</h2>
      <p className="muted">
        HyperEVM withdrawals unlock after the strategy releases liquidity (≈24h bridge window). If a redeem cannot settle
        instantly it is queued here; once ready click “Process Withdrawal”.
      </p>
      {queueInfo && queueInfo.shares > 0n ? (
        <>
          <div className="grid stats">
            <div>
              <span>Queued Shares</span>
              <strong>{formatUsd(queueInfo.shares, meta.shareDecimals, 4)}</strong>
            </div>
            <div>
              <span>Net Assets</span>
              <strong>{formatUsd(queueInfo.net, meta.assetDecimals)}</strong>
            </div>
            <div>
              <span>Donation Cap</span>
              <strong>{formatUsd(queueInfo.donation, meta.assetDecimals)}</strong>
            </div>
            <div>
              <span>Receiver</span>
              <strong>{shorten(queueInfo.receiver)}</strong>
            </div>
            <div>
              <span>Requested</span>
              <strong>{formatDateTime(queueInfo.timestamp)}</strong>
            </div>
            <div className="queue-status">
              <span>Lock Status</span>
              <strong>{queueReadyText}</strong>
            </div>
          </div>
          <div className="button-row">
            <button className="secondary" onClick={onProcess} disabled={!signer || !hasQueuedWithdrawal || busy.process}>
              {busy.process ? "Processing..." : "Process Withdrawal"}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">No queued withdrawal detected for {account ? shorten(account) : "this wallet"}.</p>
      )}
    </section>
  );
}


