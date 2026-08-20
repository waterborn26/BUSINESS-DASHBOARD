// Financial-correctness tests: the demo dataset must produce internally
// consistent books, or every screen built on them is lying.

import { describe, expect, it } from "vitest";
import { generateDataset } from "@/data/demo";
import type { Store } from "@/data/store";
import type { Sku } from "@/domain/types";
import { accountBalance, totalCash, trialBalanceError } from "@/engines/ledger";
import { availableCash } from "@/engines/cash";
import { pnl } from "@/engines/pnl";
import { cashflowStatement, cashForecast } from "@/engines/cashflow";
import { periodTotals, funnel } from "@/engines/analytics";
import { detectInsights } from "@/engines/insights";
import { recommendations } from "@/engines/recommend";
import { healthScore } from "@/engines/health";
import { dailyBriefing } from "@/engines/briefing";
import { runScenario, DEFAULT_LEVERS } from "@/engines/scenario";
import { CASH_FLOOR } from "@/domain/policy";
import { settlementReconciliation } from "@/engines/reconcile";
import { addDays } from "@/lib/dates";

function makeStore(): Store {
  const ds = generateDataset("2026-08-20");
  const productById = new Map(ds.products.map((p) => [p.id, p]));
  const skuById = new Map(ds.skus.map((s) => [s.id, s]));
  const skusByProduct = new Map<string, Sku[]>();
  for (const s of ds.skus) {
    if (!skusByProduct.has(s.productId)) skusByProduct.set(s.productId, []);
    skusByProduct.get(s.productId)!.push(s);
  }
  return { ...ds, productById, skuById, skusByProduct };
}

const store = makeStore();
const today = store.today;

describe("ledger integrity", () => {
  it("every journal entry balances (trial balance = 0)", () => {
    expect(trialBalanceError(store, today)).toBe(0);
  });

  it("cash accounts are positive and plausible", () => {
    expect(totalCash(store, today)).toBeGreaterThan(1_000_000); // > $10k
    expect(accountBalance(store, "cash_checking", today)).toBeGreaterThan(0);
  });

  it("inventory asset balance is non-negative and matches lots", () => {
    const ledgerInv = accountBalance(store, "inventory", today);
    const lotValue = store.lots.reduce((t, l) => t + l.remainingQty * l.unitLanded, 0);
    // Ledger inventory = opening + purchases − COGS. Lot valuation must match closely
    // (small drift from per-unit rounding of freight/duties allocations).
    expect(ledgerInv).toBeGreaterThan(0);
    const drift = Math.abs(ledgerInv - lotValue) / lotValue;
    expect(drift).toBeLessThan(0.02);
  });

  it("sales tax payable equals collected − refunded − remitted", () => {
    const ledgerTax = accountBalance(store, "sales_tax_payable", today);
    const fromLiabilities = store.taxLiabilities.reduce((t, l) => t + l.collected - l.refunded - l.remitted, 0);
    expect(Math.abs(ledgerTax - fromLiabilities)).toBeLessThan(200); // cents tolerance
  });
});

describe("cash engine", () => {
  it("available cash < total cash, both positive", () => {
    const ac = availableCash(store, today);
    expect(ac.totalCash).toBeGreaterThan(0);
    expect(ac.availableCash).toBeLessThan(ac.totalCash);
    const sumAccounts = ac.cashAccounts.reduce((t, a) => t + a.amount, 0);
    expect(sumAccounts).toBe(ac.totalCash);
  });

  it("forecast does not double-count commitments into negative available cash", () => {
    // Paying a PO/bill/card/tax moves cash out AND discharges the liability. If the
    // deductions stack were held constant, available cash would sink spuriously.
    const fc = cashForecast(store, 90);
    const minAvailable = Math.min(...fc.points.map((p) => p.available));
    expect(minAvailable).toBeGreaterThan(-1_000_000); // never wildly negative
    // Available must track cash, never diverge further from it over the horizon.
    const first = fc.points[0];
    const last = fc.points[fc.points.length - 1];
    expect(last.cash - last.available).toBeLessThanOrEqual((first.cash - first.available) * 1.6);
  });

  it("reports the trough, and warns only when it breaches the shared floor", () => {
    // One floor, read the same way everywhere: a warning that fires on a dip which
    // recovers would contradict the 30/60/90 figures shown beside it.
    const fc = cashForecast(store, 90);
    const min = Math.min(...fc.points.map((p) => p.available));
    expect(fc.trough.available).toBe(min);
    expect(fc.points.some((p) => p.date === fc.trough.date)).toBe(true);
    if (min < CASH_FLOOR) {
      expect(fc.warnings.length).toBe(1);
    } else {
      expect(fc.warnings).toEqual([]);
    }
  });

  it("forecast uncertainty band widens sub-linearly (sqrt, not summed)", () => {
    const fc = cashForecast(store, 90);
    const w = (i: number) => fc.points[i].hi - fc.points[i].lo;
    const w30 = w(29), w90 = w(89);
    expect(w90).toBeGreaterThan(w30);          // still widens with horizon
    expect(w90).toBeLessThan(w30 * 3);          // but nothing like 3x the days
  });

  it("cash-flow statement ties: opening + O + I + F = closing", () => {
    const p = { start: addDays(today, -89), end: today };
    const s = cashflowStatement(store, p);
    const computed = s.opening + s.operatingTotal + s.investingTotal + s.financingTotal;
    expect(Math.abs(computed - s.closing)).toBeLessThan(5);
  });
});

