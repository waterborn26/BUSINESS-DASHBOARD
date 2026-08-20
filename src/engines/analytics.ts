// Analytics engine — deterministic metric computation over the normalized store.
// KPI values, comparisons, time series, funnels, product/channel/expense breakdowns.
// Contribution profit = net revenue − COGS − processing fees − fulfillment − ad spend.

import type { Store } from "@/data/store";
import type { Order, RollupDay } from "@/domain/types";
import {
  addDays, dateRange, monthKey, previousPeriod, yearAgoPeriod, type Period,
} from "@/lib/dates";
import { pnl } from "./pnl";

export interface PeriodTotals {
  gross: number;
  discounts: number;
  refunds: number;
  shippingRev: number;
  netRevenue: number;       // gross − discounts − refunds + shipping
  taxCollected: number;
  fees: number;
  cogs: number;
  fulfillment: number;
  adSpend: number;
  orders: number;
  units: number;
  sessions: number;
  newCustomers: number;
  aov: number;
  itemsPerOrder: number;
  conversion: number;
  grossProfit: number;      // netRevenue − cogs
  grossMarginPct: number;
  contributionProfit: number;
  contributionMarginPct: number;
  refundRatePct: number;    // refunds / gross
  discountRatePct: number;
  mer: number;              // netRevenue / adSpend
  blendedCac: number;       // adSpend / newCustomers (cents)
  revenuePerSession: number;
  returningPct: number;
}

const zeroDay: RollupDay = {
  date: "", orders: 0, units: 0, gross: 0, discounts: 0, refunds: 0, shippingRev: 0,
  taxCollected: 0, fees: 0, cogs: 0, fulfillment: 0, adSpend: 0, sessions: 0, newCustomers: 0,
};

export function periodTotals(store: Store, p: Period): PeriodTotals {
  const acc = { ...zeroDay };
  for (const d of dateRange(p.start, p.end)) {
    const r = store.rollups.get(d);
    if (!r) continue;
    acc.orders += r.orders; acc.units += r.units; acc.gross += r.gross;
    acc.discounts += r.discounts; acc.refunds += r.refunds; acc.shippingRev += r.shippingRev;
    acc.taxCollected += r.taxCollected; acc.fees += r.fees; acc.cogs += r.cogs;
    acc.fulfillment += r.fulfillment; acc.adSpend += r.adSpend;
    acc.sessions += r.sessions; acc.newCustomers += r.newCustomers;
  }
  const netRevenue = acc.gross - acc.discounts - acc.refunds + acc.shippingRev;
  const grossProfit = netRevenue - acc.cogs;
  const contributionProfit = grossProfit - acc.fees - acc.fulfillment - acc.adSpend;
  return {
    ...acc,
    netRevenue,
    aov: acc.orders ? Math.round(netRevenue / acc.orders) : 0,
    itemsPerOrder: acc.orders ? acc.units / acc.orders : 0,
    conversion: acc.sessions ? acc.orders / acc.sessions : 0,
    grossProfit,
    grossMarginPct: netRevenue ? grossProfit / netRevenue : 0,
    contributionProfit,
    contributionMarginPct: netRevenue ? contributionProfit / netRevenue : 0,
    refundRatePct: acc.gross ? acc.refunds / acc.gross : 0,
    discountRatePct: acc.gross ? acc.discounts / acc.gross : 0,
    mer: acc.adSpend ? netRevenue / acc.adSpend : 0,
    blendedCac: acc.newCustomers ? Math.round(acc.adSpend / acc.newCustomers) : 0,
    revenuePerSession: acc.sessions ? Math.round(netRevenue / acc.sessions) : 0,
    returningPct: acc.orders ? 1 - acc.newCustomers / acc.orders : 0,
  };
}

export interface Comparison {
  current: PeriodTotals;
  previous: PeriodTotals;
  yearAgo: PeriodTotals;
}

