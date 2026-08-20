// Reconciliation — settlement recon (sales → payouts → bank) and account recon.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fmtUsd, fmtUsdCompact } from "@/lib/money";
import { settlementReconciliation, accountReconciliation } from "@/engines/reconcile";

export default function Reconciliation() {
  const { store } = useApp();
  const settlements = useMemo(() => settlementReconciliation(store, 8), [store]);
  const accounts = useMemo(() => accountReconciliation(store), [store]);
  const flagged = settlements.filter((s) => s.status === "review").length + accounts.filter((a) => a.status === "review").length;

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Weeks reconciled" value={`${settlements.filter((s) => s.status === "reconciled").length}/${settlements.length}`} />
        <Kpi label="Accounts reconciled" value={`${accounts.filter((a) => a.status === "reconciled").length}/${accounts.length}`} />
        <Kpi label="Items needing review" value={String(flagged)} />
      </div>

      <Card title="Settlement reconciliation — Shopify sales → payouts" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Week</th><th className="num">Sales + tax</th><th className="num">Refunds</th><th className="num">Fees</th>
                <th className="num">Expected net</th><th className="num">Payouts received</th><th className="num">Difference</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.weekStart}>
                  <td className="dim">{fmtDate(s.weekStart)}</td>
                  <td className="num">{fmtUsdCompact(s.sales)}</td>
                  <td className="num">−{fmtUsdCompact(s.refunds)}</td>
                  <td className="num">−{fmtUsdCompact(s.fees)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtUsd(s.expectedNet)}</td>
                  <td className="num">{fmtUsd(s.payouts)}</td>
                  <td className="num" style={{ color: Math.abs(s.difference) > 2000 ? "var(--warning)" : undefined }}>{fmtUsd(s.difference)}</td>
                  <td>{s.status === "reconciled" ? <span className="badge good">reconciled</span> : <span className="badge warning">review</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, padding: "10px 16px" }}>
          Expected net = sales − discounts + shipping + tax − refunds − processing fees. Payouts land with a
          2-day settlement lag, so week boundaries show small timing differences — flagged only beyond a
          2% tolerance. In the live build each Shopify payout is matched to its bank deposit line item.
        </p>
      </Card>

      <Card title="Account reconciliation — ledger vs provider" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Account</th><th className="num">Ledger balance</th><th className="num">Provider balance</th><th className="num">Difference</th><th>Status</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.account}>
                  <td style={{ fontWeight: 600 }}>{a.account}</td>
                  <td className="num">{fmtUsd(a.ledgerBalance)}</td>
                  <td className="num">{fmtUsd(a.importedBalance)}</td>
                  <td className="num">{fmtUsd(a.difference)}</td>
                  <td>{a.status === "reconciled" ? <span className="badge good">reconciled</span> : <span className="badge warning">review</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
