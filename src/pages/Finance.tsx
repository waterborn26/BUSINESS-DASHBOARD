// Finance & Money — the Cash Command Center.
// TOTAL CASH → deductions → AVAILABLE CASH, cash outlook, "Where did my money go".

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, StmtRow, Kpi } from "@/components/ui";
import { Waterfall } from "@/components/charts/Waterfall";
import { LineChart } from "@/components/charts/LineChart";
import { addDays, fmtDate, type Period } from "@/lib/dates";
import { fmtUsd, fmtUsdCompact } from "@/lib/money";
import { availableCash, cashMovement } from "@/engines/cash";
import { cashForecast } from "@/engines/cashflow";
import { pnl } from "@/engines/pnl";
import { entriesForAccount } from "@/engines/ledger";

const HORIZONS = [30, 60, 90, 180, 365] as const;

export default function Finance() {
  const { store, openDrill } = useApp();
  const today = store.today;
  const cash = useMemo(() => availableCash(store, today), [store]);
  const [horizon, setHorizon] = useState<number>(90);
  const fc = useMemo(() => cashForecast(store, horizon), [store, horizon]);
  const last30: Period = { start: addDays(today, -29), end: today };
  const mv = useMemo(() => cashMovement(store, last30), [store]);
  const statement = useMemo(() => pnl(store, last30), [store]);

  const waterfallSteps = useMemo(() => [
    { label: "Total cash", value: cash.totalCash, isTotal: true },
    ...cash.deductions.map((d) => ({ label: d.label.replace("Estimated ", "Est. "), value: -d.amount })),
    { label: "Available cash", value: cash.availableCash, isTotal: true },
  ], [cash]);

  const moveSteps = useMemo(() => [
    { label: "Opening cash", value: mv.open, isTotal: true },
    ...mv.moves.map((m) => ({ label: m.label, value: m.amount })),
    { label: "Ending cash", value: mv.close, isTotal: true },
  ], [mv]);

  const profitVsCash = mv.close - mv.open;

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Total cash" value={fmtUsd(cash.totalCash)} onClick={() => drillAccount("cash_checking", "Business Checking")} />
        <Kpi label="Available operating cash" value={fmtUsd(cash.availableCash)} sub={<span className="muted">after reserves & commitments</span>} />
        <Kpi label="In transit (processor)" value={fmtUsd(cash.inTransit.amount)} sub={<span className="muted">settles in ~2 days</span>} />
        <Kpi label="Operating profit (30d)" value={fmtUsdCompact(statement.operatingProfit)} />
        <Kpi label="Cash movement (30d)" value={fmtUsdCompact(profitVsCash, )} sub={<span className="muted">{profitVsCash >= 0 ? "increase" : "decrease"}</span>} />
      </div>

      <Card title="Total cash → available cash">
        <Waterfall steps={waterfallSteps} height={260} />
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          The purpose of this screen: money that exists in an account is not money that is safe to spend.
          Each deduction is drillable below.
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Reserved / not really available">
          <div className="stmt">
            {cash.cashAccounts.map((a) => (
              <StmtRow key={a.label} label={a.label} amount={a.amount} indent
                onClick={() => drillAccount(a.drill!.id!, a.label)} />
            ))}
            <StmtRow label="TOTAL CASH" amount={cash.totalCash} subtotal />
            {cash.deductions.map((d) => (
              <div key={d.label}>
                <StmtRow label={d.label} amount={d.amount} neg
                  badge={d.provenance === "estimate" ? "estimate" : d.provenance === "imported" ? "imported" : undefined} />
                {d.detail && <div className="muted" style={{ fontSize: 11, marginTop: -2, marginBottom: 4 }}>{d.detail}</div>}
              </div>
            ))}
            <StmtRow label="AVAILABLE OPERATING CASH" amount={cash.availableCash} total />
          </div>
        </Card>

        <Card
          title={`Cash outlook — next ${horizon} days`}
          right={
            <span className="seg">
              {HORIZONS.map((h) => (
                <button key={h} className={horizon === h ? "on" : ""} onClick={() => setHorizon(h)}>{h}d</button>
              ))}
            </span>
          }
        >
          <LineChart
            labels={fc.points.map((p) => p.date)}
            series={[
              { name: "Projected cash", color: "var(--s1)", values: fc.points.map((p) => p.cash) },
              { name: "Projected available", color: "var(--s3)", values: fc.points.map((p) => p.available), dashed: true },
            ]}
            band={{ lo: fc.points.map((p) => p.lo), hi: fc.points.map((p) => p.hi), color: "var(--s1)" }}
            yFmt={fmtUsdCompact}
            height={210}
          />
          <div className="stmt" style={{ marginTop: 10 }}>
            <StmtRow label="Expected inflows (30d)" amount={fc.expectedInflows30} badge="estimate" />
            <StmtRow label="Expected expenses (30d)" amount={fc.expectedExpenses30} neg badge="estimate" />
            <StmtRow label="Inventory purchases (30d)" amount={fc.inventoryPurchases30} neg />
            <StmtRow label="Tax payments (30d)" amount={fc.taxPayments30} neg />
            <StmtRow label="Projected ending cash (30d)" amount={fc.endingCash30} total badge="estimate" />
          </div>
          {fc.warnings.map((w) => (
            <div key={w} className="insight warning" style={{ marginTop: 8 }}><div className="insight-detail">{w}</div></div>
          ))}
        </Card>
      </div>

      <Card title="Where did my money go? — last 30 days">
        <Waterfall steps={moveSteps} height={280} />
        <div className="insight info" style={{ marginTop: 10 }}>
          <div className="insight-detail selectable">
            Cash {profitVsCash >= 0 ? "increased" : "decreased"} {fmtUsd(Math.abs(profitVsCash))} this period
            while the business generated {fmtUsd(statement.operatingProfit)} of operating profit.
            {" "}The difference is timing and balance-sheet movement:{" "}
            {mv.moves.filter((m) => m.amount < 0).slice(-3).reverse().map((m) => `${m.label.toLowerCase()} (${fmtUsdCompact(m.amount, true)})`).join(", ")} consume cash
            without appearing (fully) in profit, while inventory purchases become an asset until sold.
          </div>
        </div>
      </Card>
    </>
  );

  function drillAccount(coaId: string, label: string) {
    const entries = entriesForAccount(store, coaId, { start: addDays(today, -30), end: today }, 40);
    openDrill({
      title: label,
      subtitle: "Last 30 days of ledger activity",
      body: (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Memo</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {entries.map((e) => {
                const amt = e.lines.filter((l) => l.accountId === coaId).reduce((t, l) => t + l.debit - l.credit, 0);
                return (
                  <tr key={e.id}>
                    <td className="dim">{fmtDate(e.date)}</td>
                    <td>{e.memo}</td>
                    <td className="num" style={{ color: amt < 0 ? "var(--delta-bad)" : "var(--delta-good)" }}>{fmtUsd(amt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ),
    });
  }
}