describe("P&L vs rollups", () => {
  it("ledger revenue matches order rollups", () => {
    const p = { start: addDays(today, -89), end: today };
    const statement = pnl(store, p);
    const t = periodTotals(store, p);
    // Ledger nets refunds via contra account; rollup nets them in netRevenue.
    expect(Math.abs(statement.netRevenue - t.netRevenue)).toBeLessThan(1000);
    expect(Math.abs(statement.cogsTotal - t.cogs)).toBeLessThan(1000);
    expect(statement.grossMarginPct).toBeGreaterThan(0.5);
    expect(statement.grossMarginPct).toBeLessThan(0.8);
  });
});

describe("reconciliation", () => {
  it("most settlement weeks reconcile within tolerance", () => {
    const rows = settlementReconciliation(store, 8);
    const ok = rows.filter((r) => r.status === "reconciled").length;
    expect(ok).toBeGreaterThanOrEqual(6); // edge weeks may straddle the lag window
  });
});

describe("business plausibility", () => {
  // These guard the demo dataset against drifting into a business that could not
  // exist. A dashboard demoed on impossible numbers teaches the wrong instincts.
  const last30 = { start: addDays(today, -29), end: today };
  const last90 = { start: addDays(today, -89), end: today };

  it("gross margin sits in the DTC hard-goods range (55–75%)", () => {
    const s = pnl(store, last90);
    expect(s.grossMarginPct).toBeGreaterThan(0.55);
    expect(s.grossMarginPct).toBeLessThan(0.75);
  });

  it("operating margin is realistic (3–22%), not fantasy", () => {
    const s = pnl(store, last90);
    expect(s.operatingMarginPct).toBeGreaterThan(0.03);
    expect(s.operatingMarginPct).toBeLessThan(0.22);
  });

  it("available cash is positive but materially below total cash", () => {
    const ac = availableCash(store, today);
    expect(ac.availableCash).toBeGreaterThan(0);
    // The whole point of the app: available is well under the bank balance.
    expect(ac.availableCash).toBeLessThan(ac.totalCash * 0.75);
  });

  it("inventory represents 1.5–5 months of COGS, not a warehouse full of dead capital", () => {
    const s = pnl(store, last90);
    const monthlyCogs = s.cogsTotal / 3;
    const inv = accountBalance(store, "inventory", today);
    expect(inv / monthlyCogs).toBeGreaterThan(1.5);
    expect(inv / monthlyCogs).toBeLessThan(5);
  });

  it("is growing year over year even while the recent trend softens", () => {
    const now = periodTotals(store, last30);
    const yearAgo = periodTotals(store, { start: addDays(today, -394), end: addDays(today, -365) });
    expect(now.netRevenue).toBeGreaterThan(yearAgo.netRevenue);
  });

  it("carries a real sales-tax liability to reserve against", () => {
    const payable = accountBalance(store, "sales_tax_payable", today);
    expect(payable).toBeGreaterThan(100_000); // > $1k
  });
});

