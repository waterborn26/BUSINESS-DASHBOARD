// Recommendation engine — "What should I do?"
// Converts insights + inventory + marketing + cash state into ranked actions.
// Priority = expected impact × confidence × urgency ÷ difficulty.

import type { Store } from "@/data/store";
import { addDays, fmtDate, type Period } from "@/lib/dates";
import { fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { detectInsights, type Evidence } from "./insights";
import { inventoryRows, LEAD_TIME_DAYS, REORDER_COVER_DAYS } from "./inventory";
import { availableCash } from "./cash";
import { trafficSourceStats, productStats } from "./analytics";
import { salesTaxSummary } from "./taxes";

export type RecStatus = "open" | "done" | "ignored" | "remind" | "investigate";

export interface Recommendation {
  id: string;
  title: string;
  action: string;
  reason: string;
  evidence: Evidence[];
  impactMonthly: number;    // cents (absolute expected value of acting)
  cashRequired: number;     // cents
  confidencePct: number;
  urgency: 1 | 2 | 3;       // 3 = act now
  difficulty: 1 | 2 | 3;    // 3 = hard
  score: number;
  category: "inventory" | "marketing" | "pricing" | "site" | "finance" | "expense" | "customers";
  drill?: string;
}

// Session-lifetime status store (persisted to SQLite in the Tauri build).
const statusMap = new Map<string, RecStatus>();
export function recStatus(id: string): RecStatus { return statusMap.get(id) ?? "open"; }
export function setRecStatus(id: string, s: RecStatus): void { statusMap.set(id, s); }

export function recommendations(store: Store): Recommendation[] {
  const out: Recommendation[] = [];
  const today = store.today;
  const last14: Period = { start: addDays(today, -13), end: today };
  const insights = detectInsights(store);
  const inv = inventoryRows(store);
  const cash = availableCash(store, today);

  // 1. Reorders — cash-aware.
  // Split into reorders the cash plan can fund and reorders it cannot. "Order 0 units"
  // is not an action; a starved reorder is a financing problem, and is framed as one.
  const needsReorder = inv
    .filter((x) => x.recommendedReorderQty > 0 && x.daysOfSupply < 60)
    .sort((a, b) => a.daysOfSupply - b.daysOfSupply);
  const monthlyContributionOf = (r: (typeof needsReorder)[number]) =>
    Math.round(r.velocity14 * 30 * (r.units > 0 ? r.contributionProfit / r.units : 0));

  for (const r of needsReorder.filter((x) => x.cashSafeReorderQty > 0).slice(0, 3)) {
    const capped = r.cashSafeReorderQty < r.recommendedReorderQty;
    const qty = r.cashSafeReorderQty;
    out.push({
      id: `reorder-${r.productId}`,
      title: `Reorder ${r.name}`,
      action: capped
        ? `Demand supports ${r.recommendedReorderQty} units, but given projected cash and tax obligations, ordering ${qty} units (${fmtUsdCompact(qty * r.landedUnitCost)} landed) is the safe quantity right now.`
        : `Place a PO for ~${qty} units (${fmtUsdCompact(qty * r.landedUnitCost)} landed) to cover ~${REORDER_COVER_DAYS} days from receipt.`,
      reason: `${r.velocity14.toFixed(1)} units/day recent velocity, ${r.stock} on hand → ~${Math.round(r.daysOfSupply)} days of supply vs a ~${LEAD_TIME_DAYS}-day lead time.`,
      evidence: [
        { label: "Days of supply", value: `${Math.round(r.daysOfSupply)}` },
        { label: "14-day velocity", value: `${r.velocity14.toFixed(1)}/day` },
        { label: "Demand-based qty", value: `${r.recommendedReorderQty}` },
        { label: "Cash-safe qty", value: `${qty}` },
        { label: "Cash required", value: fmtUsdCompact(qty * r.landedUnitCost) },
        { label: "Available cash", value: fmtUsdCompact(cash.availableCash) },
      ],
      impactMonthly: Math.max(monthlyContributionOf(r), 50_000),
      cashRequired: qty * r.landedUnitCost,
      confidencePct: 88,
      urgency: r.daysOfSupply < 21 ? 3 : 2,
      difficulty: 1,
      score: 0,
      category: "inventory",
      drill: "inventory",
    });
  }

  // Reorders the cash plan cannot fund at all — surfaced once, as a cash problem.
  const starved = needsReorder.filter((x) => x.cashSafeReorderQty === 0);
  if (starved.length > 0) {
    const shortfall = starved.reduce((t, r) => t + r.recommendedReorderQty * r.landedUnitCost, 0);
    const atRisk = starved.reduce((t, r) => t + monthlyContributionOf(r), 0);
    out.push({
      id: "reorder-cash-constrained",
      title: `Free up cash — ${starved.length} reorder${starved.length > 1 ? "s" : ""} can't be funded`,
      action: `${starved.map((r) => r.name).join(", ")} ${starved.length > 1 ? "need" : "needs"} restocking, but available cash is already committed. Clearing slow/dead stock, delaying discretionary spend, or staging the POs would fund roughly ${fmtUsdCompact(shortfall)} of inventory.`,
      reason: `Demand-based reorders total ${fmtUsdCompact(shortfall)} against ${fmtUsdCompact(cash.availableCash)} of available cash, which is already spoken for by tax reserves and existing commitments.`,
      evidence: [
        { label: "Reorders unfunded", value: String(starved.length) },
        { label: "Cash needed", value: fmtUsdCompact(shortfall) },
        { label: "Available cash", value: fmtUsdCompact(cash.availableCash) },
        { label: "Monthly contribution at risk", value: fmtUsdCompact(atRisk) },
        ...starved.slice(0, 3).map((r) => ({
          label: r.name, value: `${r.recommendedReorderQty} units · ${Math.round(r.daysOfSupply)}d supply`,
        })),
      ],
      impactMonthly: Math.max(atRisk, 50_000),
      cashRequired: 0,
      confidencePct: 75,
      urgency: starved.some((r) => r.daysOfSupply < 21) ? 3 : 2,
      difficulty: 2,
      score: 0,
      category: "finance",
      drill: "inventory",
    });
  }

  // 2. Investigate mobile PDP (from insight)
  const mob = insights.find((i) => i.id === "mobile-cr-drop");
  if (mob) {
    out.push({
      id: "fix-mobile-pdp",
      title: "Investigate mobile product-page performance",
      action: `Review the ${fmtDate(store.siteUpdateDay)} product-page changes, A/B test against the prior template, and reduce paid Instagram traffic until mobile conversion recovers.`,
      reason: mob.detail,
      evidence: mob.evidence,
      impactMonthly: Math.abs(mob.estMonthlyImpact ?? 400_000),
      cashRequired: 0,
      confidencePct: mob.confidencePct,
      urgency: 3, difficulty: 2, score: 0,
      category: "site", drill: "website",
    });
  }

  // 3. Rebalance Meta spend
  const cac = insights.find((i) => i.id === "meta-cac-rise");
  if (cac) {
    const meta = trafficSourceStats(store, last14).find((s) => s.source === "meta");
    out.push({
      id: "trim-meta-prospecting",
      title: "Trim Meta prospecting until CAC recovers",
      action: "Reduce Meta prospecting budget ~20% and shift toward retargeting and Google Brand, where contribution per dollar is currently higher.",
      reason: cac.detail,
      evidence: cac.evidence,
      impactMonthly: Math.round((meta?.spend ?? 0) * (30 / 14) * 0.06),
      cashRequired: 0,
      confidencePct: 70,
      urgency: 2, difficulty: 1, score: 0,
      category: "marketing", drill: "marketing",
    });
  }

  // 4. Price test on high performers with strong margins & velocity
  {
    const ps = productStats(store, { start: addDays(today, -89), end: today })
      .filter((p) => p.units > 150 && p.grossMarginPct > 0.66 && p.trendPct > 0.05 && p.refundRatePct < 0.04);
    const cand = ps[0];
    if (cand) {
      const upside = Math.round(cand.revenue / 3 * 0.06); // ~6% price lift on a month of revenue
      out.push({
        id: `price-test-${cand.productId}`,
        title: `Test a price increase on ${cand.name}`,
        action: `Demand is growing ${fmtPct(cand.trendPct, 0)} with a ${fmtPct(cand.grossMarginPct, 0)} gross margin and low refunds — test +5–8% pricing. The ${fmtDate(addDays(today, -90))} Crosscurrent increase raised contribution profit ~11% at −4% units.`,
        reason: "High velocity, strong margin, and low refund rate suggest pricing power.",
        evidence: [
          { label: "90-day revenue", value: fmtUsdCompact(cand.revenue) },
          { label: "Units trend (28d)", value: fmtPct(cand.trendPct, 0, ) },
          { label: "Gross margin", value: fmtPct(cand.grossMarginPct, 0) },
          { label: "Refund rate", value: fmtPct(cand.refundRatePct, 1) },
        ],
        impactMonthly: upside,
        cashRequired: 0,
        confidencePct: 62,
        urgency: 1, difficulty: 1, score: 0,
        category: "pricing", drill: "products",
      });
    }
  }

  // 5. Clear dead stock
  const dead = insights.find((i) => i.id === "dead-capital");
  if (dead) {
    out.push({
      id: "clear-dead-stock",
      title: "Run a clearance on slow & dead inventory",
      action: "Bundle or discount dead-stock SKUs (Coastal Candle, Patch Kit, Passport Wallet) to convert stranded inventory into cash before year-end.",
      reason: dead.detail,
      evidence: dead.evidence,
      impactMonthly: dead.estMonthlyImpact ?? 100_000,
      cashRequired: 0,
      confidencePct: 65,
      urgency: 1, difficulty: 2, score: 0,
      category: "inventory", drill: "inventory",
    });
  }

  // 6. Tax reserve top-up
  {
    const stx = salesTaxSummary(store, last14);
    if (stx.currentPayable > 300_000) {
      out.push({
        id: "tax-reserve-topup",
        title: `Keep ${fmtUsd(stx.currentPayable)} reserved for sales tax`,
        action: `Move ${fmtUsdCompact(stx.currentPayable)} mentally (or physically, to savings) out of spendable cash — remittances are due on the 20th.`,
        reason: "Collected sales tax is not operating revenue; it is a liability until remitted.",
        evidence: stx.byJurisdiction.map((j) => ({ label: `${j.jurisdiction} outstanding`, value: fmtUsd(j.outstanding) })),
        impactMonthly: 0,
        cashRequired: 0,
        confidencePct: 92,
        urgency: 2, difficulty: 1, score: 0,
        category: "finance", drill: "taxes",
      });
    }
  }

  // 7. Duplicate subscription
  const dup = insights.find((i) => i.id === "dup-subs");
  if (dup) {
    out.push({
      id: "cancel-dup-sub",
      title: "Cancel a duplicate social-scheduling tool",
      action: dup.detail,
      reason: "Two tools with the same job.",
      evidence: dup.evidence,
      impactMonthly: dup.estMonthlyImpact ?? 3500,
      cashRequired: 0,
      confidencePct: 60,
      urgency: 1, difficulty: 1, score: 0,
      category: "expense", drill: "expenses",
    });
  }

  // 8. Win-back email to at-risk repeat customers
  out.push({
    id: "winback-email",
    title: "Send a win-back flow to at-risk repeat customers",
    action: "Email repeat customers quiet for 60–120 days with a low-discount reorder nudge; segment exists in Customers → At risk.",
    reason: "Repeat customers convert at multiples of cold traffic and cost nothing to reach.",
    evidence: [],
    impactMonthly: 180_000,
    cashRequired: 0,
    confidencePct: 55,
    urgency: 1, difficulty: 1, score: 0,
    category: "customers", drill: "customers",
  });

  // Score & sort
  for (const r of out) {
    const impact = Math.max(1, r.impactMonthly / 100);
    r.score = (impact * (r.confidencePct / 100) * r.urgency) / r.difficulty;
  }
  return out.sort((a, b) => b.score - a.score);
}
