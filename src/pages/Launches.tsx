// Launch analytics — compare launches + pre-launch forecaster with scenarios.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { fmtDateFull } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { launchStats, forecastLaunch, type LaunchForecastInput } from "@/engines/launches";

export default function Launches() {
  const { store } = useApp();
  const stats = useMemo(() => launchStats(store), [store]);

  const [input, setInput] = useState<LaunchForecastInput>({
    price: 12800, unitCost: 4200, inventory: 400, marketingBudget: 300000,
    expectedSessions: 18000, emailListSize: 9500,
  });
  const scenarios = useMemo(() => forecastLaunch(store, input), [store, input]);

  const best = stats.length >= 2
    ? [...stats].sort((a, b) => b.contribution30 - a.contribution30)[0]
    : null;
  const byRev = stats.length >= 2 ? [...stats].sort((a, b) => b.day30Revenue - a.day30Revenue)[0] : null;

  const set = (k: keyof LaunchForecastInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInput((s) => ({ ...s, [k]: Number(e.target.value) * (k === "price" || k === "unitCost" || k === "marketingBudget" ? 100 : 1) }));

  return (
    <>
      {best && byRev && best.launch.id !== byRev.launch.id && (
        <div className="insight info">
          <div className="insight-title">Launch comparison insight</div>
          <div className="insight-detail">
            {byRev.launch.name} generated the most revenue ({fmtUsdCompact(byRev.day30Revenue)}), but{" "}
            {best.launch.name} produced the most contribution profit ({fmtUsdCompact(best.contribution30)}) —
            lower discounts and marketing cost per order. Revenue and profit rank launches differently.
          </div>
        </div>
      )}

      <div className="grid cols-3">
        {stats.map((s) => (
          <Card key={s.launch.id} title={<>{s.launch.name}</>} right={<span className="muted">{fmtDateFull(s.launch.date)}</span>}>
            <div className="kpi-value" style={{ fontSize: 22 }}>{fmtUsdCompact(s.day30Revenue)}</div>
            <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>30-day revenue · {s.productNames.join(", ")}</div>
            <div className="evidence">
              <div><span className="lbl">Launch-day revenue</span><span className="val">{fmtUsdCompact(s.launchDayRevenue)}</span></div>
              <div><span className="lbl">First-24h orders</span><span className="val">{fmtNum(s.first24hOrders)}</span></div>
              <div><span className="lbl">7-day revenue</span><span className="val">{fmtUsdCompact(s.day7Revenue)}</span></div>
              <div><span className="lbl">Units (30d)</span><span className="val">{fmtNum(s.unitsSold30)}</span></div>
              <div><span className="lbl">AOV</span><span className="val">{fmtUsd(s.aov)}</span></div>
              <div><span className="lbl">New customers</span><span className="val">{fmtNum(s.newCustomers)}</span></div>
              <div><span className="lbl">Returning</span><span className="val">{fmtNum(s.returningCustomers)}</span></div>
              <div><span className="lbl">Sell-through (30d)</span><span className="val">{fmtPct(s.sellThroughPct, 0)}</span></div>
              <div><span className="lbl">Gross profit</span><span className="val">{fmtUsdCompact(s.grossProfit30)}</span></div>
              <div><span className="lbl">Contribution*</span><span className="val" style={{ color: s.contribution30 > 0 ? "var(--delta-good)" : "var(--delta-bad)" }}>{fmtUsdCompact(s.contribution30)}</span></div>
              <div><span className="lbl">Marketing spend</span><span className="val">{fmtUsdCompact(s.marketingSpend)}</span></div>
              <div><span className="lbl">Pre-launch traffic lift</span><span className="val">{fmtPct(s.preLaunchSessionsLift, 0, true)}</span></div>
            </div>
            <p className="muted" style={{ fontSize: 10.5, marginTop: 8 }}>*after COGS, fees, fulfillment, and launch marketing budget</p>
          </Card>
        ))}
      </div>

      <Card title={<>Launch forecaster <span className="badge estimate">estimates</span></>}>
        <div className="grid cols-2">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([
              ["Price ($)", "price", input.price / 100],
              ["Unit cost ($, landed)", "unitCost", input.unitCost / 100],
              ["Inventory (units)", "inventory", input.inventory],
              ["Marketing budget ($)", "marketingBudget", input.marketingBudget / 100],
              ["Expected launch-window sessions", "expectedSessions", input.expectedSessions],
              ["Email list size", "emailListSize", input.emailListSize],
            ] as const).map(([label, key, val]) => (
              <label key={key} style={{ fontSize: 11.5, color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 4 }}>
                {label}
                <input type="number" value={val} onChange={set(key)} />
              </label>
            ))}
            <p className="muted" style={{ gridColumn: "1 / -1", fontSize: 11.5 }}>
              Assumptions from past launches: launch traffic converts at ~1.6× site baseline; ~1.8% of the
              email list purchases during the window. Adjust inputs to test plans.
            </p>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Scenario</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Gross profit</th><th className="num">Contribution</th><th className="num">Cash generated</th><th className="num">Left over</th></tr></thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 600 }}>{s.name} {s.stockout && <span className="badge warning">sells out</span>}</td>
                    <td className="num">{fmtNum(s.units)}</td>
                    <td className="num">{fmtUsdCompact(s.revenue)}</td>
                    <td className="num">{fmtUsdCompact(s.grossProfit)}</td>
                    <td className="num" style={{ color: s.contribution > 0 ? "var(--delta-good)" : "var(--delta-bad)" }}>{fmtUsdCompact(s.contribution)}</td>
                    <td className="num">{fmtUsdCompact(s.cashGenerated)}</td>
                    <td className="num dim">{fmtNum(s.remainingInventory)} units</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </>
  );
}
