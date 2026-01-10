import React from "react";
import { formatDateTime, formatToken, formatUsd, shorten } from "../utils/format";

export function GovernanceProjects({
  provider,
  signer,
  governanceAddressesAreValid,
  meta,
  governanceStats,
  projects,
  busy,
  onLoadProjects,
  onFundTop,
  projectForm,
  setProjectForm,
  onSubmitProject,
  onVote,
}) {
  return (
    <section className="panel">
      <h2>Governance & Projects</h2>
      <p className="muted">
        Submit projects, vote with your <code>{meta.shareSymbol}</code> balance, and fund the top eligible project using
        the donation buffer.
      </p>

      <div className="grid stats">
        <div>
          <span>Buffer Available</span>
          <strong>{formatUsd(governanceStats.bufferBalance, meta.assetDecimals)}</strong>
        </div>
        <div>
          <span>Project Count</span>
          <strong>{governanceStats.projectCount}</strong>
        </div>
      </div>

      <div className="button-row">
        <button className="secondary" onClick={onLoadProjects} disabled={!provider || !governanceAddressesAreValid}>
          Load projects
        </button>
        <button onClick={onFundTop} disabled={!signer || !projects.length || busy.fund}>
          {busy.fund ? "Funding..." : "Fund top eligible"}
        </button>
      </div>

      <div className="panel-subsection">
        <h3>Submit project</h3>
        <div className="grid">
          <label>
            <span>Project wallet</span>
            <input
              value={projectForm.wallet}
              onChange={(e) => setProjectForm((p) => ({ ...p, wallet: e.target.value.trim() }))}
              placeholder="0x..."
            />
          </label>
          <label>
            <span>Amount requested ({meta.assetSymbol})</span>
            <input
              value={projectForm.amount}
              onChange={(e) => setProjectForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0.00"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            <span>Description</span>
            <input
              value={projectForm.description}
              onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Short description"
            />
          </label>
        </div>
        <div className="button-row">
          <button onClick={onSubmitProject} disabled={!signer || busy.submitProject || !governanceAddressesAreValid}>
            {busy.submitProject ? "Submitting..." : "Submit"}
          </button>
        </div>
      </div>

      {projects.length ? (
        <div className="project-list">
          {projects.map((p) => {
            const now = Math.floor(Date.now() / 1000);
            const votingStarts = Number(p.votingStart ?? 0);
            const votingEnds = Number(p.votingEnd ?? 0);
            const votingStatus = now < votingStarts ? "Voting not started" : now > votingEnds ? "Voting ended" : "Voting active";

            return (
              <div className="project-card" key={p.id}>
                <div className="project-header">
                  <div>
                    <strong>Project #{p.id}</strong> {p.funded ? <span className="tag">Funded</span> : null}
                    <div className="muted">{shorten(p.projectWallet)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>
                      <span className="muted">Requested</span>{" "}
                      <strong>{formatUsd(p.amountRequested, meta.assetDecimals)}</strong>
                    </div>
                    <div>
                      <span className="muted">Votes</span> <strong>{formatToken(p.votes, meta.shareDecimals)}</strong>
                    </div>
                  </div>
                </div>
                <p className="muted">{p.description || "—"}</p>
                <div className="grid stats">
                  <div>
                    <span>Created</span>
                    <strong>{formatDateTime(p.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Voting start</span>
                    <strong>{formatDateTime(p.votingStart)}</strong>
                  </div>
                  <div>
                    <span>Voting end</span>
                    <strong>{formatDateTime(p.votingEnd)}</strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{votingStatus}</strong>
                  </div>
                </div>
                <div className="button-row">
                  <button className="secondary" onClick={() => onVote(p.id)} disabled={!signer || busy.vote || p.funded || p.hasVoted}>
                    {p.hasVoted ? "Voted" : busy.vote ? "Voting..." : "Vote"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">No projects loaded yet.</p>
      )}
    </section>
  );
}


