// Data Sources — connector status, sync health, and data-quality transparency.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { dataQuality } from "@/engines/reconcile";
import { CONNECTIONS, CONNECTION_GROUPS, EFFORT_COPY, type ConnectionState } from "@/domain/connections";

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  connected: { cls: "good", label: "connected" },
  demo: { cls: "imported", label: "demo data" },
  available: { cls: "", label: "not connected" },
  error: { cls: "critical", label: "error" },
};

const STATE_COPY: Record<ConnectionState, { label: string; cls: string }> = {
  connected: { label: "connected", cls: "good" },
  partial: { label: "partial", cls: "imported" },
  none: { label: "not connected", cls: "" },
};

export default function DataSources() {
  const { store } = useApp();
  const quality = useMemo(() => dataQuality(store), [store]);
  const categories = useMemo(() => [...new Set(store.connectors.map((c) => c.category))], [store]);

  const live = CONNECTIONS.filter((c) => c.state !== "none").length;
  const readyNow = CONNECTIONS.filter((c) => c.state === "none" && c.effort === "ready");

  return (
    <>
      <Card title="Connections">
        <div className="conn-head">
          <div>
            <div className="hero-figure" style={{ fontSize: 34 }}>{live}<span className="muted" style={{ fontSize: 17, fontWeight: 400 }}> of {CONNECTIONS.length}</span></div>
            <div className="muted" style={{ fontSize: 12 }}>sources feeding the dashboard</div>
          </div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, flex: 1, minWidth: 280 }}>
            Every source normalises into the same entities, so each one switches on the
            same analytics. Credentials live in the macOS Keychain, never in the database
            or a config file. What differs between them is not usefulness but what it
            takes to turn them on — which is what the badges say.
          </p>
        </div>

        {readyNow.length > 0 && (
          <div className="insight info" style={{ marginBottom: 14 }}>
            <div className="insight-title">Start here</div>
            <div className="insight-detail">
              {readyNow.map((c) => c.name).join(" · ")} — {readyNow.length === 1 ? "this needs" : "these need"} only
              a file or a token, and {readyNow.length === 1 ? "it unlocks" : "they unlock"} more than everything blocked behind an app review combined.
            </div>
          </div>
        )}

        {CONNECTION_GROUPS.map((g) => (
          <div key={g} style={{ marginBottom: 16 }}>
            <div className="band-title" style={{ marginBottom: 8 }}>{g}</div>
            <div className="conn-grid">
              {CONNECTIONS.filter((c) => c.group === g).map((c) => {
                const st = STATE_COPY[c.state];
                const ef = EFFORT_COPY[c.effort];
                return (
                  <div key={c.id} className={`conn ${c.state}`}>
                    <div className="conn-title">
                      <strong>{c.name}</strong>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="conn-unlocks">{c.unlocks}</div>
                    <div className="conn-req"><span className={`badge ${ef.cls}`}>{ef.label}</span> {c.requires}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Connector sync state">
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Modular connector architecture: every source normalizes into the same entities (orders,
          transactions, ledger entries, spend, traffic…), so all analytics work identically regardless of
          origin. Credentials are stored in the macOS Keychain via the Rust shell — never in the database
          or config files. Sync is incremental with per-connector cursors. Phase 2 wires Shopify first.
        </p>
        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: 14 }}>
            <div className="card-title">{cat}</div>
            <div className="grid cols-4">
              {store.connectors.filter((c) => c.category === cat).map((c) => {
                const b = STATUS_BADGE[c.status];
                return (
                  <div key={c.id} className="card" style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 12.5 }}>{c.name}</strong>
                      <span className={`badge ${b.cls}`} style={{ marginLeft: "auto" }}>{b.label}</span>
                    </div>
                    {c.detail && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{c.detail}</div>}
                    {c.lastSync && <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Last sync: {c.lastSync}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Data quality" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Check</th><th>Value</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {quality.map((q) => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600 }}>{q.label}</td>
                  <td>{q.value}</td>
                  <td>{q.ok ? <span className="badge good">ok</span> : <span className="badge warning">attention</span>}</td>
                  <td className="dim" style={{ whiteSpace: "normal" }}>{q.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, padding: "10px 16px" }}>
          Meridian is explicit about provenance everywhere: <span className="badge imported">imported</span> figures come from
          providers, plain figures are computed deterministically from imported data, and
          <span className="badge estimate">est.</span> figures are model estimates. Estimates never silently mix with actuals.
        </p>
      </Card>

      <Card title="Manual data">
        <p className="muted" style={{ fontSize: 12.5 }}>
          Supported manual inputs: CSV bank statements, expenses, transactions, liabilities, vendor
          invoices, purchase orders, tax estimates, and per-SKU COGS. Manual entries are tagged
          <span className="badge">manual</span> and preserved in the audit log with full history.
        </p>
      </Card>
    </>
  );
}
