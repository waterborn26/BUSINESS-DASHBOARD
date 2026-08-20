// Profit & Loss — full statement with period comparison + monthly profit trend.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, StmtRow, Delta, Kpi } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { addDays, fmtMonth, monthKey, previousPeriod, yearAgoPeriod, type Period } from "@/lib/dates";
import { fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { pnl } from "@/engines/pnl";

export default function Pnl() {
  const { store, period, compareMode, openDrill } = useApp();
  const cur = useMemo(() => pnl(store, period), [store, period]);
  const basePeriod = compareMode === "year" ? yearAgoPeriod(period) : previousPeriod(period);
  const prev = useMemo(() => pnl(store, basePeriod), [store, basePeriod]);

  // Monthly P&L for the trailing 12 months
  const monthly = useMemo(() => {
    const months: string[] = [];
    let mk = monthKey(addDays(store.today, -335));
    for (let i = 0; i < 12; i++) {
      months.push(mk);
      const d = new Date(`${mk}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      mk = d.toISOString().slice(0, 7);
    }
    return months.map((m) => {
      const p: Period = { start: `${m}-01`, end: endOfMonthStr(m) };
      const s = pnl(store, p);
      return { m, netRevenue: s.netRevenue, grossProfit: s.grossProfit, operatingProfit: s.operatingProfit, cogs: s.cogsTotal, opex: s.opexTotal };
    });
  }, [store]);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Net revenue" value={fmtUsdCompact(cur.netRevenue)} current={cur.netRevenue} base={prev.netRevenue} />
        <Kpi label="Gross profit" value={fmtUsdCompact(cur.grossProfit)} current={cur.grossProfit} base={prev.grossProfit} sub={<span>{fmtPct(cur.grossMarginPct, 1)}</span>} />
        <Kpi label="Operating profit" value={fmtUsdCompact(cur.operatingProfit)} current={cur.operatingProfit} base={prev.operatingProfit} sub={<span>{fmtPct(cur.operatingMarginPct, 1)}</span>} />
        <Kpi label="Operating expenses" value={fmtUsdCompact(cur.opexTotal)} current={cur.opexTotal} base={prev.opexTotal} invert />
      </div>

      <div className="grid cols-2">
        <Card title="Income statement" right={<span className="muted">vs {compareMode === "year" ? "year ago" : "previous period"}</span>}>
          <div className="stmt">
            <div className="stmt-row subtotal"><span className="lbl">Revenue</span><span /></div>
            {cur.revenue.map((l) => <StmtRow key={l.accountId} label={l.label} amount={l.amount} indent />)}
            {cur.contra.map((l) => <StmtRow key={l.accountId} label={l.label} amount={l.amount} neg indent />)}
            <StmtRow label="Net revenue" amount={cur.netRevenue} subtotal />
            <div style={{ height: 8 }} />
            <div className="stmt-row subtotal"><span className="lbl">Cost of goods sold</span><span /></div>
            {cur.cogs.map((l) => <StmtRow key={l.accountId} label={l.label} amount={l.amount} neg indent />)}
            <StmtRow label={`Gross profit (${fmtPct(cur.grossMarginPct, 1)})`} amount={cur.grossProfit} subtotal />
            <div style={{ height: 8 }} />
            <div className="stmt-row subtotal"><span className="lbl">Operating expenses</span><span /></div>
            {cur.opex.map((l) => (
              <StmtRow key={l.accountId} label={l.label} amount={l.amount} neg indent
                onClick={() => drillLine(l.label, l.amount, prev.opex.find((x) => x.accountId === l.accountId)?.amount ?? 0)} />
            ))}
            <StmtRow label={`Operating profit (${fmtPct(cur.operatingMarginPct, 1)})`} amount={cur.operatingProfit} total />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Accrual-style statement computed from the double-entry ledger. Inventory purchases are not
            expenses — COGS reflects the landed cost of units actually sold. Owner draws and estimated
            income-tax payments are equity movements and do not appear here.
          </p>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Monthly revenue vs costs (12 months)">
            <BarChart
              labels={monthly.map((m) => fmtMonth(m.m).slice(0, 3))}
              series={[
                { name: "COGS", color: "var(--s2)", values: monthly.map((m) => m.cogs) },
                { name: "Opex", color: "var(--s4)", values: monthly.map((m) => m.opex) },
                { name: "Operating profit", color: "var(--s3)", values: monthly.map((m) => Math.max(0, m.operatingProfit)) },
              ]}
              yFmt={fmtUsdCompact}
              xFmt={(l) => l}
              height={200}
            />
          </Card>
          <Card title="Margin trend">
            <LineChart
              labels={monthly.map((m) => m.m)}
              series={[
                { name: "Gross margin", color: "var(--s1)", values: monthly.map((m) => m.netRevenue ? (m.grossProfit / m.netRevenue) * 100 : 0) },
                { name: "Operating margin", color: "var(--s3)", values: monthly.map((m) => m.netRevenue ? (m.operatingProfit / m.netRevenue) * 100 : 0) },
              ]}
              yFmt={(v) => `${v.toFixed(0)}%`}
              xFmt={(l) => fmtMonth(l).slice(0, 3)}
              height={180}
            />
          </Card>
          <Card title="Comparison">
            <div className="stmt">
              {[
                ["Net revenue", cur.netRevenue, prev.netRevenue, false],
                ["Gross profit", cur.grossProfit, prev.grossProfit, false],
                ["Operating expenses", cur.opexTotal, prev.opexTotal, true],
                ["Operating profit", cur.operatingProfit, prev.operatingProfit, false],
              ].map(([label, a, b, inv]) => (
                <div className="stmt-row" key={label as string}>
                  <span className="lbl">{label as string}</span>
                  <span style={{ display: "inline-flex", gap: 12 }}>
                    <span className="muted">{fmtUsdCompact(b as number)}</span>
                    <span>{fmtUsdCompact(a as number)}</span>
                    <Delta current={a as number} base={b as number} invert={inv as boolean} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );

  function drillLine(label: string, amount: number, prevAmount: number) {
    openDrill({
      title: label,
      subtitle: "Period vs comparison",
      body: (
        <div className="stmt">
          <StmtRow label="This period" amount={amount} />
          <StmtRow label="Comparison period" amount={prevAmount} />
          <div className="stmt-row"><span className="lbl">Change</span><Delta current={amount} base={prevAmount} invert /></div>
          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            See Expenses for growth analysis and the underlying transactions.
          </p>
        </div>
      ),
    });
  }
}

function endOfMonthStr(mk: string): string {
  const d = new Date(`${mk}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
