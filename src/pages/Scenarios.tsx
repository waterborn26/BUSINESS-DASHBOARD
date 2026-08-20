// What If? — interactive scenario modeling on the 30-day run-rate.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { runScenario, DEFAULT_LEVERS, type ScenarioLevers } from "@/engines/scenario";

const PRESETS: { label: string; levers: Partial<ScenarioLevers> }[] = [
  { label: "Ad spend +30%", levers: { adSpendPct: 30 } },
  { label: "Conversion 2.1% → 2.5%", levers: { conversionPct: 19 } },
  { label: "Prices +8%", levers: { pricePct: 8 } },
  { label: "Order $20k inventory", levers: { inventoryPurchase: 2_000_000 } },
  { label: "Hire at $60k/yr", levers: { newHireAnnual: 6_000_000 } },
  { label: "Buy $8k equipment", levers: { equipmentPurchase: 800_000 } },
  { label: "Reserve +$10k for taxes", levers: { extraTaxReserve: 1_000_000 } },
  { label: "Revenue +20%", levers: { revenueGrowthPct: 20 } },
];

export default function Scenarios() {
  const { store } = useApp();
  const [levers, setLevers] = useState<ScenarioLevers>({ ...DEFAULT_LEVERS });
  const result = useMemo(() => runScenario(store, levers), [store, levers]);
  const { base, scenario } = result;

  const slider = (label: string, key: keyof ScenarioLevers, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-3)" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        {label} <strong style={{ color: "var(--ink)" }}>{fmt(levers[key])}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={levers[key]}
        onChange={(e) => setLevers((l) => ({ ...l, [key]: Number(e.target.value) }))} />
    </label>
  );

  const diff = (a: number, b: number) => (
    <span className={`delta ${a - b > 0 ? "up" : a - b < 0 ? "down" : "flat"}`}>
      {a === b ? "—" : fmtUsdCompact(a - b, true)}
    </span>
  );

  return (
    <>
      <Card title="What if…" right={
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p.label} className="btn" onClick={() => setLevers({ ...DEFAULT_LEVERS, ...p.levers })}>{p.label}</button>
          ))}
          <button className="btn" onClick={() => setLevers({ ...DEFAULT_LEVERS })}>Reset</button>
        </span>
      }>
        <div className="grid cols-4" style={{ gap: 18 }}>
          {slider("Ad spend", "adSpendPct", -50, 100, 5, (v) => `${v > 0 ? "+" : ""}${v}%`)}
          {slider("Conversion rate", "conversionPct", -30, 40, 1, (v) => `${v > 0 ? "+" : ""}${v}%`)}
          {slider("Prices", "pricePct", -15, 20, 1, (v) => `${v > 0 ? "+" : ""}${v}%`)}
          {slider("Demand (exogenous)", "revenueGrowthPct", -30, 50, 5, (v) => `${v > 0 ? "+" : ""}${v}%`)}
          {slider("One-time inventory buy", "inventoryPurchase", 0, 5_000_000, 100_000, (v) => fmtUsdCompact(v))}
          {slider("Equipment purchase", "equipmentPurchase", 0, 2_000_000, 100_000, (v) => fmtUsdCompact(v))}
          {slider("Extra tax reserve", "extraTaxReserve", 0, 2_000_000, 100_000, (v) => fmtUsdCompact(v))}
          {slider("New hire (annual)", "newHireAnnual", 0, 12_000_000, 500_000, (v) => fmtUsdCompact(v))}
        </div>
      </Card>

      <Card title="Impact — monthly run-rate and cash position" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Measure</th><th className="num">Current (30d actuals)</th><th className="num">Scenario</th><th className="num">Difference</th></tr></thead>
            <tbody>
              {([
                ["Monthly revenue", base.monthlyRevenue, scenario.monthlyRevenue],
                ["Monthly contribution profit", base.monthlyContribution, scenario.monthlyContribution],
                ["Monthly operating profit", base.monthlyOperatingProfit, scenario.monthlyOperatingProfit],
              ] as const).map(([label, b, s]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num dim">{fmtUsdCompact(b)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtUsdCompact(s)}</td>
                  <td className="num">{diff(s, b)}</td>
                </tr>
              ))}
              <tr>
                <td>Contribution margin</td>
                <td className="num dim">{fmtPct(base.contributionMarginPct, 1)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtPct(scenario.contributionMarginPct, 1)}</td>
                <td className="num"><span className={`delta ${scenario.contributionMarginPct >= base.contributionMarginPct ? "up" : "down"}`}>{fmtPct(scenario.contributionMarginPct - base.contributionMarginPct, 1, true)}</span></td>
              </tr>
              <tr>
                <td>Available cash (after one-time outlays)</td>
                <td className="num dim">{fmtUsd(base.availableCash)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtUsd(scenario.availableCash)}</td>
                <td className="num">{diff(scenario.availableCash, base.availableCash)}</td>
              </tr>
              <tr>
                <td>Projected cash in 90 days</td>
                <td className="num dim">{fmtUsd(base.endCash90)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtUsd(scenario.endCash90)}</td>
                <td className="num">{diff(scenario.endCash90, base.endCash90)}</td>
              </tr>
              <tr>
                <td>Runway (if cash-flow negative)</td>
                <td className="num dim">{base.runwayMonths === null ? "cash-flow positive" : `${base.runwayMonths.toFixed(1)} months`}</td>
                <td className="num" style={{ fontWeight: 700 }}>{scenario.runwayMonths === null ? "cash-flow positive" : `${scenario.runwayMonths.toFixed(1)} months`}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Assumptions">
        <ul style={{ paddingLeft: 18, color: "var(--ink-3)", fontSize: 12, lineHeight: 1.7 }}>
          {result.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </Card>
    </>
  );
}
