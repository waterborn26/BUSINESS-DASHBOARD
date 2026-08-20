// Cash-flow engine: statement (operating / investing / financing) from ledger cash
// legs, plus a forward cash forecast combining the revenue forecast with the
// deterministic schedule of known obligations.

import type { Store } from "@/data/store";
import { accountBalance } from "./ledger";
import { addDays, dateRange, type Period } from "@/lib/dates";
import { fmtUsdCompact } from "@/lib/money";
import { forecastDaily } from "./forecast";
import { availableCash } from "./cash";
import { estimatedIncomeTaxReserveGap } from "./taxes";
import { MONTHLY_OBLIGATIONS, DAY2_OBLIGATIONS } from "@/data/demo";
import { CASH_FLOOR } from "@/domain/policy";

const CASH_IDS = ["cash_checking", "cash_savings", "cash_paypal"];

export interface CashflowStatement {
  period: Period;
  opening: number;
  operating: { label: string; amount: number }[];
  operatingTotal: number;
  investing: { label: string; amount: number }[];
  investingTotal: number;
  financing: { label: string; amount: number }[];
  financingTotal: number;
  closing: number;
  /** operating profit for the same period — to explain profit vs cash divergence */
}

export function cashflowStatement(store: Store, p: Period): CashflowStatement {
  const buckets: Record<string, Map<string, number>> = {
    operating: new Map(), investing: new Map(), financing: new Map(),
  };
  const add = (b: keyof typeof buckets, k: string, v: number) => {
    buckets[b].set(k, (buckets[b].get(k) ?? 0) + v);
  };
  for (const e of store.ledger) {
    if (e.date < p.start || e.date > p.end) continue;
    let cashDelta = 0;
    for (const l of e.lines) if (CASH_IDS.includes(l.accountId)) cashDelta += l.debit - l.credit;
    if (cashDelta === 0) continue;
    switch (e.sourceType) {
      case "payout": add("operating", "Customer receipts", cashDelta); break;
      case "po": add("operating", "Inventory purchases", cashDelta); break;
      case "bill": add("operating", "Fulfillment", cashDelta); break;
      case "expense": add("operating", "Operating expenses", cashDelta); break;
      case "cc_payment": add("operating", "Credit card payments (ads, software)", cashDelta); break;
      case "tax_remit": add("operating", "Sales tax remitted", cashDelta); break;
      case "tax_payment": add("financing", "Owner estimated tax payments", cashDelta); break;
      case "loan": add("financing", "Debt service", cashDelta); break;
      case "owner": add("financing", "Owner draws", cashDelta); break;
      case "manual": add("investing", "Equipment & other", cashDelta); break;
      case "transfer": break;
      default: add("operating", "Other", cashDelta);
    }
  }
  const toList = (m: Map<string, number>) =>
    [...m.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  const opening = CASH_IDS.reduce((t, a) => t + accountBalance(store, a, addDays(p.start, -1)), 0);
  const closing = CASH_IDS.reduce((t, a) => t + accountBalance(store, a, p.end), 0);
  const operating = toList(buckets.operating);
  const investing = toList(buckets.investing);
  const financing = toList(buckets.financing);
  return {
    period: p, opening,
    operating, operatingTotal: operating.reduce((t, x) => t + x.amount, 0),
    investing, investingTotal: investing.reduce((t, x) => t + x.amount, 0),
    financing, financingTotal: financing.reduce((t, x) => t + x.amount, 0),
    closing,
  };
}

// ───────── Forward cash forecast ─────────

export interface CashForecastPoint {
  date: string;
  cash: number;       // projected total cash
  available: number;  // projected available cash
  lo: number;
  hi: number;
}

export interface CashForecast {
  points: CashForecastPoint[];
  horizonDays: number;
  expectedInflows30: number;
  expectedExpenses30: number;
  inventoryPurchases30: number;
  taxPayments30: number;
  endingCash30: number;
  /** Lowest projected available cash over the horizon, and when it occurs. */
  trough: { date: string; available: number };
  warnings: string[];
}

/**
 * Project cash forward. Inflows follow the net-revenue forecast (with settlement lag),
 * outflows follow the known schedule: recurring expenses, ad spend trend, PO balances,
 * bills, sales-tax remittances, CC payments, loan, owner draws.
 */
export function cashForecast(store: Store, horizonDays: number, threshold = CASH_FLOOR): CashForecast {
  const today = store.today;
  // Daily net cash-in from sales ≈ forecast net revenue × (1 − fee rate), lagged 2 days.
  const hist = dateRange(addDays(today, -119), today).map((d) => {
    const r = store.rollups.get(d);
    return r ? r.gross - r.discounts - r.refunds + r.shippingRev - r.fees : 0;
  });
  const fc = forecastDaily(hist, horizonDays);

  // Ad spend scales with revenue: use recent ratio.
  const recentSpend = avgLast(store, "adSpend", 28);
  const recentNetRev = avgLast(store, "netRev", 28);
  const adRatio = recentNetRev > 0 ? recentSpend / recentNetRev : 0.15;

  const monthlySubs = store.recurring.filter((r) => r.active && r.cadence === "monthly").reduce((t, r) => t + r.amount, 0);
  const acToday = availableCash(store, today);
  const salesTaxPayable = accountBalance(store, "sales_tax_payable", today);
  const ccBalance = accountBalance(store, "cc_amex", today);
  const incomePlan = estimatedIncomeTaxReserveGap(store, today);

  let cash = CASH_IDS.reduce((t, a) => t + accountBalance(store, a, today), 0);
  let ccOwed = ccBalance;
  const points: CashForecastPoint[] = [];
  let in30 = 0, out30 = 0, inv30 = 0, tax30 = 0, end30 = cash;
  const warnings: string[] = [];
  const out30Track = (i: number, amt: number) => { if (i < 30) out30 += amt; };
  // Cumulative uncertainty grows with the square root of accumulated variance, not by
  // summing each day's band — daily forecast errors are not perfectly correlated.
  // Summing them would fan the band out linearly and swamp the projection.
  let cumVariance = 0;
  // sales-tax accrual rate ≈ recent collections/day
  const taxPerDay = avgLast(store, "tax", 28);
  let taxAccrued = salesTaxPayable;

  // The deductions stack (total cash − available cash) is not static: paying a PO
  // balance, a bill, the card, or a tax remittance moves cash out AND discharges the
  // liability. Holding it constant would count those commitments twice and push
  // projected available cash spuriously negative. New ad/tax accruals add back to it.
  let deductionStack = acToday.totalCash - acToday.availableCash;
  const discharge = (amt: number) => { deductionStack = Math.max(0, deductionStack - amt); };

  for (let i = 0; i < horizonDays; i++) {
    const date = addDays(today, i + 1);
    const dom = Number(date.slice(8, 10));
    const inflow = Math.max(0, Math.round(fc.mean[i] ?? 0));
    const inflowLo = Math.max(0, Math.round(fc.lo[i] ?? 0));
    const inflowHi = Math.max(0, Math.round(fc.hi[i] ?? 0));
    let outflow = 0;

    // Ads accrue to CC; CC paid monthly on 15th
    const adAccrual = Math.round(inflow * adRatio);
    ccOwed += adAccrual;
    deductionStack += adAccrual;
    if (dom === 1) { ccOwed += monthlySubs; deductionStack += monthlySubs; }
    if (dom === 15) { outflow += ccOwed; out30Track(i, ccOwed); discharge(ccOwed); ccOwed = 0; }
    if (dom === 2) { outflow += DAY2_OBLIGATIONS; out30Track(i, DAY2_OBLIGATIONS); }
    if (dom === 3) { const f = Math.round(inflow * 0.06) * 30; outflow += f; out30Track(i, f); } // 3PL monthly approx
    if (dom === 5) {
      const d5 = MONTHLY_OBLIGATIONS.loanPayment + MONTHLY_OBLIGATIONS.bankFees;
      outflow += d5; out30Track(i, d5);
    }
    if (dom === 28) { outflow += MONTHLY_OBLIGATIONS.ownerDraw; out30Track(i, MONTHLY_OBLIGATIONS.ownerDraw); }
    // Sales tax remitted on the 20th (accrued balance)
    if (dom === 20 && taxAccrued > 0) {
      outflow += taxAccrued;
      if (i < 30) tax30 += taxAccrued;
      discharge(taxAccrued);
      taxAccrued = 0;
    }
    taxAccrued += Math.round(taxPerDay);
    deductionStack += Math.round(taxPerDay);
    // PO receipts/balances scheduled
    for (const po of store.purchaseOrders) {
      if ((po.status === "deposit_paid" || po.status === "in_transit")) {
        if (po.expectedAt === date) {
          const goods = po.total - po.freight - po.duties;
          const bal = goods - Math.round(goods * 0.3) + po.freight + po.duties;
          outflow += bal;
          discharge(bal);
          if (i < 30) inv30 += bal;
        }
      }
    }
    for (const b of store.bills) {
      if (b.status !== "paid" && b.dueAt === date) {
        const due = b.total - b.paid;
        outflow += due; out30Track(i, due); discharge(due);
      }
    }
    // Quarterly estimated income tax
    if ((date.slice(5, 7) === "09" || date.slice(5, 7) === "01" || date.slice(5, 7) === "04" || date.slice(5, 7) === "06") && dom === 14) {
      const q = Math.round(incomePlan.projectedAnnualTax / 4);
      outflow += q;
      if (i < 30) tax30 += q;
    }

    cash += inflow - outflow;
    // Per-day inflow sigma implied by the 80% band (±1.28σ), accumulated as variance.
    const daySigma = Math.max(0, (inflowHi - inflowLo) / (2 * 1.28));
    cumVariance += daySigma * daySigma;
    const cumBand = 1.28 * Math.sqrt(cumVariance);
    if (i < 30) { in30 += inflow; end30 = cash; }
    const available = cash - deductionStack;
    points.push({ date, cash, available, lo: cash - cumBand, hi: cash + cumBand });
  }

  // Report the actual low point, not the first crossing. A first-crossing warning on a
  // dip that recovers contradicts the 30/60/90 figures shown beside it.
  let trough = points[0];
  for (const pt of points) if (pt.available < trough.available) trough = pt;
  if (trough.available < threshold) {
    warnings.push(
      `Projected available cash bottoms at ${fmtUsdCompact(trough.available)} around ${trough.date}, ` +
      `below your ${fmtUsdCompact(threshold)} floor.`,
    );
  }
  return {
    points, horizonDays,
    expectedInflows30: in30, expectedExpenses30: out30,
    inventoryPurchases30: inv30, taxPayments30: tax30, endingCash30: end30,
    trough: { date: trough.date, available: trough.available },
    warnings,
  };
}

function avgLast(store: Store, kind: "adSpend" | "netRev" | "tax", days: number): number {
  const list = dateRange(addDays(store.today, -(days - 1)), store.today);
  let t = 0;
  for (const d of list) {
    const r = store.rollups.get(d);
    if (!r) continue;
    if (kind === "adSpend") t += r.adSpend;
    else if (kind === "tax") t += r.taxCollected;
    else t += r.gross - r.discounts - r.refunds + r.shippingRev;
  }
  return t / days;
}
