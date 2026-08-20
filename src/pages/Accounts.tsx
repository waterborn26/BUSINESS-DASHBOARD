// Accounts — consolidated financial accounts and net position.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi, StmtRow } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fmtPct, fmtUsd } from "@/lib/money";
import { accountBalance } from "@/engines/ledger";

export default function Accounts() {
  const { store } = useApp();
  const today = store.today;

  const rows = useMemo(() => store.finAccounts.map((fa) => {
    const bal = accountBalance(store, fa.coaAccount, today);
    return { fa, bal };
  }), [store]);

  const assets = rows.filter((r) => !["credit_card", "loan"].includes(r.fa.kind)).reduce((t, r) => t + r.bal, 0);
  const debts = rows.filter((r) => ["credit_card", "loan"].includes(r.fa.kind)).reduce((t, r) => t + r.bal, 0);
  const cc = rows.find((r) => r.fa.kind === "credit_card");
  const utilization = cc && cc.fa.creditLimit ? cc.bal / cc.fa.creditLimit : 0;

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Liquid + clearing assets" value={fmtUsd(assets)} />
        <Kpi label="Card & loan balances" value={fmtUsd(debts)} />
        <Kpi label="Net financial position" value={fmtUsd(assets - debts)} />
        <Kpi label="Credit utilization" value={fmtPct(utilization, 0)} sub={cc?.fa.creditLimit ? <span>of {fmtUsd(cc.fa.creditLimit)} limit</span> : undefined} />
      </div>

      <Card title="All accounts" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Account</th><th>Institution</th><th>Type</th><th className="num">Ledger balance</th><th className="num">Provider balance</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {rows.map(({ fa, bal }) => (
                <tr key={fa.id}>
                  <td style={{ fontWeight: 600 }}>{fa.name}</td>
                  <td className="dim">{fa.institution}</td>
                  <td className="dim" style={{ textTransform: "capitalize" }}>{fa.kind.replace("_", " ")}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtUsd(bal)}</td>
                  <td className="num dim">{fa.importedBalance != null ? fmtUsd(fa.importedBalance) : "—"}</td>
                  <td className="dim">
                    {fa.kind === "credit_card" && fa.paymentDue && `Payment due ${fmtDate(fa.paymentDue)}`}
                    {fa.kind === "hysa" && fa.aprBps != null && `${(fa.aprBps / 100).toFixed(2)}% APY`}
                    {fa.kind === "loan" && fa.aprBps != null && `${(fa.aprBps / 100).toFixed(2)}% APR · $520/mo`}
                    {fa.kind === "processor" && "Settles to checking in ~2 days"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Net position">
        <div className="stmt" style={{ maxWidth: 480 }}>
          {rows.filter((r) => !["credit_card", "loan"].includes(r.fa.kind)).map(({ fa, bal }) => (
            <StmtRow key={fa.id} label={fa.name} amount={bal} indent />
          ))}
          <StmtRow label="Financial assets" amount={assets} subtotal />
          {rows.filter((r) => ["credit_card", "loan"].includes(r.fa.kind)).map(({ fa, bal }) => (
            <StmtRow key={fa.id} label={fa.name} amount={bal} neg indent />
          ))}
          <StmtRow label="Net financial position" amount={assets - debts} total />
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
          Ledger balances derive from the double-entry journal; provider balances are what the
          institution reports. Differences appear in Reconciliation. In the live build, accounts sync
          via Plaid/Stripe/Shopify or CSV import — credentials live in the macOS Keychain, never on disk.
        </p>
      </Card>
    </>
  );
}
