import React from "react";
import { formatDateTime, formatUsd, shorten } from "../utils/format";

export function GlobalWithdrawalQueue({
  provider,
  signer,
  vaultAddress,
  meta,
  globalQueueStatus,
  globalQueue,
  busy,
  onRefresh,
  onProcessAll,
  onProcessOne,
}) {
  return (
    <section className="panel">
      <h2>Global Withdrawal Queue</h2>
      <p className="muted">
        This view indexes <code>WithdrawalQueued</code> logs from <code>VITE_QUEUE_FROM_BLOCK</code>, then checks{" "}
        <code>queuedWithdrawals(user)</code> to find entries still pending. Use “Process” to clear individual entries or
        “Process all” to attempt them sequentially.
      </p>
      <div className="button-row">
        <button className="secondary" onClick={onRefresh} disabled={!provider || !vaultAddress || busy.refreshQueue}>
          {busy.refreshQueue ? "Refreshing..." : "Refresh Global Queue"}
        </button>
        <button onClick={onProcessAll} disabled={!signer || busy.processAll || !globalQueue.length}>
          {busy.processAll ? "Processing..." : "Process all"}
        </button>
      </div>
      {globalQueueStatus ? <p className="muted">{globalQueueStatus}</p> : null}
      {globalQueue.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Net</th>
                <th>Donation</th>
                <th>Receiver</th>
                <th>Requested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {globalQueue.map((q) => (
                <tr key={q.user}>
                  <td>{shorten(q.user)}</td>
                  <td>{formatUsd(q.net, meta.assetDecimals)}</td>
                  <td>{formatUsd(q.donation, meta.assetDecimals)}</td>
                  <td>{shorten(q.receiver?.toString?.() ?? q.receiver)}</td>
                  <td>{formatDateTime(typeof q.timestamp === "bigint" ? Number(q.timestamp) : Number(q.timestamp ?? 0))}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="secondary small" onClick={() => onProcessOne(q.user)} disabled={!signer}>
                      Process
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No pending queued withdrawals found (or not scanned yet).</p>
      )}
    </section>
  );
}


