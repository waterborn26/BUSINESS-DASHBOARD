// Scenario engine — deterministic "What if?" modeling.
// Takes the current 30-day run-rate as the base and applies user levers,
// then recomputes revenue, profit, margin, cash, available cash, and runway.

import type { Store } from "@/data/store";
import { addDays, type Period } from "@/lib/dates";
import { periodTotals } from "./analytics";
import { availableCash } from "./cash";
import { pnl } from "./pnl";

export interface ScenarioLevers {
  adSpendPct: number;        // e.g. +30 = increase ad spend 30%
  conversionPct: number;     // relative change in conversion
  pricePct: number;          // blended price change
  inventoryPurchase: number; // one-time cents
  equipmentPurchase: number; // one-time cents
  extraTaxReserve: number;   // one-time cents
  newHireAnnual: number;     // annual salary cents
  revenueGrowthPct: number;  // exogenous demand change
}

export const DEFAULT_LEVERS: ScenarioLevers = {
  adSpendPct: 0, conversionPct: 0, pricePct: 0,
  inventoryPurchase: 0, equipmentPurchase: 0, extraTaxReserve: 0,
  newHireAnnual: 0, revenueGrowthPct: 0,
};

export interface ScenarioResult {
  base: ScenarioSide;
  scenario: ScenarioSide;
  assumptions: string[];
}

export interface ScenarioSide {
  monthlyRevenue: number;
  monthlyContribution: number;
  monthlyOperatingProfit: number;
  contributionMarginPct: number;
  availableCash: number;
  endCash90: number;
  runwayMonths: number | null;  // null = cash-flow positive
}

/** Ad-spend response: diminishing returns — new paid revenue scales with spend^0.7. */
export function runScenario(store: Store, levers: ScenarioLevers): ScenarioResult {
  const p: Period = { start: addDays(store.today, -29), end: store.today };
  const t = periodTotals(store, p);
  const statement = pnl(store, p);
  const cashNow = availableCash(store, store.today);

  const fixedOpex = statement.opexTotal - t.adSpend - t.fees - t.fulfillment; // monthly non-variable opex
  const paidShare = 0.45; // share of revenue attributable to paid acquisition (demo assumption)

  const base: ScenarioSide = side(t.netRevenue, t.adSpend, 0, 0);

  // Levers
  const adMult = 1 + levers.adSpendPct / 100;
  const paidRevMult = levers.adSpendPct >= -100 ? Math.pow(Math.max(0, adMult), 0.7) : 0;
  let revenue = t.netRevenue * (1 - paidShare) + t.netRevenue * paidShare * paidRevMult;
  revenue *= 1 + levers.conversionPct / 100;
  revenue *= 1 + levers.revenueGrowthPct / 100;
  // Price change: revenue scales with price but units dip slightly (elasticity −0.45)
  const priceMult = 1 + levers.pricePct / 100;
  const unitsMult = Math.pow(priceMult, -0.45);
  revenue *= priceMult * unitsMult;

  const adSpend = t.adSpend * adMult;
  const hireMonthly = Math.round(levers.newHireAnnual / 12);
  const oneTime = levers.inventoryPurchase + levers.equipmentPurchase + levers.extraTaxReserve;

  const scenario = side(Math.round(revenue), Math.round(adSpend), hireMonthly, oneTime);

  return {
    base, scenario,
    assumptions: [
      "Base = last-30-day actuals; scenario applies levers to the monthly run-rate.",
      "Paid revenue responds to ad spend with diminishing returns (spend^0.7); ~45% of revenue is paid-attributable.",
      "Price elasticity assumed −0.45 (units fall 4.5% per 10% price increase).",
      "COGS, fees, and fulfillment scale with units; inventory purchases move cash but not profit (asset until sold).",
      "All outputs are estimates for planning — not accounting figures.",
    ],
  };

  function side(rev: number, ads: number, hire: number, oneTimeCash: number): ScenarioSide {
    const revScale = t.netRevenue > 0 ? rev / t.netRevenue : 1;
    // COGS and fulfillment scale with UNITS, not revenue — a price change lifts revenue
    // without moving a single extra unit, so the price effect is divided back out.
    const priceMult = 1 + levers.pricePct / 100;
    const unitScale = priceMult > 0 ? revScale / priceMult : revScale;
    const cogs = Math.round(t.cogs * unitScale);
    const fulfillment = Math.round(t.fulfillment * unitScale);
    const fees = Math.round(rev * 0.029); // processing fees follow revenue, not units
    const contribution = rev - cogs - fees - fulfillment - ads;
    const opProfit = contribution - fixedOpex - hire;
    const monthlyCashDelta = opProfit; // approximation: profit ≈ operating cash over a quarter
    const availCash = cashNow.availableCash - oneTimeCash;
    const endCash90 = availCash + monthlyCashDelta * 3;
    const runway = monthlyCashDelta >= 0 ? null : Math.max(0, availCash / -monthlyCashDelta);
    return {
      monthlyRevenue: Math.round(rev),
      monthlyContribution: Math.round(contribution),
      monthlyOperatingProfit: Math.round(opProfit),
      contributionMarginPct: rev > 0 ? contribution / rev : 0,
      availableCash: Math.round(availCash),
      endCash90: Math.round(endCash90),
      runwayMonths: runway,
    };
  }
}