describe("demo storylines are detectable", () => {
  // The dataset exists to demonstrate the intelligence layer. If a storyline stops
  // firing, the demo silently becomes a wall of healthy green — worse than useless.
  const insights = detectInsights(store);
  const has = (id: string) => insights.some((i) => i.id === id);

  it("surfaces the mobile conversion regression", () => {
    expect(has("mobile-cr-drop")).toBe(true);
  });

  it("surfaces rising Meta acquisition cost", () => {
    expect(has("meta-cac-rise")).toBe(true);
  });

  it("surfaces at least one stockout risk", () => {
    expect(insights.some((i) => i.id.startsWith("stockout-"))).toBe(true);
  });

  it("surfaces capital stranded in slow/dead inventory", () => {
    expect(has("dead-capital")).toBe(true);
  });

  it("surfaces the duplicate subscription", () => {
    expect(has("dup-subs")).toBe(true);
  });

  it("isolates the regression to mobile — desktop is a clean control", () => {
    const l14 = { start: addDays(today, -13), end: today };
    const p14 = { start: addDays(today, -27), end: addDays(today, -14) };
    const cr = (p: typeof l14, device: string) => {
      const f = funnel(store, p, { device });
      return f[0].value ? f[4].value / f[0].value : 0;
    };
    const mobileDelta = cr(l14, "mobile") / cr(p14, "mobile") - 1;
    const desktopDelta = cr(l14, "desktop") / cr(p14, "desktop") - 1;
    expect(mobileDelta).toBeLessThan(-0.1);   // mobile clearly broke
    expect(desktopDelta).toBeGreaterThan(-0.05); // desktop did not
  });

  it("produces a ranked action list led by a high-impact item", () => {
    const recs = recommendations(store);
    expect(recs.length).toBeGreaterThanOrEqual(3);
    expect(recs.length).toBeLessThanOrEqual(12);
    // Sorted by score, descending.
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
    }
    expect(recs[0].impactMonthly).toBeGreaterThan(0);
  });

  it("never proposes a zero-quantity action", () => {
    // "Order 0 units is safer" is not an action. A reorder the cash plan cannot fund
    // must be reframed as a financing problem, not printed as a no-op instruction.
    for (const r of recommendations(store)) {
      expect(r.action).not.toMatch(/ordering 0 units/i);
      expect(r.action).not.toMatch(/~0 units/i);
      expect(r.title).toBeTruthy();
      expect(r.action.length).toBeGreaterThan(20);
    }
  });

  it("scores business health in a believable middle band", () => {
    const h = healthScore(store);
    expect(h.total).toBeGreaterThan(40);
    expect(h.total).toBeLessThan(90);
    const weights = h.components.reduce((t, c) => t + c.weight, 0);
    expect(weights).toBeCloseTo(1, 5); // weights must actually sum to 1
  });

  it("briefing never claims strength while revenue is falling", () => {
    const b = dailyBriefing(store);
    const cur = periodTotals(store, { start: addDays(today, -29), end: today });
    const prev = periodTotals(store, { start: addDays(today, -59), end: addDays(today, -30) });
    if (cur.netRevenue < prev.netRevenue * 0.95) {
      expect(b.headline).not.toMatch(/performance is strong/i);
    }
    expect(b.actions.length).toBeGreaterThan(0);
  });
});

describe("scenario modelling", () => {
  const run = (lv: Partial<typeof DEFAULT_LEVERS>) =>
    runScenario(store, { ...DEFAULT_LEVERS, ...lv });

  it("neutral levers reproduce the base exactly", () => {
    const r = run({});
    expect(r.scenario.monthlyRevenue).toBe(r.base.monthlyRevenue);
    expect(r.scenario.monthlyOperatingProfit).toBe(r.base.monthlyOperatingProfit);
  });

  it("more ad spend buys revenue with diminishing returns, and can cost profit", () => {
    const r = run({ adSpendPct: 30 });
    expect(r.scenario.monthlyRevenue).toBeGreaterThan(r.base.monthlyRevenue);
    // 30% more spend must not yield 30% more revenue.
    expect(r.scenario.monthlyRevenue).toBeLessThan(r.base.monthlyRevenue * 1.3);
    // At this efficiency the extra spend does not pay for itself.
    expect(r.scenario.monthlyContribution).toBeLessThan(r.base.monthlyContribution);
  });

  it("buying inventory moves cash but never profit — it is an asset, not an expense", () => {
    const spend = 2_000_000;
    const r = run({ inventoryPurchase: spend });
    expect(r.scenario.monthlyOperatingProfit).toBe(r.base.monthlyOperatingProfit);
    expect(r.scenario.monthlyContribution).toBe(r.base.monthlyContribution);
    expect(r.base.availableCash - r.scenario.availableCash).toBe(spend);
  });

  it("a price rise lifts revenue less than the price (units fall) but lifts margin", () => {
    const r = run({ pricePct: 8 });
    expect(r.scenario.monthlyRevenue).toBeGreaterThan(r.base.monthlyRevenue);
    expect(r.scenario.monthlyRevenue).toBeLessThan(r.base.monthlyRevenue * 1.08);
    expect(r.scenario.contributionMarginPct).toBeGreaterThan(r.base.contributionMarginPct);
  });

  it("hiring reduces operating profit by the monthly salary", () => {
    const annual = 6_000_000;
    const r = run({ newHireAnnual: annual });
    const delta = r.base.monthlyOperatingProfit - r.scenario.monthlyOperatingProfit;
    expect(delta).toBe(Math.round(annual / 12));
  });
});

describe("dataset shape", () => {
  it("has the required scale", () => {
    expect(store.orders.length).toBeGreaterThan(5000);
    expect(store.products.length).toBeGreaterThanOrEqual(25);
    expect(store.customers.length).toBeGreaterThan(2000);
    expect(store.days.length).toBeGreaterThanOrEqual(365);
    expect(store.purchaseOrders.length).toBeGreaterThan(10);
    expect(store.taxLiabilities.length).toBeGreaterThan(10);
  });

  it("is deterministic", () => {
    const again = generateDataset("2026-08-20");
    expect(again.orders.length).toBe(store.orders.length);
    expect(again.ledger.length).toBe(store.ledger.length);
    expect(totalCash({ ...store, ledger: again.ledger } as Store, today)).toBeDefined();
  });
});
