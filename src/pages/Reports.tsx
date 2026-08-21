// Reports — daily / weekly / monthly / quarterly business reviews, exportable.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, StmtRow } from "@/components/ui";
import { addDays, fmtDateFull, startOfMonth, startOfQuarter, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { compare, productStats, trafficSourceStats } from "@/engines/analytics";
import { availableCash, cashMovement } from "@/engines/cash";
import { pnl } from "@/engines/pnl";
import { salesTaxSummary } from "@/engines/taxes";
import { inventoryRows, inventoryCapital } from "@/engines/inventory";
import { detectInsights } from "@/engines/insights";
import { recommendations } from "@/engines/recommend";

type ReportKind = "daily" | "weekly" | "monthly" | "quarterly";

export default function Reports() {
  const { store } = useApp();
  const today = store.today;
  const [kind, setKind] = useState<ReportKind>("weekly");

  const period: Period = useMemo(() => {
    switch (kind) {
      case "daily": return { start: addDays(today, -1), end: addDays(today, -1) };
      case "weekly": return { start: addDays(today, -7), end: addDays(today, -1) };
      case "monthly": return { start: startOfMonth(today), end: today };
      case "quarterly": return { start: startOfQuarter(today), end: today };
    }
  }, [kind, today]);

  const cmp = useMemo(() => compare(store, period), [store, period]);
  const statement = useMemo(() => pnl(store, period), [store, period]);
  const cash = useMemo(() => availableCash(store, today), [store]);
  const mv = useMemo(() => cashMovement(store, period), [store, period]);
  const stx = useMemo(() => salesTaxSummary(store, period), [store, period]);
  const cap = useMemo(() => inventoryCapital(inventoryRows(store)), [store]);
  const insights = useMemo(() => detectInsights(store), [store]);
  const recs = useMemo(() => recommendations(store).slice(0, 5), [store]);
  const topProducts = useMemo(() => productStats(store, period).slice(0, 5), [store, period]);
  const channels = useMemo(() => trafficSourceStats(store, period).filter((s) => s.spend > 0), [store, period]);

  const c = cmp.current, p = cmp.previous;
  const titles: Record<ReportKind, string> = {
    daily: "Daily Brief — what happened yesterday",
    weekly: "Weekly Business Review — what changed this week",
    monthly: "Monthly Business Review",
    quarterly: "Quarterly Review — trends & strategy",
  };

  return (
    <>
      <Card
        title="Automated reports"
        right={
          <>
            <span className="seg">
              {(["daily", "weekly", "monthly", "quarterly"] as const).map((k) => (
                <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{k}</button>
              ))}
            </span>
            <button className="btn" onClick={() => window.print()}>Export / Print</button>
          </>
        }
      >
        <h2 style={{ fontSize: 17, marginBottom: 2 }}>{titles[kind]}</h2>
        <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
          {fmtDateFull(period.start)} – {fmtDateFull(period.end)} · generated {fmtDateFull(today)} · Meridian demo dataset
        </div>

        <div className="grid cols-3">
          <div className="stmt">
            <div className="card-title">Performance</div>
            <StmtRow label="Net revenue" amount={c.netRevenue} />
            <div className="stmt-row indent"><span className="lbl">vs previous period</span><span>{p.netRevenue ? fmtPct(c.netRevenue / p.netRevenue - 1, 1, true) : "—"}</span></div>
            <div className="stmt-row indent"><span className="lbl">Orders / AOV</span><span>{fmtNum(c.orders)} · {fmtUsd(c.aov)}</span></div>
            <StmtRow label="Gross profit" amount={c.grossProfit} />
            <div className="stmt-row indent"><span className="lbl">Gross margin</span><span>{fmtPct(c.grossMarginPct, 1)}</span></div>
            <StmtRow label="Contribution profit" amount={c.contributionProfit} />
            <StmtRow label="Operating profit" amount={statement.operatingProfit} />
          </div>
          <div className="stmt">
            <div className="card-title">Financial position</div>
            <StmtRow label="Total cash" amount={cash.totalCash} />
            <StmtRow label="Available cash" amount={cash.availableCash} />
            <StmtRow label="Sales tax owed" amount={stx.currentPayable} badge="imported" />
            <StmtRow label="Cash movement (period)" amount={mv.close - mv.open} />
            <StmtRow label="Inventory at cost" amount={cap.atCost} />
            <div className="stmt-row indent"><span className="lbl">Slow/dead capital</span><span className="neg">{fmtUsdCompact(cap.slowMovingCapital + cap.deadStockCapital)}</span></div>
          </div>
          <div className="stmt">
            <div className="card-title">Marketing</div>
            <StmtRow label="Ad spend" amount={c.adSpend} />
            <div className="stmt-row indent"><span className="lbl">MER</span><span>{c.mer.toFixed(2)}x</span></div>
            <div className="stmt-row indent"><span className="lbl">Blended CAC</span><span>{fmtUsd(c.blendedCac)}</span></div>
            <div className="stmt-row indent"><span className="lbl">New customers</span><span>{fmtNum(c.newCustomers)}</span></div>
            {channels.slice(0, 3).map((ch) => (
              <div className="stmt-row indent" key={ch.source}>
                <span className="lbl" style={{ textTransform: "capitalize" }}>{ch.source} contribution</span>
                <span className={ch.contributionProfit < 0 ? "neg" : "pos"}>{fmtUsdCompact(ch.contributionProfit)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16 }} className="grid cols-2">
          <div>
            <div className="card-title">Top products (period, by revenue)</div>
            <table className="tbl">
              <tbody>
                {topProducts.map((s, i) => (
                  <tr key={s.productId}>
                    <td className="dim">{i + 1}</td><td>{s.name}</td>
                    <td className="num">{fmtUsdCompact(s.revenue)}</td>
                    <td className="num dim">{fmtPct(s.contributionMarginPct, 0)} cm</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="card-title">Highlights & watch items</div>
            <ul style={{ paddingLeft: 16, fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-2)" }}>
              {insights.slice(0, 5).map((i) => <li key={i.id}>{i.title}</li>)}
            </ul>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div className="card-title">Recommended actions</div>
          <ol style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8, color: "var(--ink-2)" }}>
            {recs.map((r) => (
              <li key={r.id}><strong style={{ color: "var(--ink)" }}>{r.title}.</strong> {r.action} <span className="muted">({r.impactMonthly === null ? "impact not estimable" : `est. ${fmtUsdCompact(r.impactMonthly)}/mo`}, {r.confidencePct}% confidence)</span></li>
            ))}
          </ol>
        </div>

        <p className="muted" style={{ fontSize: 10.5, marginTop: 16 }}>
          Figures marked "est." are model estimates; sales-tax figures are imported. This report is generated
          from the internal ledger and normalized analytics database — see Reconciliation for data quality.
        </p>
      </Card>
    </>
  );
}