export function compare(store: Store, p: Period): Comparison {
  return {
    current: periodTotals(store, p),
    previous: periodTotals(store, previousPeriod(p)),
    yearAgo: periodTotals(store, yearAgoPeriod(p)),
  };
}

// ───────── Time series ─────────

export type MetricId =
  | "net_revenue" | "gross_revenue" | "orders" | "units" | "aov" | "sessions" | "conversion"
  | "gross_profit" | "contribution_profit" | "ad_spend" | "mer" | "cac" | "refunds"
  | "discounts" | "new_customers" | "fees" | "cogs";

export function dayMetric(r: RollupDay, id: MetricId): number {
  const net = r.gross - r.discounts - r.refunds + r.shippingRev;
  switch (id) {
    case "net_revenue": return net;
    case "gross_revenue": return r.gross;
    case "orders": return r.orders;
    case "units": return r.units;
    case "aov": return r.orders ? net / r.orders : 0;
    case "sessions": return r.sessions;
    case "conversion": return r.sessions ? r.orders / r.sessions : 0;
    case "gross_profit": return net - r.cogs;
    case "contribution_profit": return net - r.cogs - r.fees - r.fulfillment - r.adSpend;
    case "ad_spend": return r.adSpend;
    case "mer": return r.adSpend ? net / r.adSpend : 0;
    case "cac": return r.newCustomers ? r.adSpend / r.newCustomers : 0;
    case "refunds": return r.refunds;
    case "discounts": return r.discounts;
    case "new_customers": return r.newCustomers;
    case "fees": return r.fees;
    case "cogs": return r.cogs;
  }
}

export interface SeriesPoint { date: string; value: number; }

export function series(store: Store, metric: MetricId, p: Period): SeriesPoint[] {
  return dateRange(p.start, p.end).map((d) => ({
    date: d,
    value: dayMetric(store.rollups.get(d) ?? { ...zeroDay, date: d }, metric),
  }));
}

/** Weekly or monthly aggregation of a daily series (sums; ratio metrics recomputed by caller). */
export function bucketSeries(points: SeriesPoint[], grain: "day" | "week" | "month"): SeriesPoint[] {
  if (grain === "day") return points;
  const buckets = new Map<string, number>();
  const keys: string[] = [];
  for (const pt of points) {
    const key = grain === "month" ? monthKey(pt.date) : weekKey(pt.date);
    if (!buckets.has(key)) keys.push(key);
    buckets.set(key, (buckets.get(key) ?? 0) + pt.value);
  }
  return keys.map((k) => ({ date: k, value: buckets.get(k)! }));
}

function weekKey(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - day); // week starts Sunday
  return dt.toISOString().slice(0, 10);
}

// ───────── Orders in period (filtered) ─────────

export function ordersInPeriod(store: Store, p: Period, pred?: (o: Order) => boolean): Order[] {
  const out: Order[] = [];
  for (const d of dateRange(p.start, p.end)) {
    for (const o of store.ordersByDate.get(d) ?? []) {
      if (!pred || pred(o)) out.push(o);
    }
  }
  return out;
}

// ───────── Product stats ─────────

export interface ProductStats {
  productId: string;
  name: string;
  collection: string;
  revenue: number;          // net of discount share, incl. nothing else
  units: number;
  refunds: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  contributionProfit: number;   // after allocated fees, fulfillment, ad spend
  contributionMarginPct: number;
  refundRatePct: number;
  orders: number;
  aovPosition: number;      // avg order value of orders containing this product
  stock: number;
  stockValue: number;       // at landed cost
  retailValue: number;
  velocity28: number;       // units/day
  velocity14: number;
  daysOfSupply: number;
  trendPct: number;         // last 28d units vs prior 28d
}

