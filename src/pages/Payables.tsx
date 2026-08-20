// Payables & Commitments — money the business owes or has committed, even if
// it hasn't left the bank yet. Feeds Available Cash directly.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { addDays, fmtDate } from "@/lib/dates";
import { fmtUsd, fmtUsdCompact } from "@/lib/money";

export default function Payables() {
  const { store } = useApp();
  const today = store.today;

  const openBills = useMemo(() => store.bills.filter((b) => b.status !== "paid"), [store]);
  const openPos = useMemo(
    () => store.purchaseOrders.filter((po) => po.status === "deposit_paid" || po.status === "in_transit"),
    [store],
  );
  const billsTotal = openBills.reduce((t, b) => t + b.total - b.paid, 0);
  const poTotal = openPos.reduce((t, po) => t + po.total - po.paid, 0);
  const ccDue = store.finAccounts.find((a) => a.kind === "credit_card");
  const subs = store.recurring.filter((r) => r.active).reduce((t, r) => t + r.amount, 0);

  // 45-day schedule of known outflows
  const schedule = useMemo(() => {
    const items: { date: string; label: string; amount: number; kind: string }[] = [];
    for (const b of openBills) items.push({ date: b.dueAt, label: `${b.vendor} — ${b.description}`, amount: b.total - b.paid, kind: "Bill" });
    for (const po of openPos) {
      const goods = po.total - po.freight - po.duties;
      items.push({ date: po.expectedAt, label: `${po.vendor} — PO balance + freight/duties (${po.id})`, amount: goods - Math.round(goods * 0.3) + po.freight + po.duties, kind: "PO" });
    }
    items.push({ date: nextDom(15), label: "Amex statement payment", amount: ccDue?.importedBalance ?? 0, kind: "Card" });
    items.push({ date: nextDom(1), label: "Software subscriptions", amount: subs, kind: "Recurring" });
    items.push({ date: nextDom(2), label: "Contractors + rent + insurance", amount: 511000, kind: "Recurring" });
    items.push({ date: nextDom(5), label: "SBA loan payment", amount: 52000, kind: "Loan" });
    items.push({ date: nextDom(20), label: "Sales tax remittance (CA, NY, WA)", amount: salesTaxNext(), kind: "Tax" });
    return items.filter((i) => i.date <= addDays(today, 45) && i.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  }, [store]);

  function nextDom(dom: number): string {
    const d = Number(today.slice(8, 10));
    const base = `${today.slice(0, 7)}-${String(dom).padStart(2, "0")}`;
    if (d < dom) return base;
    const dt = new Date(`${base}T00:00:00Z`);
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    return dt.toISOString().slice(0, 10);
  }
  function salesTaxNext(): number {
    return store.taxLiabilities.filter((l) => l.collected - l.refunded - l.remitted > 0)
      .reduce((t, l) => t + l.collected - l.refunded - l.remitted, 0);
  }

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Open vendor bills" value={fmtUsd(billsTotal)} sub={<span>{openBills.length} bills</span>} />
        <Kpi label="Open PO commitments" value={fmtUsd(poTotal)} sub={<span>{openPos.length} purchase orders</span>} />
        <Kpi label="Credit card balance" value={fmtUsd(ccDue?.importedBalance ?? 0)} />
        <Kpi label="Monthly recurring" value={fmtUsd(subs + 511000 + 52000)} sub={<span className="muted">subs + contractors + rent + loan</span>} />
      </div>

      <div className="grid cols-2">
        <Card title="Vendor bills" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Vendor</th><th>Description</th><th className="num">Remaining</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {openBills.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.vendor}</td>
                    <td className="dim">{b.description}</td>
                    <td className="num">{fmtUsd(b.total - b.paid)}</td>
                    <td className="dim">{fmtDate(b.dueAt)}</td>
                    <td>{b.status === "overdue" ? <span className="badge critical">overdue</span> : <span className="badge">open</span>}</td>
                  </tr>
                ))}
                {openBills.length === 0 && <tr><td colSpan={5} className="dim">No open bills.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Open purchase orders" pad0>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>PO</th><th>Vendor</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Remaining</th><th>Expected</th></tr></thead>
              <tbody>
                {openPos.map((po) => (
                  <tr key={po.id}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{po.id}</td>
                    <td>{po.vendor}</td>
                    <td className="num">{fmtUsdCompact(po.total)}</td>
                    <td className="num dim">{fmtUsdCompact(po.paid)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtUsdCompact(po.total - po.paid)}</td>
                    <td className="dim">{fmtDate(po.expectedAt)}</td>
                  </tr>
                ))}
                {openPos.length === 0 && <tr><td colSpan={6} className="dim">No open purchase orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Upcoming outflow schedule — next 45 days" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Type</th><th>Item</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {schedule.map((i, idx) => (
                <tr key={idx}>
                  <td className="dim">{fmtDate(i.date)}</td>
                  <td><span className="badge">{i.kind}</span></td>
                  <td>{i.label}</td>
                  <td className="num">{fmtUsd(i.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, padding: "10px 16px" }}>
          Every line here reduces Available Cash today and is scheduled into the cash forecast.
        </p>
      </Card>
    </>
  );
}
