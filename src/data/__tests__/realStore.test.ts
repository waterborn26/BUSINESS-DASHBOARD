// Real-data tests: the app must behave honestly on WaterBorn Workshop's actual
// Shopify history, where many inputs (cash, COGS, sessions, ad spend) simply
// do not exist. Nothing may render as NaN, Infinity, or a confident fake zero.

import { describe, expect, it } from "vitest";
import { buildRealStore } from "@/data/realStore";
import { getStore } from "@/data/store";
import { REAL_DAYS, REAL_PRODUCTS, REAL_CHANNELS } from "@/data/real";
import { periodTotals } from "@/engines/analytics";
import { pnl } from "@/engines/pnl";
import { availableCash } from "@/engines/cash";
import { cashForecast } from "@/engines/cashflow";
import { healthScore } from "@/engines/health";
import { detectInsights } from "@/engines/insights";
import { recommendations } from "@/engines/recommend";
import { dailyBriefing, answerQuestion } from "@/engines/briefing";
import { inventoryRows } from "@/engines/inventory";
import { customerKpis } from "@/engines/customers";
import { trialBalanceError } from "@/engines/ledger";
import { addDays } from "@/lib/dates";

const store = buildRealStore();
const today = store.today;

function allFinite(obj: Record<string, unknown>, label: string) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "number") {
      expect(Number.isFinite(v), `${label}.${k} = ${v}`).toBe(true);
    }
  }
}

describe("real Shopify snapshot", () => {
  it("reconciles to Shopify's own reported totals", () => {
    const orders = REAL_DAYS.reduce((t, d) => t + d.orders, 0);
    const gross = REAL_DAYS.reduce((t, d) => t + d.gross, 0);
    expect(orders).toBe(811);
    expect(gross).toBe(5_183_752); // $51,837.52 as reported by Shopify
  });

  it("carries the real catalog and channel mix", () => {
    expect(REAL_PRODUCTS.length).toBe(25);
    expect(REAL_PRODUCTS.some((p) => p.name === "THE CREEDSMAN BELT")).toBe(true);
    expect(REAL_CHANNELS.reduce((t, c) => t + c.orders, 0)).toBe(811);
  });

  it("parses product names containing dashes intact", () => {
    const dash = REAL_PRODUCTS.find((p) => p.name.includes("DROWN PROOF TEE - BLACK"));
    expect(dash).toBeDefined();
    expect(dash!.orders).toBe(23);
  });
});

