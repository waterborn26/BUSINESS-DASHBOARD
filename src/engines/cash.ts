// Cash engine — the "where is my money / what can I actually spend" layer.
// Distinguishes money that exists (Total Cash) from money that is safe to spend
// (Available Cash) by netting out liabilities, reserves, and commitments.

import type { Store } from "@/data/store";
import type { Provenance } from "@/domain/types";
import { accountBalance, totalCash } from "./ledger";
import { addDays, type Period } from "@/lib/dates";
import { estimatedIncomeTaxReserveGap } from "./taxes";
import { MONTHLY_OBLIGATIONS, DAY2_OBLIGATIONS } from "@/data/demo";

export interface CashLine {
  label: string;
  amount: number;          // positive numbers; deductions rendered as negatives by caller
  provenance: Provenance;
  detail?: string;
  drill?: { kind: string; id?: string };
}

export interface AvailableCashBreakdown {
  asOf: string;
  /**
   * False when no cash account is connected. Total and available cash are then
   * meaningless and must be rendered as "not available" — never as $0, and never as
   * a negative figure produced by subtracting real obligations from unknown cash.
   */
  cashKnown: boolean;
  /** Obligations are real and knowable even when the cash side is not. */
  obligationsTotal: number;
  cashAccounts: CashLine[];
  totalCash: number;
  inTransit: CashLine;      // processor clearing — exists but not yet in the bank
  deductions: CashLine[];
  availableCash: number;
}

export function availableCash(store: Store, asOf: string): AvailableCashBreakdown {
  const cashAccounts: CashLine[] = store.finAccounts
    .filter((a) => ["checking", "savings", "hysa", "paypal"].includes(a.kind))
    .map((a) => ({
      label: a.name,
      amount: accountBalance(store, a.coaAccount, asOf),
      provenance: "computed" as Provenance,
      drill: { kind: "account", id: a.coaAccount },
    }));
  const total = totalCash(store, asOf);

  const clearing = accountBalance(store, "processor_clearing", asOf);

  // Sales tax currently payable (ledger liability — collected minus remitted)
  const salesTax = accountBalance(store, "sales_tax_payable", asOf);

  // Income tax reserve: planning estimate, never a ledger fact.
  const incomeReserve = estimatedIncomeTaxReserveGap(store, asOf).reserveTarget;

  const ccBalance = accountBalance(store, "cc_amex", asOf);
  const ap = accountBalance(store, "accounts_payable", asOf);

  // Open bills not yet in AP (freight/contractor invoices entered manually)
  const openBills = store.bills
    .filter((b) => b.status !== "paid" && !b.linkedPo)
    .reduce((t, b) => t + (b.total - b.paid), 0);

  // Remaining commitments on open POs (unpaid portion of not-yet-received orders)
  const poCommitments = store.purchaseOrders
    .filter((po) => po.status === "deposit_paid" || po.status === "in_transit")
    .reduce((t, po) => t + (po.total - po.paid), 0);

  // Upcoming recurring obligations in the next 30 days (subscriptions, contractors,
  // payroll, rent, insurance, loan). Shares constants with the generator and forecaster.
  const monthlyRecurring = store.recurring.filter((r) => r.active && r.cadence === "monthly")
    .reduce((t, r) => t + r.amount, 0);
  const upcomingFixed = monthlyRecurring + DAY2_OBLIGATIONS + MONTHLY_OBLIGATIONS.loanPayment;

  // Jurisdictions with an outstanding balance, named from the data rather than assumed.
  const owingJurisdictions = [...new Set(
    store.taxLiabilities
      .filter((l) => l.collected - l.refunded - l.remitted > 0)
      .map((l) => l.jurisdiction),
  )].sort();

  const deductions: CashLine[] = [
    {
      label: "Sales tax payable", amount: salesTax, provenance: "imported",
      detail: owingJurisdictions.length
        ? `Collected, not yet remitted — ${owingJurisdictions.join(", ")}`
        : "Collected, not yet remitted",
      drill: { kind: "taxes" },
    },
    { label: "Estimated income tax reserve", amount: incomeReserve, provenance: "estimate", detail: `${store.incomeTaxRatePct}% of YTD estimated profit less estimated payments`, drill: { kind: "taxes" } },
    { label: "Credit card balance (Amex)", amount: ccBalance, provenance: "computed", drill: { kind: "account", id: "cc_amex" } },
    { label: "Vendor bills payable", amount: ap + openBills, provenance: "computed", detail: "Accounts payable plus open manual invoices", drill: { kind: "payables" } },
    { label: "Committed purchase orders", amount: poCommitments, provenance: "computed", detail: "Unpaid balances on POs in production or transit", drill: { kind: "payables" } },
    { label: "Next-30-day fixed obligations", amount: upcomingFixed, provenance: "computed", detail: "Subscriptions, contractors, payroll, rent, insurance, loan payment", drill: { kind: "expenses" } },
  ];

  const obligationsTotal = deductions.reduce((t, d) => t + d.amount, 0);
  const cashKnown = cashAccounts.length > 0;
  // With no cash source, "available" is not a number we are entitled to state.
  const available = cashKnown ? total - obligationsTotal : 0;
  return {
    asOf,
    cashKnown,
    obligationsTotal,
    cashAccounts,
    totalCash: total,
    inTransit: { label: "Processor clearing (in transit)", amount: clearing, provenance: "computed", detail: "Recent sales not yet paid out by Shopify Payments" },
    deductions,
    availableCash: available,
  };
}

