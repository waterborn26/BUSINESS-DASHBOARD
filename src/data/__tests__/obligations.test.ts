// A dataset with no expense records owes no payroll, rent or loan. The demo brand's
// obligations were being added to it regardless — $11,230 of invented debt, shown as
// the hero figure on the home screen.

import { describe, expect, it } from "vitest";
import { buildRealStore } from "@/data/realStore";
import { getStore } from "@/data/store";
import { availableCash } from "@/engines/cash";
import { cashForecast } from "@/engines/cashflow";
import { periodTotals } from "@/engines/analytics";

describe("obligations only ever come from the dataset's own records", () => {
  const real = buildRealStore();

  it("claims no fixed obligations when no expenses are recorded", () => {
    expect(real.capabilities.expenses).toBe(false);
    expect(real.recurring).toHaveLength(0);
    const fixed = availableCash(real, real.today).deductions
      .find((d) => d.label === "Next-30-day fixed obligations");
    expect(fixed).toBeUndefined();
  });

  it("counts only what Shopify can actually show it owes", () => {
    const c = availableCash(real, real.today);
    const labels = c.deductions.map((d) => d.label);
    expect(labels).toContain("Sales tax payable");
    for (const d of c.deductions) expect(d.amount).toBeGreaterThan(0);
    // Sales tax plus the income-tax reserve, and nothing invented beyond them.
    expect(c.obligationsTotal).toBe(c.deductions.reduce((t, d) => t + d.amount, 0));
    expect(c.obligationsTotal).toBeLessThan(1_000_000); // under $10k, not the demo's $16k
  });

  it("still reports the simulated brand's real obligations", () => {
    const demo = getStore("demo");
    const fixed = availableCash(demo, demo.today).deductions
      .find((d) => d.label === "Next-30-day fixed obligations");
    expect(fixed?.amount).toBeGreaterThan(100_000);
  });
});

describe("nothing is assumed where there is no number to read", () => {
  const real = buildRealStore();

  it("does not forecast the simulated brand's payroll, loan or owner draw", () => {
    // The forecast added them on fixed days of the month regardless of dataset,
    // the same fault the cash panel had.
    const fc = cashForecast(real, 90);
    const demoMonthlyFixed = 1_175_000; // DAY2 + loan, in cents
    expect(fc.expectedExpenses30).toBeLessThan(demoMonthlyFixed);
    for (const pt of fc.points) expect(Number.isFinite(pt.cash)).toBe(true);
  });

  it("will not call gross profit 'contribution profit' when fees are unmeasured", () => {
    expect(real.capabilities.fees).toBe(false);
    const t = periodTotals(real, { start: "2026-01-01", end: real.today });
    // With fees, fulfilment and ad spend all unknown they read as zero, which makes
    // contribution identical to gross. The figure is fine; the label would not be.
    expect(t.contributionProfit).toBe(t.grossProfit);
  });

  it("keeps every capability false unless the data really carries it", () => {
    const c = real.capabilities;
    expect(c.cogs).toBe(true);     // Shopify reports cost of goods
    expect(c.cash).toBe(false);
    expect(c.fees).toBe(false);
    expect(c.expenses).toBe(false);
    expect(c.sessions).toBe(false);
    expect(c.adSpend).toBe(false);
    expect(c.units).toBe(false);
  });
});