describe("engines on real data never produce non-finite numbers", () => {
  const periods = [
    ["30d", { start: addDays(today, -29), end: today }],
    ["365d", { start: addDays(today, -364), end: today }],
    ["all", { start: store.start, end: today }],
  ] as const;

  for (const [label, p] of periods) {
    it(`periodTotals is finite over ${label}`, () => {
      allFinite(periodTotals(store, p) as unknown as Record<string, unknown>, label);
    });

    it(`P&L is finite over ${label}`, () => {
      const s = pnl(store, p);
      expect(Number.isFinite(s.grossMarginPct)).toBe(true);
      expect(Number.isFinite(s.operatingMarginPct)).toBe(true);
    });
  }

  it("ledger balances on real postings", () => {
    expect(trialBalanceError(store, today)).toBe(0);
  });

  it("cash, forecast, health, insights and recommendations survive missing inputs", () => {
    const ac = availableCash(store, today);
    allFinite(ac as unknown as Record<string, unknown>, "availableCash");

    const fc = cashForecast(store, 90);
    expect(fc.points.length).toBe(90);
    for (const pt of fc.points) allFinite(pt as unknown as Record<string, unknown>, "fc");
    expect(Number.isFinite(fc.trough.available)).toBe(true);

    const h = healthScore(store);
    expect(Number.isFinite(h.total)).toBe(true);
    for (const c of h.components) expect(Number.isFinite(c.score)).toBe(true);

    for (const i of detectInsights(store)) {
      expect(i.title).not.toMatch(/NaN|Infinity|undefined/);
      expect(i.detail).not.toMatch(/NaN|Infinity|undefined/);
    }

    for (const r of recommendations(store)) {
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.action).not.toMatch(/NaN|Infinity|undefined/);
    }

    for (const r of inventoryRows(store)) {
      expect(Number.isFinite(r.daysOfSupply)).toBe(true);
    }

    allFinite(
      customerKpis(store, { start: addDays(today, -364), end: today }) as unknown as Record<string, unknown>,
      "customerKpis",
    );
  });

  it("the briefing states real figures without fabricating the ones it lacks", () => {
    const b = dailyBriefing(store);
    expect(b.headline).not.toMatch(/NaN|Infinity|undefined/);
    expect(b.headline.length).toBeGreaterThan(20);
  });

  it("the analyst answers without inventing cash it cannot see", () => {
    const a = answerQuestion(store, "how much money do I actually have?");
    expect(a.answer).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("missing data is reported as unknown, never as a confident number", () => {
  // The dangerous failure is not a crash — it is a plausible-looking figure computed
  // from nothing. These tests exist because an earlier build cheerfully reported
  // "available cash −$13,096" and "contribution margin 100%" for a store with no
  // bank feed and no product costs.

  it("declares what the Shopify-only dataset does not know", () => {
    expect(store.capabilities.cash).toBe(false);
    expect(store.capabilities.cogs).toBe(false);
    expect(store.capabilities.sessions).toBe(false);
    expect(store.capabilities.adSpend).toBe(false);
  });

  it("never presents a negative available cash derived from unknown cash", () => {
    const ac = availableCash(store, today);
    expect(ac.cashKnown).toBe(false);
    // Obligations are real and must still be reported.
    expect(ac.obligationsTotal).toBeGreaterThan(0);
    // But "available" must not be a fabricated deficit.
    expect(ac.availableCash).toBe(0);
  });

  it("the briefing never claims a margin when costs are unknown", () => {
    const b = dailyBriefing(store);
    expect(b.headline).not.toMatch(/margin is 100%/i);
    expect(b.headline).toMatch(/no product costs|not calculated/i);
  });

  it("the briefing never states cash on hand it does not have", () => {
    const b = dailyBriefing(store);
    expect(b.headline).not.toMatch(/of \$0 total cash/);
    const cashRow = b.financialPosition.find((f) => f.label === "Cash on hand");
    expect(cashRow?.value).toBe("not connected");
  });

  it("the analyst declines the cash question instead of answering it wrongly", () => {
    const a = answerQuestion(store, "how much money do I actually have?");
    expect(a.answer).toMatch(/no bank|not connected|can't answer/i);
    // It should still surface the obligations it genuinely knows.
    expect(a.citations.length).toBeGreaterThan(0);
  });

  it("never passes order count off as a unit count", () => {
    // Shopify's aggregate feed has no line quantities. Reporting units = orders would
    // silently assert every order contained exactly one item.
    expect(store.capabilities.units).toBe(false);
    const t = periodTotals(store, { start: store.start, end: today });
    expect(t.orders).toBeGreaterThan(0);
    expect(t.units).toBe(0);
  });

  it("health scores only what it can measure, and says how much that is", () => {
    const h = healthScore(store);
    expect(h.coverage).toBeGreaterThan(0);
    expect(h.coverage).toBeLessThan(1);          // this dataset is incomplete
    expect(h.unavailable.length).toBeGreaterThan(0);
    // Components that cannot be computed must be absent, not scored as zero.
    const ids = h.components.map((c) => c.id);
    expect(ids).not.toContain("cash");
    expect(ids).not.toContain("conversion");
    expect(ids).toContain("growth");             // revenue-based scoring still works
    for (const c of h.components) expect(c.score).toBeGreaterThanOrEqual(0);
  });

  it("the demo dataset, which has everything, still answers all of these", () => {
    // The guards must not silently disable working features on complete data.
    const demo = getStore("demo");
    expect(demo.capabilities.cash).toBe(true);
    const ac = availableCash(demo, demo.today);
    expect(ac.cashKnown).toBe(true);
    expect(ac.availableCash).toBeGreaterThan(0);
    expect(dailyBriefing(demo).headline).toMatch(/margin/i);
    const dh = healthScore(demo);
    expect(dh.coverage).toBeCloseTo(1, 5);       // complete data → complete score
    expect(dh.unavailable).toEqual([]);
    expect(demo.capabilities.units).toBe(true);
  });
});

describe("recommendation impact is bounded by what the business can produce", () => {
  const monthlyRevenue = periodTotals(store, { start: addDays(today, -89), end: today }).netRevenue / 3;

  it("never claims a monthly upside larger than the whole business earns in a month", () => {
    for (const r of recommendations(store)) {
      if (r.impactMonthly === null) continue;
      expect(r.impactMonthly, `${r.id} claims ${r.impactMonthly} against ${monthlyRevenue}/mo`)
        .toBeLessThanOrEqual(Math.round(monthlyRevenue));
    }
  });

  it("withholds the estimate entirely at this revenue rather than inventing one", () => {
    // The engine carries defaults sized for a mid-size brand ($1,800/mo win-back, and
    // similar). On a store doing a few hundred dollars a month those are fiction.
    expect(monthlyRevenue).toBeLessThan(100_000);
    for (const r of recommendations(store)) expect(r.impactMonthly).toBeNull();
  });

  it("still ranks the actions, using confidence and urgency when impact is unknown", () => {
    const recs = recommendations(store);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(Number.isFinite(r.score), `${r.id} score = ${r.score}`).toBe(true);
      expect(r.score).toBeGreaterThan(0);
    }
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
  });

  it("keeps real dollar impacts on the fully-populated demo dataset", () => {
    const demo = getStore("demo");
    const demoMonthly = periodTotals(demo, { start: addDays(demo.today, -89), end: demo.today }).netRevenue / 3;
    const recs = recommendations(demo);
    expect(recs.some((r) => r.impactMonthly !== null && r.impactMonthly > 0)).toBe(true);
    for (const r of recs) {
      if (r.impactMonthly === null) continue;
      expect(r.impactMonthly).toBeLessThanOrEqual(Math.round(demoMonthly));
    }
  });
});