// ───────── "Where did my money go" ─────────

export interface CashMovement {
  label: string;
  amount: number; // signed: + = cash in, − = cash out
  category: string;
}

/** Decompose net cash movement over a period into causes, from ledger cash legs. */
export function cashMovement(store: Store, p: Period): { open: number; close: number; moves: CashMovement[] } {
  const cashIds = new Set(["cash_checking", "cash_savings", "cash_paypal"]);
  const buckets = new Map<string, number>();
  const add = (k: string, v: number) => buckets.set(k, (buckets.get(k) ?? 0) + v);

  for (const e of store.ledger) {
    if (e.date < p.start || e.date > p.end) continue;
    let cashDelta = 0;
    for (const l of e.lines) if (cashIds.has(l.accountId)) cashDelta += l.debit - l.credit;
    if (cashDelta === 0) continue;
    switch (e.sourceType) {
      case "payout": add("Customer receipts (payouts)", cashDelta); break;
      case "po": add("Inventory purchases", cashDelta); break;
      case "cc_payment": add("Credit card payments", cashDelta); break;
      case "tax_remit": add("Sales tax remitted", cashDelta); break;
      case "tax_payment": add("Income tax payments", cashDelta); break;
      case "loan": add("Debt payments", cashDelta); break;
      case "owner": add("Owner draws", cashDelta); break;
      case "bill": add("Fulfillment (3PL)", cashDelta); break;
      case "transfer": break; // internal — nets to zero across cash accounts
      case "expense": {
        const exp = e.lines.find((l) => l.accountId.startsWith("exp_"));
        const label = exp?.accountId === "exp_contractors" ? "Contractors"
          : exp?.accountId === "exp_rent" ? "Rent & storage"
          : exp?.accountId === "exp_professional" ? "Professional services"
          : exp?.accountId === "exp_travel" ? "Travel"
          : exp?.accountId === "exp_equipment" ? "Equipment"
          : "Other operating expenses";
        add(label, cashDelta);
        break;
      }
      default: add("Other", cashDelta);
    }
  }
  const open = ["cash_checking", "cash_savings", "cash_paypal"]
    .reduce((t, a) => t + accountBalance(store, a, addDays(p.start, -1)), 0);
  const close = ["cash_checking", "cash_savings", "cash_paypal"]
    .reduce((t, a) => t + accountBalance(store, a, p.end), 0);
  const moves = [...buckets.entries()]
    .map(([label, amount]) => ({ label, amount, category: label }))
    .filter((m) => m.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  return { open, close, moves };
}
