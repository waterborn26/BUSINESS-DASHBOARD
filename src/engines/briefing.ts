// Briefing engine — composes the daily executive briefing and answers analyst
// questions from computed metrics.
//
// AI architecture: Database → deterministic engines → structured context → LLM.
// In demo/offline mode a deterministic template composer produces the prose from the
// same structured context an LLM adapter would receive, so the app is fully
// functional without an API key. The LLM never does arithmetic and never sees raw rows.

import type { Store } from "@/data/store";
import { addDays, fmtDate, type Period } from "@/lib/dates";
import { fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { compare, periodTotals, productStats, trafficSourceStats } from "./analytics";
import { availableCash, cashMovement } from "./cash";
import { cashForecast } from "./cashflow";
import { detectInsights, type Insight } from "./insights";
import { inventoryRows, CASH_FLOOR } from "./inventory";
import { recommendations, type Recommendation } from "./recommend";
import { salesTaxSummary, estimatedIncomeTaxReserveGap } from "./taxes";
import { pnl } from "./pnl";
import { forecastDaily, forecastSum } from "./forecast";
import { dateRange } from "@/lib/dates";

export interface Briefing {
  headline: string;
  wins: Insight[];
  problems: Insight[];
  opportunities: Insight[];
  risks: Insight[];
  financialPosition: { label: string; value: string; tone?: "good" | "bad" | "neutral"; estimate?: boolean }[];
  actions: Recommendation[];
}

export function dailyBriefing(store: Store): Briefing {
  const today = store.today;
  const last30: Period = { start: addDays(today, -29), end: today };
  const cmp = compare(store, last30);
  const yesterday = periodTotals(store, { start: addDays(today, -1), end: addDays(today, -1) });
  const avg30 = cmp.current.netRevenue / 30;
  const insights = detectInsights(store);
  const cash = availableCash(store, today);
  const stx = salesTaxSummary(store, last30);
  const itx = estimatedIncomeTaxReserveGap(store, today);
  const recs = recommendations(store);
  const fc = cashForecast(store, 90);
  const top = productStats(store, { start: addDays(today, -13), end: today })[0];
  const stockRisk = inventoryRows(store).find((r) => r.health === "Stockout risk");

  const yDev = avg30 > 0 ? (yesterday.netRevenue - avg30) / avg30 : 0;
  const growth = cmp.previous.netRevenue > 0
    ? (cmp.current.netRevenue - cmp.previous.netRevenue) / cmp.previous.netRevenue : 0;
  const yoy = cmp.yearAgo.netRevenue > 0
    ? (cmp.current.netRevenue - cmp.yearAgo.netRevenue) / cmp.yearAgo.netRevenue : 0;

  // Lead with the 30-day trend (the real signal), not a single day. A single strong or
  // weak day is context, never the headline — that is how dashboards mislead.
  const parts: string[] = [];
  if (growth <= -0.05) {
    parts.push(
      `Revenue is softening: net revenue is down ${fmtPct(Math.abs(growth), 0)} over the last 30 days vs the prior period` +
      (yoy > 0.05 ? `, though still up ${fmtPct(yoy, 0)} year over year` : "") + ".",
    );
  } else if (growth >= 0.05) {
    parts.push(
      `Business performance is strong: net revenue is up ${fmtPct(growth, 0)} over the last 30 days vs the prior period` +
      (yoy > 0.05 ? ` and ${fmtPct(yoy, 0)} year over year` : "") +
      (top ? `, led by ${top.name}` : "") + ".",
    );
  } else {
    parts.push(
      `Business performance is steady: net revenue is flat over the last 30 days` +
      (yoy > 0.05 ? `, up ${fmtPct(yoy, 0)} year over year` : "") +
      (top ? `, led by ${top.name}` : "") + ".",
    );
  }
  parts.push(
    `Contribution margin is ${fmtPct(cmp.current.contributionMarginPct, 0)}` +
    (Math.abs(yDev) > 0.15
      ? `, and yesterday ran ${fmtPct(Math.abs(yDev), 0)} ${yDev > 0 ? "above" : "below"} the 30-day daily average.`
      : "."),
  );
  const metaCac = insights.find((i) => i.id === "meta-cac-rise");
  if (metaCac) parts.push(`Paid acquisition costs are rising: ${metaCac.title}.`);
  if (stockRisk) parts.push(`${stockRisk.name} is projected to sell out in ~${Math.round(stockRisk.daysOfSupply)} days.`);
  parts.push(`Current sales-tax liability is ${fmtUsd(stx.currentPayable)}; available operating cash is ${fmtUsd(cash.availableCash)} of ${fmtUsd(cash.totalCash)} total cash.`);

  return {
    headline: parts.join(" "),
    wins: insights.filter((i) => i.kind === "win"),
    problems: insights.filter((i) => i.kind === "problem"),
    opportunities: insights.filter((i) => i.kind === "opportunity"),
    risks: insights.filter((i) => i.kind === "risk"),
    financialPosition: [
      { label: "Cash on hand", value: fmtUsd(cash.totalCash) },
      { label: "Actually available", value: fmtUsd(cash.availableCash), tone: "good" },
      { label: "Sales tax owed", value: fmtUsd(stx.currentPayable), tone: "bad" },
      { label: "Est. income-tax reserve", value: fmtUsd(itx.reserveTarget), tone: "bad", estimate: true },
      { label: "Credit card balance", value: fmtUsd(cash.deductions.find((d) => d.label.startsWith("Credit"))?.amount ?? 0), tone: "bad" },
      { label: "Committed POs + bills", value: fmtUsd((cash.deductions.find((d) => d.label.startsWith("Committed"))?.amount ?? 0) + (cash.deductions.find((d) => d.label.startsWith("Vendor"))?.amount ?? 0)), tone: "bad" },
      { label: "30-day cash outlook", value: `${fmtUsdCompact(fc.endingCash30)} projected`, estimate: true, tone: fc.warnings.length ? "bad" : "neutral" },
    ],
    actions: recs.slice(0, 7),
  };
}

// ───────── Natural-language analyst (offline, deterministic) ─────────

export interface AnalystAnswer {
  answer: string;
  citations: { label: string; value: string }[];
  periodUsed: string;
}

/**
 * Deterministic Q&A over computed metrics. Matches intent by keyword and answers
 * from the engines — never fabricates. An LLM adapter can wrap this same context.
 */
export function answerQuestion(store: Store, q: string): AnalystAnswer {
  const today = store.today;
  const last30: Period = { start: addDays(today, -29), end: today };
  const periodLabel = `${fmtDate(last30.start)} – ${fmtDate(last30.end)} (last 30 days)`;
  const s = q.toLowerCase();
  const t = periodTotals(store, last30);
  const cash = availableCash(store, today);

  if (/(how much money|actually have|safe to spend|available)/.test(s)) {
    return {
      answer: `You have ${fmtUsd(cash.totalCash)} across cash accounts, but ${fmtUsd(cash.availableCash)} is actually available to spend. The difference is money already spoken for: ${cash.deductions.map((d) => `${d.label} ${fmtUsd(d.amount)}`).join("; ")}. There is also ${fmtUsd(cash.inTransit.amount)} in processor clearing on its way to the bank.`,
      citations: cash.deductions.map((d) => ({ label: d.label, value: fmtUsd(d.amount) })),
      periodUsed: `As of ${fmtDate(today)}`,
    };
  }
  if (/where did my money go|where.*money.*go/.test(s)) {
    const mv = cashMovement(store, last30);
    const outs = mv.moves.filter((m) => m.amount < 0).slice(-5).reverse();
    const statement = pnl(store, last30);
    return {
      answer: `Cash ${mv.close >= mv.open ? "increased" : "decreased"} ${fmtUsd(Math.abs(mv.close - mv.open))} over the last 30 days while operating profit was ${fmtUsd(statement.operatingProfit)}. Largest outflows: ${outs.map((m) => `${m.label.toLowerCase()} ${fmtUsd(Math.abs(m.amount))}`).join(", ")}. Cash and profit differ mainly because inventory purchases and tax remittances consume cash without hitting the P&L immediately.`,
      citations: mv.moves.map((m) => ({ label: m.label, value: fmtUsd(m.amount) })),
      periodUsed: periodLabel,
    };
  }
  if (/most profitable|profitable products/.test(s)) {
    const ps = productStats(store, last30).sort((a, b) => b.contributionProfit - a.contributionProfit).slice(0, 5);
    return {
      answer: `By contribution profit over the last 30 days: ${ps.map((p, i) => `${i + 1}. ${p.name} (${fmtUsdCompact(p.contributionProfit)}, ${fmtPct(p.contributionMarginPct, 0)} margin)`).join("; ")}. Note this ranks by profit after COGS, fees, fulfillment and allocated ad spend — not by revenue.`,
      citations: ps.map((p) => ({ label: p.name, value: fmtUsdCompact(p.contributionProfit) })),
      periodUsed: periodLabel,
    };
  }
  if (/reorder|restock/.test(s)) {
    const rows = inventoryRows(store).filter((r) => r.recommendedReorderQty > 0).sort((a, b) => a.daysOfSupply - b.daysOfSupply).slice(0, 4);
    return {
      answer: rows.length
        ? `Reorder priorities: ${rows.map((r) => `${r.name} — ~${Math.round(r.daysOfSupply)} days left, order ${r.cashSafeReorderQty} units (${fmtUsdCompact(r.cashSafeReorderQty * r.landedUnitCost)})`).join("; ")}. Quantities are cash-aware: capped so available cash stays above the ${fmtUsdCompact(CASH_FLOOR)} floor.`
        : "No products currently need reordering.",
      citations: rows.map((r) => ({ label: r.name, value: `${Math.round(r.daysOfSupply)} days of supply` })),
      periodUsed: `As of ${fmtDate(today)}`,
    };
  }
  if (/bank account decline|profitable but|cash.*decline/.test(s)) {
    const mv = cashMovement(store, last30);
    const statement = pnl(store, last30);
    const inv = mv.moves.find((m) => m.label === "Inventory purchases");
    const tax = mv.moves.find((m) => m.label === "Sales tax remitted");
    return {
      answer: `Over the last 30 days the business earned ${fmtUsd(statement.operatingProfit)} of operating profit, but cash moved ${fmtUsd(mv.close - mv.open)}. The gap: ${inv ? `${fmtUsd(Math.abs(inv.amount))} went into inventory (an asset, not an expense)` : ""}${tax ? `, ${fmtUsd(Math.abs(tax.amount))} paid prior tax liabilities` : ""}, and owner draws/debt service are not P&L expenses. Profit and cash are different questions — both are on the Cash Flow screen.`,
      citations: mv.moves.map((m) => ({ label: m.label, value: fmtUsd(m.amount) })),
      periodUsed: periodLabel,
    };
  }
  if (/biggest expenses|largest expenses/.test(s)) {
    const statement = pnl(store, last30);
    const topExp = statement.opex.slice(0, 5);
    return {
      answer: `Largest operating expenses (30d): ${topExp.map((e) => `${e.label} ${fmtUsd(e.amount)}`).join(", ")}. Total opex ${fmtUsd(statement.opexTotal)} on ${fmtUsd(statement.netRevenue)} net revenue.`,
      citations: topExp.map((e) => ({ label: e.label, value: fmtUsd(e.amount) })),
      periodUsed: periodLabel,
    };
  }
  if (/afford|production run|can i (buy|spend)/.test(s)) {
    const m = q.match(/\$?([\d,]+)k?/);
    const amt = m ? Number(m[1].replace(/,/g, "")) * (q.includes("k") ? 100000 : 100) : 1_500_000;
    const after = cash.availableCash - amt;
    return {
      answer: after > 0
        ? `Yes, with care: spending ${fmtUsd(amt)} would leave ${fmtUsd(after)} of available operating cash (after tax reserves, card balances, and existing commitments). Check the 90-day cash forecast before committing — upcoming PO balances are already netted out.`
        : `Not safely right now: ${fmtUsd(amt)} exceeds your ${fmtUsd(cash.availableCash)} of truly available cash. The bank balance is higher, but tax reserves and commitments are already spoken for.`,
      citations: [
        { label: "Available cash", value: fmtUsd(cash.availableCash) },
        { label: "After purchase", value: fmtUsd(after) },
      ],
      periodUsed: `As of ${fmtDate(today)}`,
    };
  }
  if (/sales tax|reserve for/.test(s)) {
    const stx = salesTaxSummary(store, last30);
    return {
      answer: `Current sales-tax liability is ${fmtUsd(stx.currentPayable)} (${stx.byJurisdiction.map((j) => `${j.jurisdiction} ${fmtUsd(j.outstanding)}`).join(", ")}). This is imported data, not an estimate. Keep at least this amount reserved; the next remittance is due ${stx.nextFilings[0] ? fmtDate(stx.nextFilings[0].paymentDue) : "next month"}.`,
      citations: stx.byJurisdiction.map((j) => ({ label: j.jurisdiction, value: fmtUsd(j.outstanding) })),
      periodUsed: `As of ${fmtDate(today)}`,
    };
  }
  if (/focus|this week|highest.impact|biggest opportunit/.test(s)) {
    const recs = recommendations(store).slice(0, 3);
    return {
      answer: `Top priorities by expected impact × confidence × urgency ÷ difficulty: ${recs.map((r, i) => `${i + 1}. ${r.title} (est. ${fmtUsdCompact(r.impactMonthly)}/mo, ${r.confidencePct}% confidence)`).join("; ")}.`,
      citations: recs.map((r) => ({ label: r.title, value: `${fmtUsdCompact(r.impactMonthly)}/mo` })),
      periodUsed: `As of ${fmtDate(today)}`,
    };
  }
  if (/forecast|next month|what.*happen/.test(s)) {
    const hist = dateRange(addDays(today, -119), today).map((d) => {
      const r = store.rollups.get(d);
      return r ? r.gross - r.discounts - r.refunds + r.shippingRev : 0;
    });
    const f = forecastSum(forecastDaily(hist, 30), 30);
    return {
      answer: `Next-30-day net revenue forecast: ${fmtUsdCompact(f.mean)} (80% band ${fmtUsdCompact(f.lo)} – ${fmtUsdCompact(f.hi)}), from trend × weekday decomposition of the last 120 days. This is an estimate, not a commitment.`,
      citations: [
        { label: "Forecast (30d)", value: fmtUsdCompact(f.mean) },
        { label: "80% band", value: `${fmtUsdCompact(f.lo)} – ${fmtUsdCompact(f.hi)}` },
      ],
      periodUsed: "Next 30 days (forecast)",
    };
  }
  if (/tied up in inventory|inventory.*cash|cash.*inventory/.test(s)) {
    const rows = inventoryRows(store);
    const atCost = rows.reduce((x, r) => x + r.stockValue, 0);
    const retail = rows.reduce((x, r) => x + r.retailValue, 0);
    return {
      answer: `${fmtUsd(atCost)} of cash is currently tied up in inventory (retail value ${fmtUsd(retail)}). Slow-moving and dead stock account for ${fmtUsdCompact(rows.filter((r) => ["Slow moving", "Dead stock", "Overstocked"].includes(r.health)).reduce((x, r) => x + r.stockValue, 0))} of that.`,
      citations: [
        { label: "Inventory at cost", value: fmtUsd(atCost) },
        { label: "Inventory at retail", value: fmtUsd(retail) },
      ],
      periodUsed: `As of ${fmtDate(today)}`,
    };
  }
  if (/marketing|roas|channel|ad spend/.test(s)) {
    const chans = trafficSourceStats(store, last30).filter((c) => c.spend > 0);
    // Owned channels (email) carry only a platform fee, so their MER is a meaningless
    // multiple — reporting it alongside paid channels invites the wrong conclusion.
    const paid = chans.filter((c) => c.source !== "email").sort((a, b) => b.contributionProfit - a.contributionProfit);
    const owned = chans.filter((c) => c.source === "email");
    const best = paid[0];
    const worst = paid[paid.length - 1];
    const ownedText = owned.length
      ? ` Email is an owned channel — ${fmtUsdCompact(owned[0].contributionProfit)} of contribution on only ${fmtUsd(owned[0].spend)} of platform cost — so it is not comparable on MER; it is close to free margin and worth more volume.`
      : "";
    return {
      answer:
        `Paid channel economics (30d, contribution after COGS, fees, fulfillment and spend): ` +
        `${paid.map((c) => `${c.source}: ${c.mer.toFixed(1)}x MER, CAC ${fmtUsd(c.cac)}, contribution ${fmtUsdCompact(c.contributionProfit)}`).join("; ")}. ` +
        (best && worst && best !== worst
          ? `${best.source} earns the next dollar; ${worst.source} is the one to cut${worst.contributionProfit < 0 ? " — it is currently contribution-negative" : ""}.`
          : "") +
        ownedText +
        ` Judge channels on contribution, not platform-reported ROAS.`,
      citations: paid.map((c) => ({ label: c.source, value: `${fmtUsdCompact(c.contributionProfit)} contribution` })),
      periodUsed: periodLabel,
    };
  }
  // Default: business overview
  return {
    answer: `Last 30 days: net revenue ${fmtUsdCompact(t.netRevenue)} (${t.orders.toLocaleString()} orders, AOV ${fmtUsd(t.aov)}), gross profit ${fmtUsdCompact(t.grossProfit)} (${fmtPct(t.grossMarginPct, 0)}), contribution ${fmtUsdCompact(t.contributionProfit)} (${fmtPct(t.contributionMarginPct, 0)}). Available cash ${fmtUsd(cash.availableCash)} of ${fmtUsd(cash.totalCash)} total. Ask about profit, cash, reorders, taxes, expenses, marketing, or forecasts — answers cite the exact metrics used.`,
    citations: [
      { label: "Net revenue (30d)", value: fmtUsdCompact(t.netRevenue) },
      { label: "Contribution profit", value: fmtUsdCompact(t.contributionProfit) },
      { label: "Available cash", value: fmtUsd(cash.availableCash) },
    ],
    periodUsed: periodLabel,
  };
}
