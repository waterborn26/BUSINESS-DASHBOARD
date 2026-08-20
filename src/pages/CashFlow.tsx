// Cash Flow — statement (operating / investing / financing) + forward forecast,
// and the profit-vs-cash explanation.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, StmtRow, Kpi } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { fmtUsd, fmtUsdCompact } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { cashflowStatement, cashForecast } from "@/engines/cashflow";
import { pnl } from "@/engines/pnl";

const HORIZONS = [30, 60, 90, 180, 365] as const;

export default function CashFlow() {
  const { store, period } = useApp();
  const stmt = useMemo(() => cashflowStatement(store, period), [store, period]);
  const statement = useMemo(() => pnl(store, period), [store, period]);
  const [horizon, setHorizon] = useState<number>(90);
  const fc = useMemo(() => cashForecast(store, horizon), [store, horizon]);

  const net = stmt.closing - stmt.opening;

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Opening cash" value={fmtUsd(stmt.opening)} />
        <Kpi label="Operating cash flow" value={fmtUsdCompact(stmt.operatingTotal)} />
        <Kpi label="Investing cash flow" value={fmtUsdCompact(stmt.investingTotal)} />
        <Kpi label="Financing cash flow" value={fmtUsdCompact(stmt.financingTotal)} />
        <Kpi label="Ending cash" value={fmtUsd(stmt.closing)} />
        <Kpi label="Operating profit (same period)" value={fmtUsdCompact(statement.operatingProfit)} />
      </div>

      <div className="grid cols-2">
        <Card title="Cash-flow statement">
          <div className="stmt">
            <StmtRow label="Opening cash" amount={stmt.opening} subtotal />
            <div style={{ height: 6 }} />
            <div className="stmt-row subtotal"><span className="lbl">Operating</span><span /></div>
            {stmt.operating.map((l) => <StmtRow key={l.label} label={l.label} amount={l.amount} indent neg={l.amount < 0} />)}
            <StmtRow label="Net operating cash" amount={stmt.operatingTotal} subtotal />
            <div style={{ height: 6 }} />
            {stmt.investing.length > 0 && (
              <>
                <div className="stmt-row subtotal"><span className="lbl">Investing</span><span /></div>
                {stmt.investing.map((l) => <StmtRow key={l.label} label={l.label} amount={l.amount} indent neg={l.amount < 0} />)}
              </>
            )}
            <div className="stmt-row subtotal"><span className="lbl">Financing</span><span /></div>
            {stmt.financing.map((l) => <StmtRow key={l.label} label={l.label} amount={l.amount} indent neg={l.amount < 0} />)}
            <StmtRow label="Net financing cash" amount={stmt.financingTotal} subtotal />
            <div style={{ height: 6 }} />
            <StmtRow label="Ending cash" amount={stmt.closing} total />
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Why cash ≠ profit">
            <div className="insight info">
              <div className="insight-detail selectable" style={{ fontSize: 12.5 }}>
                This period the business earned <strong>{fmtUsd(statement.operatingProfit)}</strong> of operating
                profit, while cash moved <strong>{fmtUsd(net)}</strong>. The gap comes from balance-sheet and
                equity movements that never appear on the P&L: inventory purchases (cash out, asset in),
                sales-tax remittances (paying down a liability), credit-card payment timing, owner draws,
                estimated income-tax payments, and debt service. Profit answers "did the business earn money";
                cash answers "where did the money go" — Meridian always shows both.
              </div>
            </div>
          </Card>

          <Card
            title={`Cash forecast — ${horizon} days`}
            right={
              <span className="seg">
                {HORIZONS.map((h) => <button key={h} className={horizon === h ? "on" : ""} onClick={() => setHorizon(h)}>{h}d</button>)}
              </span>
            }
          >
            <LineChart
              labels={fc.points.map((p) => p.date)}
              series={[
                { name: "Projected cash", color: "var(--s1)", values: fc.points.map((p) => p.cash) },
                { name: "Available cash", color: "var(--s3)", values: fc.points.map((p) => p.available), dashed: true },
              ]}
              band={{ lo: fc.points.map((p) => p.lo), hi: fc.points.map((p) => p.hi), color: "var(--s1)" }}
              yFmt={fmtUsdCompact}
              height={220}
            />
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Inflows follow the net-revenue forecast with a 2-day settlement lag; outflows follow the known
              schedule of subscriptions, contractors, rent, loan and card payments, PO balances, bills, and
              tax remittance dates. Band = 80% forecast uncertainty. All values are estimates.
            </p>
            {fc.warnings.length > 0 ? (
              fc.warnings.map((w) => (
                <div key={w} className="insight warning" style={{ marginTop: 8 }}><div className="insight-detail">{w}</div></div>
              ))
            ) : (
              <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                Tightest projected moment: <strong>{fmtUsdCompact(fc.trough.available)}</strong> of available cash
                around {fmtDate(fc.trough.date)} — above the operating floor.
              </p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