export function productStats(store: Store, p: Period): ProductStats[] {
  const map = new Map<string, ProductStats>();
  for (const prod of store.products) {
    map.set(prod.id, {
      productId: prod.id, name: prod.name, collection: prod.collection,
      revenue: 0, units: 0, refunds: 0, cogs: 0, grossProfit: 0, grossMarginPct: 0,
      contributionProfit: 0, contributionMarginPct: 0, refundRatePct: 0, orders: 0,
      aovPosition: 0, stock: 0, stockValue: 0, retailValue: 0,
      velocity28: 0, velocity14: 0, daysOfSupply: 0, trendPct: 0,
    });
  }
  const totals = periodTotals(store, p);
  // Allocation rates: fees/fulfillment/ads spread over product revenue
  const allocRate = totals.gross > 0 ? (totals.fees + totals.fulfillment + totals.adSpend) / totals.gross : 0;

  const orderAovSum = new Map<string, number>();
  for (const o of ordersInPeriod(store, p)) {
    const orderNet = o.gross - o.discount + o.shippingRevenue;
    const seen = new Set<string>();
    for (const it of o.items) {
      const s = map.get(it.productId);
      if (!s) continue;
      const itemGross = it.unitPrice * it.qty;
      const discountShare = o.gross > 0 ? Math.round((o.discount * itemGross) / o.gross) : 0;
      const refundShare = o.refund > 0 && o.gross > 0 ? Math.round((o.refund * itemGross) / (o.gross - o.discount)) : 0;
      s.revenue += itemGross - discountShare - refundShare;
      s.units += it.qty;
      s.refunds += refundShare;
      s.cogs += it.unitCogs * it.qty;
      s.contributionProfit -= Math.round(itemGross * allocRate);
      if (!seen.has(it.productId)) {
        s.orders += 1;
        orderAovSum.set(it.productId, (orderAovSum.get(it.productId) ?? 0) + orderNet);
        seen.add(it.productId);
      }
    }
  }
  // Inventory + velocity
  const stockBySku = new Map<string, { qty: number; value: number }>();
  for (const lot of store.lots) {
    const rec = stockBySku.get(lot.skuId) ?? { qty: 0, value: 0 };
    rec.qty += lot.remainingQty;
    rec.value += lot.remainingQty * lot.unitLanded;
    stockBySku.set(lot.skuId, rec);
  }
  const last28: Period = { start: addDays(store.today, -27), end: store.today };
  const prior28: Period = { start: addDays(store.today, -55), end: addDays(store.today, -28) };
  const last14: Period = { start: addDays(store.today, -13), end: store.today };
  const unitsIn = (pp: Period) => {
    const m = new Map<string, number>();
    for (const o of ordersInPeriod(store, pp)) for (const it of o.items) m.set(it.productId, (m.get(it.productId) ?? 0) + it.qty);
    return m;
  };
  const u28 = unitsIn(last28), uPrior = unitsIn(prior28), u14 = unitsIn(last14);

  for (const s of map.values()) {
    s.grossProfit = s.revenue - s.cogs;
    s.grossMarginPct = s.revenue ? s.grossProfit / s.revenue : 0;
    s.contributionProfit += s.grossProfit;
    s.contributionMarginPct = s.revenue ? s.contributionProfit / s.revenue : 0;
    s.refundRatePct = s.revenue + s.refunds > 0 ? s.refunds / (s.revenue + s.refunds) : 0;
    s.aovPosition = s.orders ? Math.round((orderAovSum.get(s.productId) ?? 0) / s.orders) : 0;
    for (const sku of store.skusByProduct.get(s.productId) ?? []) {
      const st = stockBySku.get(sku.id);
      if (st) { s.stock += st.qty; s.stockValue += st.value; s.retailValue += st.qty * sku.price; }
    }
    s.velocity28 = (u28.get(s.productId) ?? 0) / 28;
    s.velocity14 = (u14.get(s.productId) ?? 0) / 14;
    const blended = s.velocity14 * 0.6 + s.velocity28 * 0.4;
    s.daysOfSupply = blended > 0.01 ? s.stock / blended : 999;
    const prior = uPrior.get(s.productId) ?? 0;
    s.trendPct = prior > 0 ? ((u28.get(s.productId) ?? 0) - prior) / prior : 0;
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

// ───────── Traffic / funnel ─────────

export interface FunnelStep { label: string; value: number; }

export function funnel(store: Store, p: Period, filter?: { device?: string; source?: string }): FunnelStep[] {
  let sessions = 0, pv = 0, atc = 0, co = 0, pur = 0;
  for (const t of store.trafficDaily) {
    if (t.date < p.start || t.date > p.end) continue;
    if (filter?.device && t.device !== filter.device) continue;
    if (filter?.source && t.source !== filter.source) continue;
    sessions += t.sessions; pv += t.productViews; atc += t.addToCarts; co += t.checkouts; pur += t.purchases;
  }
  return [
    { label: "Visitors", value: sessions },
    { label: "Product view", value: pv },
    { label: "Add to cart", value: atc },
    { label: "Checkout", value: co },
    { label: "Purchase", value: pur },
  ];
}

export interface SourceStats {
  source: string;
  sessions: number;
  orders: number;
  conversion: number;
  revenue: number;
  spend: number;
  cac: number;             // cents per new customer
  newCustomers: number;
  mer: number;
  contributionProfit: number;
}

export function trafficSourceStats(store: Store, p: Period): SourceStats[] {
  const bySource = new Map<string, SourceStats>();
  const get = (s: string) => {
    let rec = bySource.get(s);
    if (!rec) {
      rec = { source: s, sessions: 0, orders: 0, conversion: 0, revenue: 0, spend: 0, cac: 0, newCustomers: 0, mer: 0, contributionProfit: 0 };
      bySource.set(s, rec);
    }
    return rec;
  };
  for (const t of store.trafficDaily) {
    if (t.date < p.start || t.date > p.end) continue;
    get(t.source).sessions += t.sessions;
  }
  const totals = periodTotals(store, p);
  const varRate = totals.gross > 0 ? (totals.fees + totals.fulfillment) / totals.gross : 0;
  for (const o of ordersInPeriod(store, p)) {
    const rec = get(o.trafficSource);
    rec.orders += 1;
    const net = o.gross - o.discount - o.refund + o.shippingRevenue;
    rec.revenue += net;
    rec.contributionProfit += net - o.cogs - Math.round(o.gross * varRate);
    if (o.isFirstOrder) rec.newCustomers += 1;
  }
  for (const sp of store.spendDaily) {
    if (sp.date < p.start || sp.date > p.end) continue;
    const src = sp.channel === "email" ? "email" : sp.channel;
    get(src).spend += sp.spend;
  }
  for (const rec of bySource.values()) {
    rec.conversion = rec.sessions ? rec.orders / rec.sessions : 0;
    rec.cac = rec.newCustomers ? Math.round(rec.spend / rec.newCustomers) : 0;
    rec.mer = rec.spend ? rec.revenue / rec.spend : 0;
    rec.contributionProfit -= rec.spend;
  }
  return [...bySource.values()].sort((a, b) => b.revenue - a.revenue);
}

// ───────── Expenses ─────────

export interface ExpenseBreakdownRow {
  category: string;
  label: string;
  amount: number;
  previous: number;
  changePct: number | null;
}

export function expenseBreakdown(store: Store, p: Period): ExpenseBreakdownRow[] {
  const cur = pnl(store, p);
  const prev = pnl(store, previousPeriod(p));
  const prevMap = new Map(prev.opex.map((l) => [l.accountId, l.amount]));
  return cur.opex.map((l) => {
    const pv = prevMap.get(l.accountId) ?? 0;
    return {
      category: l.accountId, label: l.label, amount: l.amount, previous: pv,
      changePct: pv > 0 ? (l.amount - pv) / pv : null,
    };
  });
}

// ───────── Hourly revenue (today drill) ─────────

export function hourlyRevenue(store: Store, date: string): { hour: number; revenue: number }[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0 }));
  for (const o of store.ordersByDate.get(date) ?? []) {
    buckets[o.hour].revenue += o.gross - o.discount + o.shippingRevenue;
  }
  return buckets;
}
