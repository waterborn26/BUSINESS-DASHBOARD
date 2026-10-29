// A dataset with no expense records owes no payroll, rent or loan. The demo brand's
// obligations were being added to it regardless — $11,230 of invented debt, shown as
// the hero figure on the home screen.

import { describe, expect, it } from "vitest";
import { buildRealStore } from "@/data/realStore";
import { getStore } from "@/data/store";
import { availableCash } from "@/engines/cash";

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
