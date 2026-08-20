// Taxes — sales-tax liability dashboard (imported data) + income-tax planning (estimates).

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi, StmtRow } from "@/components/ui";
import { BarChart } from "@/components/charts/BarChart";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { fmtUsd, fmtUsdCompact } from "@/lib/money";
import { salesTaxSummary, estimatedIncomeTaxReserveGap } from "@/engines/taxes";

/** Filing authority per state, so jurisdictions read consistently across the screen. */
const JURISDICTION_NAMES: Record<string, string> = {
  CA: "California (CDTFA)",
  NY: "New York (DTF)",
  TX: "Texas (Comptroller)",
  FL: "Florida (DOR)",
  WA: "Washington (DOR)",
  IL: "Illinois (IDOR)",
  CO: "Colorado (DOR)",
};

export default function Taxes() {
  const { store, period } = useApp();
  const stx = useMemo(() => salesTaxSummary(store, period), [store, period]);
  const itx = useMemo(() => estimatedIncomeTaxReserveGap(store, store.today), [store]);

  // last 6 months collected vs remitted
  const byMonth = useMemo(() => {
    const m = new Map<string, { collected: number; remitted: number }>();
    for (const l of store.taxLiabilities) {
      const mk = l.periodStart.slice(0, 7);
      const rec = m.get(mk) ?? { collected: 0, remitted: 0 };
      rec.collected += l.collected - l.refunded;
      rec.remitted += l.remitted;
      m.set(mk, rec);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
  }, [store]);

  return (
    <>
      <Card title="Sales tax" right={<span className="badge imported">imported from Shopify Tax — not estimated</span>}>
        <div className="kpi-row">
          <Kpi label="Current liability" value={fmtUsd(stx.currentPayable)} provenance="imported" sub={<span className="muted">collected, not yet remitted</span>} />
          <Kpi label="Collected" value={fmtUsd(stx.collectedInPeriod)} provenance="imported" sub={<span className="muted">this period</span>} />
          <Kpi label="Refund adj." value={fmtUsd(stx.refundAdjustments)} provenance="imported" sub={<span className="muted">this period</span>} />
          <Kpi label="Remitted" value={fmtUsd(stx.remittedInPeriod)} provenance="imported" sub={<span className="muted">this period</span>} />
          <Kpi label="Next payment due" value={stx.nextFilings[0] ? fmtDate(stx.nextFilings[0].paymentDue) : "—"} small />
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Outstanding by jurisdiction">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Jurisdiction</th><th className="num">Collected (all time)</th><th className="num">Remitted</th><th className="num">Outstanding</th></tr></thead>
              <tbody>
                {stx.byJurisdiction.map((j) => (
                  <tr key={j.jurisdiction}>
                    <td>{JURISDICTION_NAMES[j.jurisdiction] ?? j.jurisdiction}</td>
                    <td className="num">{fmtUsdCompact(j.collected)}</td>
                    <td className="num">{fmtUsdCompact(j.remitted)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtUsd(j.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="card-title">Open filing periods</div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Period</th><th>Jurisdiction</th><th className="num">Due</th><th>Filing due</th></tr></thead>
                <tbody>
                  {stx.openLiabilities.slice(0, 6).map((l) => (
                    <tr key={l.id}>
                      <td>{fmtMonth(l.periodStart.slice(0, 7))}</td>
                      <td>{l.jurisdiction}</td>
                      <td className="num">{fmtUsd(l.collected - l.refunded - l.remitted)}</td>
                      <td className="dim">{fmtDate(l.filingDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        <Card title="Collected vs remitted — by filing month">
          <BarChart
            labels={byMonth.map(([mk]) => fmtMonth(mk).slice(0, 3))}
            series={[
              { name: "Collected (net)", color: "var(--s1)", values: byMonth.map(([, v]) => v.collected) },
              { name: "Remitted", color: "var(--s3)", values: byMonth.map(([, v]) => v.remitted) },
            ]}
            stacked={false}
            yFmt={fmtUsdCompact}
            xFmt={(l) => l}
            height={220}
          />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            The most recent months are collected but not yet remitted — that gap is the current
            liability and is subtracted from Available Cash automatically.
          </p>
        </Card>
      </div>

      <Card title={<>Income tax planning <span className="badge estimate">ESTIMATES FOR PLANNING — NOT TAX FILING ADVICE</span></>}>
        <div className="grid cols-2">
          <div className="stmt">
            <StmtRow label="YTD estimated taxable profit (operating)" amount={itx.ytdProfit} badge="estimate" />
            <div className="stmt-row">
              <span className="lbl">Effective tax rate (user-entered)</span>
              <span>{itx.ratePct}%</span>
            </div>
            <StmtRow label="Estimated payments made YTD" amount={itx.paidYtd} />
            <StmtRow label="Reserve target (rate × profit − paid)" amount={itx.reserveTarget} subtotal badge="estimate" />
            <div style={{ height: 8 }} />
            <StmtRow label="Projected annual profit (run-rate)" amount={itx.projectedAnnualProfit} badge="estimate" />
            <StmtRow label="Projected annual tax" amount={itx.projectedAnnualTax} badge="estimate" />
            <div className="stmt-row"><span className="lbl">Next quarterly estimated payment</span><span>{fmtDate(itx.nextQuarterlyDue)}</span></div>
          </div>
          <div>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              This section never invents tax rates or legal determinations. It applies <strong>your</strong> entered
              effective rate ({itx.ratePct}%, editable in Settings) to computed operating profit to size a planning
              reserve. The reserve is subtracted from Available Cash so you never mistake the IRS's money for yours.
              Estimated payments made from the business are recorded as owner equity draws, matching pass-through
              treatment. Confirm actual obligations with your accountant before filing.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
