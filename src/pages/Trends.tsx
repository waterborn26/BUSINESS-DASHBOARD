// Trend detection — metric momentum and product acceleration/decline.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { Sparkline } from "@/components/charts/Sparkline";
import { addDays, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { periodTotals, productStats, series, type MetricId } from "@/engines/analytics";

interface TrendRow {
  label: string;
  metric: MetricId;
  fmt: (v: number) => string;
  invert?: boolean; // rising is bad
}

const WATCHED: TrendRow[] = [
  { label: "Net revenue", metric: "net_revenue", fmt: fmtUsdCompact },
  { label: "Orders", metric: "orders", fmt: (v) => fmtNum(Math.round(v)) },
  { label: "AOV", metric: "aov", fmt: (v) => fmtUsd(Math.round(v)) },
  { label: "Conversion", metric: "conversion", fmt: (v) => fmtPct(v, 2) },
  { label: "Sessions", metric: "sessions", fmt: (v) => fmtNum(Math.round(v)) },
  { label: "Contribution profit", metric: "contribution_profit", fmt: fmtUsdCompact },
  { label: "Ad spend", metric: "ad_spend", fmt: fmtUsdCompact, invert: true },
  { label: "CAC", metric: "cac", fmt: (v) => fmtUsd(Math.round(v)), invert: true },
  { label: "Refunds", metric: "refunds", fmt: fmtUsdCompact, invert: true },
  { label: "New customers", metric: "new_customers", fmt: (v) => fmtNum(Math.round(v)) },
];

export default function Trends() {
  const { store } = useApp();
  const today = store.today;
  const last28: Period = { start: addDays(today, -27), end: today };
  const prior28: Period = { start: addDays(today, -55), end: addDays(today, -28) };
  const before28: Period = { start: addDays(today, -83), end: addDays(today, -56) };

  const rows = useMemo(() => {
    const cur = periodTotals(store, last28);
    const prev = periodTotals(store, prior28);
    const before = periodTotals(store, before28);
    const val = (t: ReturnType<typeof periodTotals>, m: MetricId): number => {
      switch (m) {
        case "net_revenue": return t.netRevenue;
        case "orders": return t.orders;
        case "aov": return t.aov;
        case "conversion": return t.conversion;
        case "sessions": return t.sessions;
        case "contribution_profit": return t.contributionProfit;
        case "ad_spend": return t.adSpend;
        case "cac": return t.blendedCac;
        case "refunds": return t.refunds;
        case "new_customers": return t.newCustomers;
        default: return 0;
      }
    };
    return WATCHED.map((wdef) => {
      const c = val(cur, wdef.metric), p = val(prev, wdef.metric), b = val(before, wdef.metric);
      const g1 = p ? (c - p) / p : 0;              // recent growth
      const g0 = b ? (p - b) / b : 0;              // prior growth
      const accel = g1 - g0;
      const spark = series(store, wdef.metric, { start: addDays(today, -83), end: today }).map((x) => x.value);
      // weekly buckets for the sparkline
      const weekly: number[] = [];
      for (let i = 0; i < spark.length; i += 7) weekly.push(spark.slice(i, i + 7).reduce((t2, v) => t2 + v, 0) / Math.min(7, spark.length - i));
      return { ...wdef, current: c, prev: p, g1, accel, weekly };
    });
  }, [store]);

  const products = useMemo(() => productStats(store, last28), [store]);
  const rising = [...products].filter((p) => p.units > 20).sort((a, b) => b.trendPct - a.trendPct).slice(0, 5);
  const falling = [...products].filter((p) => p.units > 10).sort((a, b) => a.trendPct - b.trendPct).slice(0, 5);

  const state = (g1: number, accel: number, invert?: boolean) => {
    const good = invert ? g1 < 0 : g1 > 0;
    if (Math.abs(g1) < 0.03) return { label: "stable", cls: "" };
    if (good && accel > 0.03) return { label: "accelerating", cls: "good" };
    if (good) return { label: "growing", cls: "good" };
    if (!good && accel < -0.03) return { label: "deteriorating", cls: "critical" };
    return { label: invert ? "rising (watch)" : "slowing", cls: "warning" };
  };

  return (
    <>
      <Card title="Metric momentum — 28-day windows" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Metric</th><th>12 weeks</th><th className="num">Current 28d</th><th className="num">Prior 28d</th><th className="num">Change</th><th className="num">Acceleration</th><th>State</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const s = state(r.g1, r.accel, r.invert);
                return (
                  <tr key={r.metric}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td><Sparkline values={r.weekly} color="var(--s1)" /></td>
                    <td className="num">{r.fmt(r.current)}</td>
                    <td className="num dim">{r.fmt(r.prev)}</td>
                    <td className="num">{fmtPct(r.g1, 1, true)}</td>
                    <td className="num dim">{fmtPct(r.accel, 1, true)}</td>
                    <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Emerging products (28d units vs prior)">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="num">Trend</th><th className="num">Revenue</th><th className="num">Contribution</th></tr></thead>
              <tbody>
                {rising.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.name}</td>
                    <td className="num" style={{ color: "var(--delta-good)", fontWeight: 600 }}>{fmtPct(p.trendPct, 0, true)}</td>
                    <td className="num">{fmtUsdCompact(p.revenue)}</td>
                    <td className="num">{fmtUsdCompact(p.contributionProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Declining products">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="num">Trend</th><th className="num">Revenue</th><th className="num">Stock value</th></tr></thead>
              <tbody>
                {falling.map((p) => (
                  <tr key={p.productId}>
                    <td>{p.name}</td>
                    <td className="num" style={{ color: "var(--delta-bad)", fontWeight: 600 }}>{fmtPct(p.trendPct, 0, true)}</td>
                    <td className="num">{fmtUsdCompact(p.revenue)}</td>
                    <td className="num dim">{fmtUsdCompact(p.stockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
