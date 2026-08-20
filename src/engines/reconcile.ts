// Reconciliation engine.
// 1. Settlement reconciliation: ecommerce sales − refunds − fees − tax vs processor
//    payouts vs bank deposits, per week.
// 2. Account reconciliation: ledger balance vs provider-imported balance.
// 3. Data-quality checks (uncategorized, trial balance, missing COGS…).

import type { Store } from "@/data/store";
import { accountBalance, trialBalanceError } from "./ledger";
import { addDays, dateRange } from "@/lib/dates";

export interface SettlementRow {
  weekStart: string;
  sales: number;         // gross − discounts + shipping + tax
  refunds: number;
  fees: number;
  expectedNet: number;
  payouts: number;       // ledger payout entries in the window (with settlement lag)
  difference: number;
  status: "reconciled" | "review";
}

export function settlementReconciliation(store: Store, weeks = 8): SettlementRow[] {
  const rows: SettlementRow[] = [];
  const today = store.today;
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(today, -(w * 7));
    const start = addDays(end, -6);
    let sales = 0, refunds = 0, fees = 0;
    for (const d of dateRange(start, end)) {
      const r = store.rollups.get(d);
      if (!r) continue;
      sales += r.gross - r.discounts + r.shippingRev + r.taxCollected;
      refunds += r.refunds;
      fees += r.fees;
    }
    // Payouts arrive with a 2-day lag
    let payouts = 0;
    for (const e of store.ledger) {
      if (e.sourceType !== "payout") continue;
      if (e.date < addDays(start, 2) || e.date > addDays(end, 2)) continue;
      for (const l of e.lines) if (l.accountId === "cash_checking") payouts += l.debit - l.credit;
    }
    const expectedNet = sales - refunds - fees;
    const difference = payouts - expectedNet;
    rows.push({
      weekStart: start, sales, refunds, fees, expectedNet, payouts, difference,
      status: Math.abs(difference) <= Math.max(2000, expectedNet * 0.02) ? "reconciled" : "review",
    });
  }
  return rows;
}

export interface AccountRecon {
  account: string;
  ledgerBalance: number;
  importedBalance: number;
  difference: number;
  status: "reconciled" | "review";
}

export function accountReconciliation(store: Store): AccountRecon[] {
  return store.finAccounts.map((fa) => {
    const ledgerBal = accountBalance(store, fa.coaAccount, store.today);
    const imported = fa.importedBalance ?? 0;
    const diff = ledgerBal - imported;
    return {
      account: fa.name, ledgerBalance: ledgerBal, importedBalance: imported,
      difference: diff, status: Math.abs(diff) < 100 ? "reconciled" : "review",
    };
  });
}

export interface DataQualityItem {
  id: string;
  label: string;
  value: string;
  ok: boolean;
  detail?: string;
}

export function dataQuality(store: Store): DataQualityItem[] {
  const uncategorized = store.bankTx.filter((t) => !t.category && !t.isTransfer).length;
  const tbe = trialBalanceError(store, store.today);
  const estimates = 2; // income tax reserve + forecasts
  const unreconciled = accountReconciliation(store).filter((r) => r.status === "review").length;
  const missingCogs = store.skus.filter((s) => !store.lots.some((l) => l.skuId === s.id)).length;
  return [
    { id: "trial", label: "Trial balance", value: tbe === 0 ? "Balanced" : `Off by ${tbe}¢`, ok: tbe === 0, detail: "∑ debits − ∑ credits across the entire journal." },
    { id: "uncat", label: "Uncategorized transactions", value: String(uncategorized), ok: uncategorized === 0, detail: "Bank/credit-card lines awaiting category review." },
    { id: "recon", label: "Unreconciled accounts", value: String(unreconciled), ok: unreconciled === 0 },
    { id: "cogs", label: "SKUs missing cost data", value: String(missingCogs), ok: missingCogs === 0 },
    { id: "est", label: "Estimated figures in use", value: String(estimates), ok: true, detail: "Income-tax reserve and all forecasts are estimates, labeled throughout." },
    { id: "sync", label: "Last sync", value: "Demo dataset (deterministic)", ok: true },
  ];
}
