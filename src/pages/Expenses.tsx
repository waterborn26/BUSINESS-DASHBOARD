// Expense intelligence — composition, growth, subscription audit.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi, Delta } from "@/components/ui";
import { Donut } from "@/components/charts/Donut";
import { fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { expenseBreakdown, periodTotals } from "@/engines/analytics";
import { pnl } from "@/engines/pnl";
import { previousPeriod } from "@/lib/dates";

export default function Expenses() {
  const { store, period } = useApp();
  const rows = useMemo(() => expenseBreakdown(store, period), [store, period]);
  const cur = useMemo(() => pnl(store, period), [store, period]);
  const prev = useMemo(() => pnl(store, previousPeriod(period)), [store, period]);
  const t = useMemo(() => periodTotals(store, period), [store, period]);
  const tPrev = useMemo(() => periodTotals(store, previousPeriod(period)), [store, period]);

  const fastest = [...rows].filter((r) => r.previous > 10000).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 3);
  const revGrowth = tPrev.netRevenue > 0 ? (t.netRevenue - tPrev.netRevenue) / tPrev.netRevenue : 0;
  const subs = store.recurring.filter((r) => r.active);
  const subsTotal = subs.reduce((x, s) => x + s.amount, 0);
  const dupes = subs.filter((s) => /later|buffer/i.test(s.vendor));

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Operating expenses" value={fmtUsdCompact(cur.opexTotal)} current={cur.opexTotal} base={prev.opexTotal} invert />
        <Kpi label="Opex as % of revenue" value={cur.netRevenue ? fmtPct(cur.opexTotal / cur.netRevenue, 1) : "—"} />
        <Kpi label="Subscriptions (monthly)" value={fmtUsd(subsTotal)} sub={<span>{subs.length} active</span>} />
        <Kpi label="Revenue growth (context)" value={fmtPct(revGrowth, 1, true)} />
      </div>

      <div className="grid cols-2">
        <Card title="Expense composition">
          <Donut slices={rows.map((r) => ({ label: r.label.replace(" & Subscriptions", ""), value: r.amount }))} fmt={fmtUsdCompact} />
        </Card>

        <Card title="Growth vs previous period">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Category</th><th className="num">This period</th><th className="num">Previous</th><th className="num">Change</th><th className="num">vs revenue growth</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const disproportionate = r.changePct !== null && r.changePct > revGrowth + 0.1 && r.amount > 30000;
                  return (
                    <tr key={r.category}>
                      <td>{r.label} {disproportionate && <span className="badge warning">outpacing revenue</span>}</td>
                      <td className="num">{fmtUsdCompact(r.amount)}</td>
                      <td className="num dim">{fmtUsdCompact(r.previous)}</td>
                      <td className="num"><Delta current={r.amount} base={r.previous} invert /></td>
                      <td className="num dim">{r.changePct !== null ? fmtPct(r.changePct - revGrowth, 0, true) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Subscription audit">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Vendor</th><th>Category</th><th className="num">Monthly</th><th className="num">Annualized</th><th /></tr></thead>
              <tbody>
                {[...subs].sort((a, b) => b.amount - a.amount).map((s) => (
                  <tr key={s.id}>
                    <td>{s.vendor}</td>
                    <td className="dim">Software</td>
                    <td className="num">{fmtUsd(s.amount)}</td>
                    <td className="num dim">{fmtUsd(s.amount * 12)}</td>
                    <td>{dupes.includes(s) && <span className="badge warning">possible duplicate</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Where could I cut costs?">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dupes.length >= 2 && (
              <div className="insight warning">
                <div className="insight-title">Overlapping tools: {dupes.map((d) => d.vendor).join(" + ")}</div>
                <div className="insight-detail">Both schedule social posts. Cancelling the cheaper one saves {fmtUsd(Math.min(...dupes.map((d) => d.amount)) * 12)}/year.</div>
              </div>
            )}
            {fastest.map((f) => (
              <div key={f.category} className="insight info">
                <div className="insight-title">{f.label} growing {f.changePct !== null ? fmtPct(f.changePct, 0) : ""} period-over-period</div>
                <div className="insight-detail">
                  {fmtUsdCompact(f.previous)} → {fmtUsdCompact(f.amount)}. Revenue grew {fmtPct(revGrowth, 0)} in the same window —
                  {f.changePct !== null && f.changePct > revGrowth ? " this category is outpacing the business." : " growth is proportionate."}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
