// Tax engine.
// Sales tax figures come from imported liabilities (authoritative). Income tax figures
// are planning estimates only, computed from a user-entered effective rate — labeled
// as estimates everywhere they appear. The app never invents tax rates.

import type { Store } from "@/data/store";
import type { TaxLiability } from "@/domain/types";
import { startOfYear, type Period } from "@/lib/dates";
import { pnl } from "./pnl";

export interface SalesTaxSummary {
  currentPayable: number;               // ledger-backed
  byJurisdiction: { jurisdiction: string; outstanding: number; collected: number; remitted: number }[];
  collectedInPeriod: number;
  refundAdjustments: number;
  remittedInPeriod: number;
  nextFilings: TaxLiability[];
  openLiabilities: TaxLiability[];
}

export function salesTaxSummary(store: Store, p: Period): SalesTaxSummary {
  const jur = new Map<string, { outstanding: number; collected: number; remitted: number }>();
  let collectedInPeriod = 0, refundAdjustments = 0;
  for (const l of store.taxLiabilities) {
    const rec = jur.get(l.jurisdiction) ?? { outstanding: 0, collected: 0, remitted: 0 };
    const net = l.collected - l.refunded;
    rec.outstanding += net - l.remitted;
    rec.collected += net;
    rec.remitted += l.remitted;
    jur.set(l.jurisdiction, rec);
    if (l.periodStart <= p.end && l.periodEnd >= p.start) {
      collectedInPeriod += l.collected;
      refundAdjustments += l.refunded;
    }
  }
  const remittedInPeriod = store.taxPayments
    .filter((t) => t.kind === "sales" && t.date >= p.start && t.date <= p.end)
    .reduce((t, x) => t + x.amount, 0);
  const open = store.taxLiabilities
    .filter((l) => l.collected - l.refunded - l.remitted > 0)
    .sort((a, b) => a.paymentDue.localeCompare(b.paymentDue));
  return {
    currentPayable: [...jur.values()].reduce((t, r) => t + r.outstanding, 0),
    byJurisdiction: [...jur.entries()]
      .map(([jurisdiction, r]) => ({ jurisdiction, ...r }))
      .sort((a, b) => b.outstanding - a.outstanding),
    collectedInPeriod,
    refundAdjustments,
    remittedInPeriod,
    nextFilings: open.slice(0, 4),
    openLiabilities: open,
  };
}

export interface IncomeTaxPlan {
  ytdProfit: number;            // estimated taxable profit (operating profit)
  ratePct: number;              // user-entered
  reserveTarget: number;        // rate × YTD profit − estimated payments already made
  paidYtd: number;
  projectedAnnualProfit: number;
  projectedAnnualTax: number;
  shortfall: number;            // positive = under-reserved vs target
  nextQuarterlyDue: string;
}

export function estimatedIncomeTaxReserveGap(store: Store, asOf: string): IncomeTaxPlan {
  const ytd: Period = { start: startOfYear(asOf), end: asOf };
  const statement = pnl(store, ytd);
  const ytdProfit = Math.max(0, statement.operatingProfit);
  const paidYtd = store.taxPayments
    .filter((t) => t.kind === "income_estimated" && t.date >= ytd.start && t.date <= asOf)
    .reduce((t, x) => t + x.amount, 0);
  const rate = store.incomeTaxRatePct / 100;
  const dayOfYr = Math.max(1, Math.round((Date.parse(asOf) - Date.parse(ytd.start)) / 86_400_000) + 1);
  const projectedAnnualProfit = Math.round((ytdProfit / dayOfYr) * 365);
  const reserveTarget = Math.max(0, Math.round(ytdProfit * rate) - paidYtd);
  // Quarterly due dates: Apr 15, Jun 15, Sep 15, Jan 15
  const y = asOf.slice(0, 4);
  const duedates = [`${y}-04-15`, `${y}-06-15`, `${y}-09-15`, `${Number(y) + 1}-01-15`];
  const nextQuarterlyDue = duedates.find((d) => d >= asOf) ?? duedates[3];
  return {
    ytdProfit,
    ratePct: store.incomeTaxRatePct,
    reserveTarget,
    paidYtd,
    projectedAnnualProfit,
    projectedAnnualTax: Math.round(projectedAnnualProfit * rate),
    shortfall: Math.max(0, reserveTarget),
    nextQuarterlyDue,
  };
}
