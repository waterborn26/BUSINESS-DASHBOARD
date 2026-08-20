// Business health score — 0–100, fully explainable.
// Each component is a documented 0–100 sub-score with an explicit weight;
// the total is the weighted average. Nothing is arbitrary or hidden.

import type { Store } from "@/data/store";
import { addDays, type Period } from "@/lib/dates";
import { clamp } from "@/lib/stats";
import { compare } from "./analytics";
import { availableCash } from "./cash";
import { cashForecast } from "./cashflow";
import { customerKpis } from "./customers";
import { inventoryRows, inventoryCapital } from "./inventory";
import { salesTaxSummary, estimatedIncomeTaxReserveGap } from "./taxes";
import { pnl } from "./pnl";
import { CAPABILITY_LABELS } from "@/domain/types";

export interface HealthComponent {
  id: string;
  label: string;
  score: number;       // 0–100
  weight: number;      // fractions summing to 1
  explanation: string;
  direction: "up" | "down" | "flat";
}

export interface HealthScore {
  total: number;
  components: HealthComponent[];
  /** Components skipped because the data behind them is not connected. */
  unavailable: { label: string; needs: string }[];
  /** Share of the full weighting the score is actually based on (1 = complete). */
  coverage: number;
}

export function healthScore(store: Store): HealthScore {
  const today = store.today;
  const cap = store.capabilities;
  const last30: Period = { start: addDays(today, -29), end: today };
  const cmp = compare(store, last30);
  const cash = availableCash(store, today);
  const fc = cashForecast(store, 90);
  const cust = customerKpis(store, last30);
  const inv = inventoryRows(store);
  const invCapital = inventoryCapital(inv);
  const statement = pnl(store, last30);
  const stx = salesTaxSummary(store, last30);
  const itx = estimatedIncomeTaxReserveGap(store, today);

  const comps: HealthComponent[] = [];

  // Sales growth: 0 at −20%, 100 at +25% vs previous 30d
  {
    const g = cmp.previous.netRevenue > 0
      ? (cmp.current.netRevenue - cmp.previous.netRevenue) / cmp.previous.netRevenue : 0;
    comps.push({
      id: "growth", label: "Sales growth", weight: 0.15,
      score: clamp(((g + 0.2) / 0.45) * 100, 0, 100),
      explanation: `Net revenue ${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}% vs previous 30 days. 0 pts at −20%, 100 pts at +25%.`,
      direction: g > 0.02 ? "up" : g < -0.02 ? "down" : "flat",
    });
  }
  // Profitability: operating margin, 0 at 0%, 100 at 20%
  if (cap.cogs && cap.expenses) {
    const m = statement.operatingMarginPct;
    comps.push({
      id: "profit", label: "Profitability", weight: 0.18,
      score: clamp((m / 0.2) * 100, 0, 100),
      explanation: `Operating margin ${(m * 100).toFixed(1)}% over the last 30 days. 0 pts at 0%, 100 pts at 20%.`,
      direction: m > 0.08 ? "up" : m < 0.03 ? "down" : "flat",
    });
  }
  // Cash position: available cash vs 2 months of opex
  if (cap.cash && cap.expenses) {
    const monthlyOpex = statement.opexTotal;
    const ratio = monthlyOpex > 0 ? cash.availableCash / (monthlyOpex * 2) : 1;
    comps.push({
      id: "cash", label: "Available cash", weight: 0.18,
      score: clamp(ratio * 100, 0, 100),
      explanation: `Available cash covers ${(ratio * 2).toFixed(1)} months of operating expenses. 100 pts at 2 months.`,
      direction: ratio > 1 ? "up" : ratio < 0.5 ? "down" : "flat",
    });
  }
  // Cash-flow outlook: penalize projected floor breaches
  if (cap.cash) {
    const min = Math.min(...fc.points.map((pt) => pt.available));
    const score = min < 0 ? 5 : min < 2_500_000 ? 45 : min < 4_000_000 ? 75 : 95;
    comps.push({
      id: "outlook", label: "90-day cash outlook", weight: 0.12,
      score,
      explanation: fc.warnings[0] ?? `Projected available-cash minimum over 90 days: $${Math.round(min / 100).toLocaleString()}.`,
      direction: fc.warnings.length ? "down" : "up",
    });
  }
  // Tax health: reserves vs obligations
  if (cap.cash) {
    const obligations = stx.currentPayable + itx.reserveTarget;
    const ratio = obligations > 0 ? clamp(cash.totalCash / (obligations * 3), 0, 1) : 1;
    comps.push({
      id: "tax", label: "Tax liability coverage", weight: 0.08,
      score: Math.round(ratio * 100),
      explanation: `Cash covers ${(cash.totalCash / Math.max(1, obligations)).toFixed(1)}× current tax obligations (sales tax + estimated income reserve).`,
      direction: ratio > 0.8 ? "up" : "flat",
    });
  }
  // Retention
  if (cap.customers) {
    const r = cust.repeatRatePct;
    comps.push({
      id: "retention", label: "Customer retention", weight: 0.08,
      score: clamp((r / 0.35) * 100, 0, 100),
      explanation: `${(r * 100).toFixed(1)}% of customers have purchased 2+ times. 100 pts at 35%.`,
      direction: r > 0.22 ? "up" : "flat",
    });
  }
  // Acquisition efficiency: LTV:CAC
  if (cap.adSpend && cap.customers) {
    const l = cust.ltvToCac;
    comps.push({
      id: "cac", label: "Acquisition efficiency", weight: 0.08,
      score: clamp((l / 4) * 100, 0, 100),
      explanation: `LTV:CAC of ${l.toFixed(1)}. 100 pts at 4.0.`,
      direction: l > 3 ? "up" : l < 2 ? "down" : "flat",
    });
  }
  // Inventory health
  if (cap.inventory) {
    const stranded = invCapital.atCost > 0
      ? (invCapital.slowMovingCapital + invCapital.deadStockCapital) / invCapital.atCost : 0;
    const risky = inv.filter((r) => r.health === "Stockout risk").length;
    const score = clamp(100 - stranded * 180 - risky * 12, 0, 100);
    comps.push({
      id: "inventory", label: "Inventory health", weight: 0.07,
      score,
      explanation: `${(stranded * 100).toFixed(0)}% of inventory capital is slow/dead; ${risky} product(s) at stockout risk.`,
      direction: risky > 0 ? "down" : "flat",
    });
  }
  // Conversion
  if (cap.sessions) {
    const c = cmp.current.conversion;
    const prev = cmp.previous.conversion;
    comps.push({
      id: "conversion", label: "Website conversion", weight: 0.06,
      score: clamp((c / 0.03) * 100, 0, 100),
      explanation: `Blended conversion ${(c * 100).toFixed(2)}% (prev ${(prev * 100).toFixed(2)}%). 100 pts at 3%.`,
      direction: c > prev * 1.02 ? "up" : c < prev * 0.98 ? "down" : "flat",
    });
  }

  // Score only what is measurable, and renormalise so a partially-connected business
  // is not silently penalised for data it has not supplied. Coverage is reported so the
  // number can never masquerade as a complete assessment.
  const weightPresent = comps.reduce((t, c) => t + c.weight, 0);
  const total = weightPresent > 0
    ? Math.round(comps.reduce((t, c) => t + c.score * c.weight, 0) / weightPresent)
    : 0;

  const unavailable: { label: string; needs: string }[] = [];
  const miss = (on: boolean, label: string, key: keyof typeof CAPABILITY_LABELS) => {
    if (!on) unavailable.push({ label, needs: CAPABILITY_LABELS[key].needs });
  };
  miss(cap.cogs && cap.expenses, "Profitability", "cogs");
  miss(cap.cash && cap.expenses, "Available cash", "cash");
  miss(cap.cash, "90-day cash outlook", "cash");
  miss(cap.customers, "Customer retention", "customers");
  miss(cap.adSpend && cap.customers, "Acquisition efficiency", "adSpend");
  miss(cap.inventory, "Inventory health", "inventory");
  miss(cap.sessions, "Website conversion", "sessions");

  return { total, components: comps, unavailable, coverage: weightPresent };
}
