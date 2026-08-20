// Settings — appearance, financial assumptions, keyboard, security, about.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { trialBalanceError } from "@/engines/ledger";
import { LEAD_TIME_DAYS, REORDER_COVER_DAYS, CASH_FLOOR } from "@/engines/inventory";
import { fmtUsd } from "@/lib/money";

export default function Settings() {
  const { store, theme, setTheme } = useApp();
  const tbe = useMemo(() => trialBalanceError(store, store.today), [store]);

  return (
    <>
      <Card title="Appearance">
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12.5 }}>Theme</span>
          <span className="seg">
            <button className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>Dark</button>
            <button className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>Light</button>
          </span>
          <span className="muted" style={{ fontSize: 11.5 }}>Persisted across sessions, follows the window immediately.</span>
        </div>
      </Card>

      <Card title="Financial assumptions">
        <div className="tbl-wrap">
          <table className="tbl" style={{ maxWidth: 640 }}>
            <tbody>
              <tr><td>Estimated effective income tax rate</td><td className="num">{store.incomeTaxRatePct}%</td><td className="dim">Drives the planning reserve only — never filing figures</td></tr>
              <tr><td>Available-cash floor (alerts)</td><td className="num">{fmtUsd(CASH_FLOOR)}</td><td className="dim">Cash forecast warns below this; reorder planner never spends past it</td></tr>
              <tr><td>Supplier lead time (default)</td><td className="num">{LEAD_TIME_DAYS} days</td><td className="dim">Used for reorder points; per-vendor in live build</td></tr>
              <tr><td>Reorder coverage target</td><td className="num">{REORDER_COVER_DAYS} days</td><td className="dim">Post-receipt days of supply</td></tr>
              <tr><td>Settlement lag (Shopify Payments)</td><td className="num">2 days</td><td className="dim">Clearing → checking</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Keyboard shortcuts">
        <div className="tbl-wrap">
          <table className="tbl" style={{ maxWidth: 520 }}>
            <tbody>
              <tr><td><span className="kbd">⌘K</span> or <span className="kbd">/</span></td><td>Command palette / universal search</td></tr>
              <tr><td><span className="kbd">⌘1</span>–<span className="kbd">⌘9</span></td><td>Jump to the first nine sections</td></tr>
              <tr><td><span className="kbd">g</span> then <span className="kbd">c/s/f/t/p/x/i/m/a/r</span></td><td>Go to Command Center, Sales, Finance, Transactions, P&L, Cash Flow, Inventory, Marketing, Analyst, Reports</td></tr>
              <tr><td><span className="kbd">Esc</span></td><td>Close palette / drilldown drawer</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Security & privacy">
        <ul style={{ paddingLeft: 18, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
          <li>All data is stored locally in SQLite inside the app container — no cloud dependency.</li>
          <li>API credentials live exclusively in the macOS Keychain (Rust <code className="mono">keyring</code>), never in the database, config, or logs.</li>
          <li>OAuth is used wherever providers support it; tokens are refreshed by the Rust shell.</li>
          <li>The AI layer receives computed aggregates only — never raw customer rows or credentials.</li>
          <li>Strict CSP; no third-party scripts, fonts, or telemetry.</li>
        </ul>
      </Card>

      <Card title="About / diagnostics">
        <div className="tbl-wrap">
          <table className="tbl" style={{ maxWidth: 640 }}>
            <tbody>
              <tr><td>Version</td><td>Meridian 0.1.0 (Phase 1 — demo dataset)</td></tr>
              <tr><td>Ledger integrity</td><td>{tbe === 0 ? <span className="badge good">trial balance = 0 · every entry balances</span> : <span className="badge critical">off by {tbe}¢</span>}</td></tr>
              <tr><td>Dataset</td><td>{store.orders.length.toLocaleString()} orders · {store.customers.length.toLocaleString()} customers · {store.ledger.length.toLocaleString()} journal entries · {store.days.length} days</td></tr>
              <tr><td>Stack</td><td>Tauri 2 · React 19 · TypeScript · SQLite · custom SVG charts</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
