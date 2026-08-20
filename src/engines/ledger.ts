// Ledger engine — the accounting source of truth.
// Everything financial (cash, P&L, balance sheet, cash-flow statement) is a query
// over the double-entry journal. Nothing in the UI computes money independently.

import { COA, COA_BY_ID } from "@/domain/coa";
import type { CoaType, LedgerEntry } from "@/domain/types";
import type { Store } from "@/data/store";
import type { Period } from "@/lib/dates";

export interface AccountActivity {
  accountId: string;
  name: string;
  type: CoaType;
  amount: number; // natural-sign balance (see naturalSign)
}

/** Debit-normal account types. */
const DEBIT_NORMAL: Record<CoaType, boolean> = {
  asset: true, expense: true, cogs: true, contra_revenue: true,
  liability: false, equity: false, revenue: false,
};

/** Convert a (debit − credit) raw sum to the account's natural sign (positive = normal). */
export function naturalSign(type: CoaType, drMinusCr: number): number {
  return DEBIT_NORMAL[type] ? drMinusCr : -drMinusCr;
}

interface LedgerIndex {
  /** per account: sorted [date, cumulative dr−cr] pairs */
  cum: Map<string, { dates: string[]; totals: number[] }>;
  /** per account per period cache key */
  store: Store;
}

let _index: LedgerIndex | null = null;

export function ledgerIndex(store: Store): LedgerIndex {
  if (_index && _index.store === store) return _index;
  const perAccount = new Map<string, Map<string, number>>();
  for (const e of store.ledger) {
    for (const l of e.lines) {
      let m = perAccount.get(l.accountId);
      if (!m) { m = new Map(); perAccount.set(l.accountId, m); }
      m.set(e.date, (m.get(e.date) ?? 0) + l.debit - l.credit);
    }
  }
  const cum = new Map<string, { dates: string[]; totals: number[] }>();
  for (const [acct, m] of perAccount) {
    const dates = [...m.keys()].sort();
    const totals: number[] = [];
    let acc = 0;
    for (const d of dates) { acc += m.get(d)!; totals.push(acc); }
    cum.set(acct, { dates, totals });
  }
  _index = { cum, store };
  return _index;
}

function cumAt(idx: LedgerIndex, accountId: string, date: string): number {
  const rec = idx.cum.get(accountId);
  if (!rec) return 0;
  // binary search: last index with dates[i] <= date
  let lo = 0, hi = rec.dates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rec.dates[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans === -1 ? 0 : rec.totals[ans];
}

/** Natural-sign balance of an account as of a date (inclusive). */
export function accountBalance(store: Store, accountId: string, asOf: string): number {
  const acct = COA_BY_ID.get(accountId);
  if (!acct) return 0;
  return naturalSign(acct.type, cumAt(ledgerIndex(store), accountId, asOf));
}

/** Natural-sign net activity of an account within a period. */
export function accountActivity(store: Store, accountId: string, p: Period): number {
  const acct = COA_BY_ID.get(accountId);
  if (!acct) return 0;
  const idx = ledgerIndex(store);
  const end = cumAt(idx, accountId, p.end);
  const startPrev = cumAt(idx, accountId, addDaysStr(p.start, -1));
  return naturalSign(acct.type, end - startPrev);
}

// tiny local addDays to avoid circular import weight
function addDaysStr(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** All accounts of the given types with nonzero balance as of date. */
export function balancesByType(store: Store, types: CoaType[], asOf: string): AccountActivity[] {
  const out: AccountActivity[] = [];
  for (const a of COA) {
    if (!types.includes(a.type)) continue;
    const amount = accountBalance(store, a.id, asOf);
    if (amount !== 0) out.push({ accountId: a.id, name: a.name, type: a.type, amount });
  }
  return out;
}

/** Total cash: sum of accounts flagged isCash. */
export function totalCash(store: Store, asOf: string): number {
  let t = 0;
  for (const a of COA) if (a.isCash) t += accountBalance(store, a.id, asOf);
  return t;
}

/** Trial balance check — should always return 0. Surfaced in Settings → data quality. */
export function trialBalanceError(store: Store, asOf: string): number {
  const idx = ledgerIndex(store);
  let t = 0;
  for (const a of COA) t += cumAt(idx, a.id, asOf);
  return t;
}

/** Journal entries touching an account within a period (for drilldowns). */
export function entriesForAccount(store: Store, accountId: string, p: Period, limit = 200): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (let i = store.ledger.length - 1; i >= 0 && out.length < limit; i--) {
    const e = store.ledger[i];
    if (e.date < p.start || e.date > p.end) continue;
    if (e.lines.some((l) => l.accountId === accountId)) out.push(e);
  }
  return out;
}
