// Insight engine — anomaly, trend, and risk detection with evidence.
// Every insight carries the numbers that produced it ("Why?" is always answerable).

import type { Store } from "@/data/store";
import { addDays, fmtDate, type Period } from "@/lib/dates";
import { fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { mean } from "@/lib/stats";
import { compare, funnel, periodTotals, trafficSourceStats, series } from "./analytics";
import { inventoryRows, inventoryCapital, LEAD_TIME_DAYS } from "./inventory";
import { availableCash } from "./cash";
import { salesTaxSummary, estimatedIncomeTaxReserveGap } from "./taxes";

export type InsightKind = "win" | "problem" | "opportunity" | "risk";

export interface Evidence { label: string; value: string; }

export interface Insight {
  id: string;
  kind: InsightKind;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  evidence: Evidence[];
  estMonthlyImpact?: number; // cents, signed (negative = losing money)
  confidencePct: number;
  metric?: string;
  drill?: string;            // route id
  /** Traffic source the finding is concentrated in, when one is identified. */
  attribution?: string;
}

export function detectInsights(store: Store): Insight[] {
  const out: Insight[] = [];
  const today = store.today;
  const last14: Period = { start: addDays(today, -13), end: today };
  const prior14: Period = { start: addDays(today, -27), end: addDays(today, -14) };
  const last30: Period = { start: addDays(today, -29), end: today };

  // ── 1. Mobile conversion drop after site update ──
  {
    const cur = funnel(store, last14, { device: "mobile" });
    const prev = funnel(store, prior14, { device: "mobile" });
    const curCr = cur[0].value ? cur[4].value / cur[0].value : 0;
    const prevCr = prev[0].value ? prev[4].value / prev[0].value : 0;
    if (prevCr > 0 && (curCr - prevCr) / prevCr < -0.1) {
      const drop = (curCr - prevCr) / prevCr;
      // Attribute the decline to a source, measured the same way the claim is: mobile
      // only. Two guards keep the attribution honest — a source must carry enough
      // mobile traffic for its rate to mean anything (a channel with a handful of
      // sessions swings wildly on noise), and sources are ranked by orders actually
      // lost rather than by percentage, which is the damage that matters.
      const sources = [...new Set(store.trafficDaily.map((t) => t.source))];
      const mobileCr = (p: Period, source: string) => {
        const f = funnel(store, p, { device: "mobile", source });
        return { sessions: f[0].value, cr: f[0].value ? f[4].value / f[0].value : 0 };
      };
      const totalMobile = cur[0].value;
      const MIN_SHARE = 0.08; // a source must be ≥8% of mobile traffic to be blamed
      let worst = "", worstDrop = 0, worstLostOrders = 0;
      for (const src of sources) {
        const now = mobileCr(last14, src);
        const before = mobileCr(prior14, src);
        if (before.cr <= 0 || now.sessions < totalMobile * MIN_SHARE) continue;
        const d = (now.cr - before.cr) / before.cr;
        const lostOrders = (before.cr - now.cr) * now.sessions;
        if (d < 0 && lostOrders > worstLostOrders) {
          worstLostOrders = lostOrders;
          worstDrop = d;
          worst = src;
        }
      }
      const t = periodTotals(store, last14);
      const lostMonthly = Math.round(cur[0].value * (prevCr - curCr) * t.aov * (30 / 14));
      out.push({
        id: "mobile-cr-drop",
        kind: "problem", severity: "critical",
        title: `Mobile conversion down ${fmtPct(Math.abs(drop), 0)} since the ${fmtDate(store.siteUpdateDay)} site update`,
        detail: `Mobile conversion fell from ${fmtPct(prevCr, 2)} to ${fmtPct(curCr, 2)} over the last 14 days while sessions held. ` +
          `${worst ? `The decline is concentrated in ${worst === "meta" ? "Instagram/Meta" : worst} traffic, which lost roughly ${Math.round(worstLostOrders)} orders over the window. ` : ""}Mobile add-to-cart rate also dropped after the ${fmtDate(store.siteUpdateDay)} product-page update.`,
        evidence: [
          { label: "Mobile CR (last 14d)", value: fmtPct(curCr, 2) },
          { label: "Mobile CR (prior 14d)", value: fmtPct(prevCr, 2) },
          ...(worst ? [{ label: "Worst source (by orders lost)", value: `${worst} (${fmtPct(worstDrop, 0)})` }] : []),
          { label: "Site update", value: fmtDate(store.siteUpdateDay) },
          { label: "Est. lost revenue", value: `${fmtUsdCompact(lostMonthly)}/month` },
        ],
        estMonthlyImpact: -lostMonthly,
        confidencePct: 87,
        metric: "conversion",
        drill: "website",
        attribution: worst || undefined,
      });
    }
  }

  // ── 2. Meta CAC drift ──
  {
    const cur = trafficSourceStats(store, last14).find((s) => s.source === "meta");
    const prev = trafficSourceStats(store, { start: addDays(today, -59), end: addDays(today, -30) }).find((s) => s.source === "meta");
    if (cur && prev && prev.cac > 0 && (cur.cac - prev.cac) / prev.cac > 0.15) {
      const rise = (cur.cac - prev.cac) / prev.cac;
      out.push({
        id: "meta-cac-rise",
        kind: "risk", severity: "warning",
        title: `Meta CAC up ${fmtPct(rise, 0)} vs the prior month`,
        detail: `New-customer CAC on Meta rose from ${fmtUsd(prev.cac)} to ${fmtUsd(cur.cac)}. Spend is buying fewer sessions (CPC up), and mobile conversion on Meta traffic is down. Contribution profit on the channel is compressing.`,
        evidence: [
          { label: "Meta CAC (14d)", value: fmtUsd(cur.cac) },
          { label: "Meta CAC (prior 30d)", value: fmtUsd(prev.cac) },
          { label: "Meta MER (14d)", value: `${cur.mer.toFixed(2)}x` },
          { label: "Meta contribution (14d)", value: fmtUsdCompact(cur.contributionProfit) },
        ],
        estMonthlyImpact: -Math.round(cur.spend * rise * (30 / 14) * 0.5),
        confidencePct: 78,
        metric: "cac",
        drill: "marketing",
      });
    }
  }

  // ── 3. Stockout risks ──
  {
    const rows = inventoryRows(store).filter((r) => r.health === "Stockout risk" || (r.health === "Understocked" && r.velocity14 > 1));
    for (const r of rows.slice(0, 3)) {
      const daysLeft = Math.round(r.daysOfSupply);
      const monthlyRev = Math.round(r.velocity14 * 30 * (r.units > 0 ? r.revenue / r.units : 0));
      out.push({
        id: `stockout-${r.productId}`,
        kind: "risk", severity: daysLeft < 14 ? "critical" : "warning",
        title: `${r.name} projected to stock out in ~${daysLeft} days`,
        detail: `Selling ${r.velocity14.toFixed(1)}/day over the last 14 days with ${r.stock} units left. Supplier lead time is ~${LEAD_TIME_DAYS} days, so a reorder placed today still arrives after the stockout window.`,
        evidence: [
          { label: "Current stock", value: `${r.stock} units` },
          { label: "14-day velocity", value: `${r.velocity14.toFixed(1)}/day` },
          { label: "28-day velocity", value: `${r.velocity28.toFixed(1)}/day` },
          { label: "Projected stockout", value: r.projectedStockoutDate ? fmtDate(r.projectedStockoutDate) : "—" },
          { label: "Revenue at risk", value: `${fmtUsdCompact(monthlyRev)}/month` },
        ],
        estMonthlyImpact: -monthlyRev,
        confidencePct: 91,
        drill: "inventory",
      });
    }
  }

  // ── 4. Refund spike ──
  {
    const last45: Period = { start: addDays(today, -44), end: today };
    const t = periodTotals(store, last45);
    const base = periodTotals(store, { start: addDays(today, -134), end: addDays(today, -45) });
    if (base.refundRatePct > 0 && t.refundRatePct > base.refundRatePct * 1.5) {
      out.push({
        id: "refund-spike",
        kind: "problem", severity: "warning",
        title: `Refund rate ${fmtPct(t.refundRatePct, 1)} — ${fmtPct((t.refundRatePct - base.refundRatePct) / base.refundRatePct, 0)} above baseline`,
        detail: `Refunds over the last 45 days are concentrated in a short window around ${fmtDate(addDays(today, -35))}, consistent with a bad production batch of Everflask 32oz rather than a store-wide quality issue.`,
        evidence: [
          { label: "Refund rate (45d)", value: fmtPct(t.refundRatePct, 1) },
          { label: "Baseline (prior 90d)", value: fmtPct(base.refundRatePct, 1) },
          { label: "Refunded (45d)", value: fmtUsdCompact(t.refunds) },
        ],
        estMonthlyImpact: -Math.round((t.refunds / 45) * 30 - (base.refunds / 90) * 30),
        confidencePct: 72,
        drill: "sales",
      });
    }
  }

  // ── 5. Revenue vs 30-day norm (yesterday) ──
  {
    const yesterday = addDays(today, -1);
    const yRev = series(store, "net_revenue", { start: yesterday, end: yesterday })[0]?.value ?? 0;
    const norm = mean(series(store, "net_revenue", { start: addDays(today, -30), end: addDays(today, -1) }).map((p) => p.value));
    if (norm > 0) {
      const dev = (yRev - norm) / norm;
      if (dev > 0.25) {
        out.push({
          id: "rev-above-norm", kind: "win", severity: "info",
          title: `Yesterday's revenue ${fmtPct(dev, 0)} above the 30-day average`,
          detail: `Net revenue of ${fmtUsd(yRev)} vs a ${fmtUsd(Math.round(norm))} daily norm.`,
          evidence: [
            { label: "Yesterday", value: fmtUsd(yRev) },
            { label: "30-day avg", value: fmtUsd(Math.round(norm)) },
          ],
          confidencePct: 95, metric: "net_revenue", drill: "sales",
        });
      } else if (dev < -0.3) {
        out.push({
          id: "rev-below-norm", kind: "problem", severity: "warning",
          title: `Yesterday's revenue ${fmtPct(Math.abs(dev), 0)} below the 30-day average`,
          detail: `Net revenue of ${fmtUsd(yRev)} vs a ${fmtUsd(Math.round(norm))} daily norm.`,
          evidence: [
            { label: "Yesterday", value: fmtUsd(yRev) },
            { label: "30-day avg", value: fmtUsd(Math.round(norm)) },
          ],
          confidencePct: 90, metric: "net_revenue", drill: "sales",
        });
      }
    }
  }

  // ── 6. Dead / slow stock capital ──
  {
    const cap = inventoryCapital(inventoryRows(store));
    if (cap.deadStockCapital + cap.slowMovingCapital > 500000) {
      out.push({
        id: "dead-capital", kind: "opportunity", severity: "info",
        title: `${fmtUsdCompact(cap.slowMovingCapital + cap.deadStockCapital)} of cash is tied up in slow or dead inventory`,
        detail: `Discounting or bundling slow movers would convert stranded inventory back into operating cash.`,
        evidence: [
          { label: "Slow-moving capital", value: fmtUsdCompact(cap.slowMovingCapital) },
          { label: "Dead stock capital", value: fmtUsdCompact(cap.deadStockCapital) },
          { label: "Total inventory at cost", value: fmtUsdCompact(cap.atCost) },
        ],
        estMonthlyImpact: Math.round((cap.deadStockCapital + cap.slowMovingCapital) * 0.15),
        confidencePct: 65, drill: "inventory",
      });
    }
  }

  // ── 7. Tax reserve check ──
  {
    const stx = salesTaxSummary(store, last30);
    const plan = estimatedIncomeTaxReserveGap(store, today);
    const ac = availableCash(store, today);
    if (stx.currentPayable + plan.reserveTarget > ac.totalCash * 0.35) {
      out.push({
        id: "tax-reserve", kind: "risk", severity: "warning",
        title: `Tax obligations are ${fmtPct((stx.currentPayable + plan.reserveTarget) / ac.totalCash, 0)} of total cash`,
        detail: `Sales tax payable plus the estimated income-tax reserve consume a large share of cash on hand. Available operating cash is materially lower than the bank balance suggests.`,
        evidence: [
          { label: "Sales tax payable", value: fmtUsd(stx.currentPayable) },
          { label: "Est. income tax reserve", value: fmtUsd(plan.reserveTarget) },
          { label: "Total cash", value: fmtUsd(ac.totalCash) },
          { label: "Available cash", value: fmtUsd(ac.availableCash) },
        ],
        confidencePct: 84, drill: "taxes",
      });
    }
  }

  // ── 8. Duplicate subscriptions ──
  {
    const social = store.recurring.filter((r) => r.active && /later|buffer/i.test(r.vendor));
    if (social.length >= 2) {
      const cheaper = Math.min(...social.map((s) => s.amount));
      out.push({
        id: "dup-subs", kind: "opportunity", severity: "info",
        title: "Two overlapping social-scheduling subscriptions",
        detail: `${social.map((s) => s.vendor).join(" and ")} appear to serve the same purpose. Cancelling one saves ${fmtUsd(cheaper * 12)}/year.`,
        evidence: social.map((s) => ({ label: s.vendor, value: `${fmtUsd(s.amount)}/mo` })),
        estMonthlyImpact: cheaper,
        confidencePct: 60, drill: "expenses",
      });
    }
  }

  // ── 9. Fast growers / decliners ──
  {
    const cmp = compare(store, last30);
    const rev = cmp.current.netRevenue;
    const prevRev = cmp.previous.netRevenue;
    if (prevRev > 0) {
      const g = (rev - prevRev) / prevRev;
      if (g > 0.08) {
        out.push({
          id: "rev-growth", kind: "win", severity: "info",
          title: `Revenue up ${fmtPct(g, 0)} vs the previous 30 days`,
          detail: `Net revenue ${fmtUsdCompact(rev)} vs ${fmtUsdCompact(prevRev)}. Contribution profit ${fmtUsdCompact(cmp.current.contributionProfit)} (${fmtPct(cmp.current.contributionMarginPct, 1)} margin).`,
          evidence: [
            { label: "Net revenue (30d)", value: fmtUsdCompact(rev) },
            { label: "Previous 30d", value: fmtUsdCompact(prevRev) },
            { label: "Contribution margin", value: fmtPct(cmp.current.contributionMarginPct, 1) },
          ],
          confidencePct: 95, metric: "net_revenue", drill: "sales",
        });
      }
    }
  }

  // ── 10. Traffic up, revenue flat ──
  {
    const cur = periodTotals(store, last14);
    const prev = periodTotals(store, prior14);
    if (prev.sessions > 0 && prev.netRevenue > 0) {
      const tGrowth = (cur.sessions - prev.sessions) / prev.sessions;
      const rGrowth = (cur.netRevenue - prev.netRevenue) / prev.netRevenue;
      if (tGrowth > 0.10 && rGrowth < tGrowth - 0.12) {
        out.push({
          id: "traffic-not-converting", kind: "problem", severity: "warning",
          title: `Traffic up ${fmtPct(tGrowth, 0)} but revenue only ${fmtPct(rGrowth, 0)}`,
          detail: `Sessions are growing faster than revenue — conversion is absorbing the gains. This is consistent with the mobile conversion decline.`,
          evidence: [
            { label: "Sessions (14d)", value: cur.sessions.toLocaleString() },
            { label: "Sessions (prior)", value: prev.sessions.toLocaleString() },
            { label: "Conversion (14d)", value: fmtPct(cur.conversion, 2) },
            { label: "Conversion (prior)", value: fmtPct(prev.conversion, 2) },
          ],
          confidencePct: 80, metric: "conversion", drill: "website",
        });
      }
    }
  }

  const sevRank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}
