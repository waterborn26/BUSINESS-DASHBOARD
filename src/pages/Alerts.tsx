// Alerts — configurable thresholds evaluated against live metrics.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { addDays, type Period } from "@/lib/dates";
import { fmtPct, fmtUsd } from "@/lib/money";
import { periodTotals } from "@/engines/analytics";
import { availableCash } from "@/engines/cash";
import { detectInsights } from "@/engines/insights";
import { inventoryRows } from "@/engines/inventory";
import { accountBalance } from "@/engines/ledger";

export default function Alerts() {
  const { store } = useApp();
  const [enabled, setEnabled] = useState<Map<string, boolean>>(
    new Map(store.alertConfigs.map((a) => [a.id, a.enabled])),
  );

  const evaluation = useMemo(() => {
    const today = store.today;
    const last14: Period = { start: addDays(today, -13), end: today };
    const t = periodTotals(store, last14);
    const yester = periodTotals(store, { start: addDays(today, -1), end: addDays(today, -1) });
    const norm = periodTotals(store, { start: addDays(today, -30), end: addDays(today, -1) }).netRevenue / 30;
    const cash = availableCash(store, today);
    const inv = inventoryRows(store);
    const cc = accountBalance(store, "cc_amex", today);
    const ccLimit = store.finAccounts.find((a) => a.kind === "credit_card")?.creditLimit ?? 1;

    return store.alertConfigs.map((a) => {
      let current: number, currentLabel: string, thresholdLabel: string, triggered = false;
      switch (a.metric) {
        case "net_revenue":
          current = norm > 0 ? 1 - yester.netRevenue / norm : 0;
          currentLabel = `yesterday ${fmtUsd(yester.netRevenue)} vs ${fmtUsd(Math.round(norm))} norm`;
          thresholdLabel = `drop > ${fmtPct(a.threshold, 0)}`;
          triggered = current > a.threshold;
          break;
        case "available_cash":
          current = cash.availableCash;
          currentLabel = fmtUsd(current);
          thresholdLabel = `below ${fmtUsd(a.threshold)}`;
          triggered = current < a.threshold;
          break;
        case "cac":
          current = t.blendedCac;
          currentLabel = fmtUsd(current);
          thresholdLabel = `above ${fmtUsd(a.threshold)}`;
          triggered = current > a.threshold;
          break;
        case "conversion":
          current = t.conversion;
          currentLabel = fmtPct(current, 2);
          thresholdLabel = `below ${fmtPct(a.threshold, 1)}`;
          triggered = current < a.threshold;
          break;
        case "inventory_units": {
          const low = inv.filter((r) => r.stock < a.threshold && r.velocity14 > 0.2);
          current = low.length;
          currentLabel = low.length ? `${low.length}: ${low.slice(0, 3).map((r) => r.name.split(" ")[0]).join(", ")}` : "none";
          thresholdLabel = `any product < ${a.threshold} units`;
          triggered = low.length > 0;
          break;
        }
        case "refund_rate":
          current = t.refundRatePct;
          currentLabel = fmtPct(current, 1);
          thresholdLabel = `above ${fmtPct(a.threshold, 0)}`;
          triggered = current > a.threshold;
          break;
        case "cc_utilization":
          current = cc / ccLimit;
          currentLabel = fmtPct(current, 0);
          thresholdLabel = `above ${fmtPct(a.threshold, 0)}`;
          triggered = current > a.threshold;
          break;
        default:
          current = 0; currentLabel = "—"; thresholdLabel = "—";
      }
      return { config: a, currentLabel, thresholdLabel, triggered: triggered && (enabled.get(a.id) ?? true) };
    });
  }, [store, enabled]);

  const insights = useMemo(() => detectInsights(store), [store]);
  const triggered = evaluation.filter((e) => e.triggered);

  return (
    <>
      {triggered.length > 0 && (
        <Card title={`Active alerts (${triggered.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {triggered.map((e) => (
              <div key={e.config.id} className="insight critical">
                <div className="insight-title">{e.config.label}</div>
                <div className="insight-detail">Current: {e.currentLabel} · Threshold: {e.thresholdLabel}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="Alert rules" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Enabled</th><th>Rule</th><th>Threshold</th><th>Current value</th><th>Status</th></tr></thead>
            <tbody>
              {evaluation.map((e) => (
                <tr key={e.config.id}>
                  <td>
                    <input type="checkbox" checked={enabled.get(e.config.id) ?? true}
                      onChange={(ev) => setEnabled((m) => new Map(m).set(e.config.id, ev.target.checked))} />
                  </td>
                  <td style={{ fontWeight: 600 }}>{e.config.label}</td>
                  <td className="dim">{e.thresholdLabel}</td>
                  <td>{e.currentLabel}</td>
                  <td>{e.triggered
                    ? <span className="badge critical">triggered</span>
                    : (enabled.get(e.config.id) ?? true) ? <span className="badge good">ok</span> : <span className="badge">off</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, padding: "10px 16px" }}>
          In the desktop build, triggered alerts also raise macOS notifications from the background sync
          daemon. Rules are stored locally; thresholds are editable here.
        </p>
      </Card>

      <Card title="Detected anomalies (automatic)">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {insights.map((i) => (
            <div key={i.id} className={`insight ${i.kind === "win" ? "win" : i.severity}`}>
              <div className="insight-title">{i.title}<span className="badge" style={{ marginLeft: "auto" }}>{i.confidencePct}%</span></div>
              <div className="insight-detail">{i.detail}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
