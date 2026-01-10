import React from "react";

export function StatusPanel({ status }) {
  return (
    <section className="panel">
      <h2>Status</h2>
      <pre className="status-box">{status}</pre>
    </section>
  );
}


