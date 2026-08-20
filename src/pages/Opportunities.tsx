// Opportunity engine — ranked actions + bundling and pricing intelligence.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { addDays, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { ordersInPeriod, productStats } from "@/engines/analytics";
import { recommendations, recStatus, setRecStatus, type RecStatus } from "@/engines/recommend";

export default function Opportunities() {
  const { store, navigate } = useApp();
  const recs = useMemo(() => recommendations(store), [store]);
  const [, setTick] = useState(0);
  const last90: Period = { start: addDays(store.today, -89), end: store.today };

  // Bundling: products frequently bought together
  const pairs = useMemo(() => {
    const counts = new Map<string, number>();
    const solo = new Map<string, number>();
    for (const o of ordersInPeriod(store, last90)) {
      const pids = [...new Set(o.items.map((i) => i.productId))].sort();
      for (const p of pids) solo.set(p, (solo.get(p) ?? 0) + 1);
      for (let i = 0; i < pids.length; i++) {
        for (let j = i + 1; j < pids.length; j++) {
          const key = `${pids[i]}|${pids[j]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    const stats = productStats(store, last90);
    const statFor = new Map(stats.map((s) => [s.productId, s]));
    return [...counts.entries()]
      .map(([key, together]) => {
        const [a, b] = key.split("|");
        const sa = statFor.get(a), sb = statFor.get(b);
        const lift = solo.get(a) && solo.get(b) ? together / Math.min(solo.get(a)!, solo.get(b)!) : 0;
        const priceA = store.skusByProduct.get(a)?.[0]?.price ?? 0;
        const priceB = store.skusByProduct.get(b)?.[0]?.price ?? 0;
        const marginPct = sa && sb ? (sa.grossMarginPct + sb.grossMarginPct) / 2 : 0;
        return {
          a: store.productById.get(a)?.name ?? a,
          b: store.productById.get(b)?.name ?? b,
          together, lift,
          bundlePrice: priceA + priceB,
          aovLift: Math.round((priceA + priceB) * 0.35),
          marginPct,
          discountTolerance: Math.max(0, marginPct - 0.45),
        };
      })
      .filter((p) => p.together >= 12)
      .sort((a, b) => b.together - a.together)
      .slice(0, 6);
  }, [store]);

  // Pricing intelligence: candidates that could tolerate increases
  const pricing = useMemo(() => {
    const stats = productStats(store, last90);
    return stats
      .filter((s) => s.units > 100 && s.grossMarginPct > 0.64 && s.refundRatePct < 0.05 && s.trendPct > -0.02)
      .slice(0, 5)
      .map((s) => {
        const price = store.skusByProduct.get(s.productId)?.[0]?.price ?? 0;
        const upPct = 0.06;
        const unitsDelta = -0.45 * upPct; // assumed elasticity
        const monthlyUnits = s.velocity28 * 30;
        const newContribution = (price * (1 + upPct) - (s.units ? s.cogs / s.units : 0)) * monthlyUnits * (1 + unitsDelta);
        const curContribution = (price - (s.units ? s.cogs / s.units : 0)) * monthlyUnits;
        return { s, price, upside: Math.round(newContribution - curContribution) };
      })
      .filter((x) => x.upside > 0)
      .sort((a, b) => b.upside - a.upside);
  }, [store]);

  const statuses: RecStatus[] = ["done", "ignored", "remind", "investigate"];

  return (
    <>
      <Card title="Ranked opportunities — impact × confidence × urgency ÷ difficulty">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recs.map((r, i) => {
            const st = recStatus(r.id);
            return (
              <div key={r.id} className={`insight ${i < 2 ? "warning" : "info"}`} style={st !== "open" ? { opacity: 0.5 } : undefined}>
                <div className="insight-title">
                  {i + 1}. {r.title}
                  <span className="badge" style={{ marginLeft: "auto" }}>{r.category}</span>
                  <span className="badge">{fmtUsdCompact(r.impactMonthly)}/mo</span>
                  <span className="badge">{r.confidencePct}% conf.</span>
                  <span className="badge">urgency {r.urgency}/3</span>
                  <span className="badge">difficulty {r.difficulty}/3</span>
                </div>
                <div className="insight-detail">{r.action}</div>
                <div className="rec-actions">
                  {r.drill && <button className="btn" onClick={() => navigate(r.drill!)}>Open →</button>}
                  {statuses.map((s) => (
                    <button key={s} className={`btn ${st === s ? "done" : ""}`}
                      onClick={() => { setRecStatus(r.id, st === s ? "open" : s); setTick((t) => t + 1); }}>
                      {st === s ? "✓ " : ""}{s}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Bundling analysis — frequently bought together (90d)" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Pair</th><th className="num">Together</th><th className="num">Affinity</th><th className="num">Bundle price</th><th className="num">Est. AOV lift</th><th className="num">Discount tolerance</th></tr></thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={`${p.a}|${p.b}`}>
                    <td style={{ whiteSpace: "normal" }}>{p.a} <span className="dim">+</span> {p.b}</td>
                    <td className="num">{fmtNum(p.together)} orders</td>
                    <td className="num">{fmtPct(p.lift, 0)}</td>
                    <td className="num">{fmtUsd(p.bundlePrice)}</td>
                    <td className="num" style={{ color: "var(--delta-good)" }}>+{fmtUsd(p.aovLift)}</td>
                    <td className="num dim">{fmtPct(p.discountTolerance, 0)}</td>
                  </tr>
                ))}
                {pairs.length === 0 && <tr><td colSpan={6} className="dim">Not enough multi-item orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11, padding: "8px 16px" }}>
            Affinity = co-purchases ÷ the rarer product's orders. Discount tolerance = blended margin
            above a 45% floor — the room available to discount a bundle while protecting contribution.
          </p>
        </Card>

        <Card title="Pricing intelligence — increase candidates" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Product</th><th className="num">Price</th><th className="num">Margin</th><th className="num">Refunds</th><th className="num">Trend</th><th className="num">+6% est. monthly upside</th></tr></thead>
              <tbody>
                {pricing.map(({ s, price, upside }) => (
                  <tr key={s.productId}>
                    <td>{s.name}</td>
                    <td className="num">{fmtUsd(price)}</td>
                    <td className="num">{fmtPct(s.grossMarginPct, 0)}</td>
                    <td className="num">{fmtPct(s.refundRatePct, 1)}</td>
                    <td className="num">{fmtPct(s.trendPct, 0, true)}</td>
                    <td className="num" style={{ color: "var(--delta-good)", fontWeight: 600 }}>+{fmtUsdCompact(upside)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11, padding: "8px 16px" }}>
            Assumes elasticity −0.45 (from the Crosscurrent price test: −4% units on +8.8% price). Estimates —
            validate with an actual test; the Decision Journal will evaluate it automatically.
          </p>
        </Card>
      </div>
    </>
  );
}
