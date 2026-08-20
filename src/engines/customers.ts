// Customer intelligence: segments, cohorts, LTV, repeat behavior.

import type { Store } from "@/data/store";
import type { Customer } from "@/domain/types";
import { addDays, daysBetween, monthKey, type Period } from "@/lib/dates";
import { periodTotals, ordersInPeriod } from "./analytics";

export interface CustomerKpis {
  total: number;
  newInPeriod: number;
  returningInPeriod: number;
  repeatRatePct: number;         // customers with 2+ orders / all customers
  avgOrdersPerCustomer: number;
  avgLtv: number;                // cents
  blendedCac: number;
  ltvToCac: number;
  medianDaysBetweenOrders: number;
}

export function customerKpis(store: Store, p: Period): CustomerKpis {
  const totals = periodTotals(store, p);
  let repeaters = 0, ltvSum = 0;
  for (const c of store.customers) {
    if (c.orderCount >= 2) repeaters++;
    ltvSum += c.totalSpent;
  }
  const returning = ordersInPeriod(store, p, (o) => !o.isFirstOrder).length;
  // median days between orders sampled from repeat customers
  const gaps: number[] = [];
  for (let i = 0; i < store.customers.length; i += 7) {
    const c = store.customers[i];
    if (c.orderCount >= 2) gaps.push(daysBetween(c.firstOrderAt, c.lastOrderAt) / (c.orderCount - 1));
  }
  gaps.sort((a, b) => a - b);
  return {
    total: store.customers.length,
    newInPeriod: totals.newCustomers,
    returningInPeriod: returning,
    repeatRatePct: store.customers.length ? repeaters / store.customers.length : 0,
    avgOrdersPerCustomer: store.customers.length
      ? store.customers.reduce((t, c) => t + c.orderCount, 0) / store.customers.length : 0,
    avgLtv: store.customers.length ? Math.round(ltvSum / store.customers.length) : 0,
    blendedCac: totals.blendedCac,
    ltvToCac: totals.blendedCac > 0 && store.customers.length
      ? ltvSum / store.customers.length / totals.blendedCac : 0,
    medianDaysBetweenOrders: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0,
  };
}

// ───────── Cohorts: acquisition month × value at 60 days ─────────

export interface CohortRow {
  cohort: string;          // yyyy-mm
  customers: number;
  repeat60Pct: number;     // % who ordered again within 60 days
  value60: number;         // avg spend within 60 days (cents)
  channelTop: string;
}

export function cohorts(store: Store): CohortRow[] {
  interface Acc { customers: number; repeat60: number; value60: number; channels: Map<string, number>; }
  const byMonth = new Map<string, Acc>();
  // Precompute per-customer spend within 60 days of first order
  const spend60 = new Map<string, number>();
  const repeat60 = new Set<string>();
  for (const o of store.orders) {
    const c = store.customers[Number(o.customerId.slice(2)) - 1];
    if (!c) continue;
    if (daysBetween(c.firstOrderAt, o.date) <= 60) {
      spend60.set(c.id, (spend60.get(c.id) ?? 0) + o.gross - o.discount - o.refund + o.shippingRevenue);
      if (!o.isFirstOrder) repeat60.add(c.id);
    }
  }
  for (const c of store.customers) {
    const mk = monthKey(c.createdAt);
    let acc = byMonth.get(mk);
    if (!acc) { acc = { customers: 0, repeat60: 0, value60: 0, channels: new Map() }; byMonth.set(mk, acc); }
    acc.customers++;
    if (repeat60.has(c.id)) acc.repeat60++;
    acc.value60 += spend60.get(c.id) ?? 0;
    acc.channels.set(c.acquisitionChannel, (acc.channels.get(c.acquisitionChannel) ?? 0) + 1);
  }
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cohort, a]) => ({
    cohort,
    customers: a.customers,
    repeat60Pct: a.customers ? a.repeat60 / a.customers : 0,
    value60: a.customers ? Math.round(a.value60 / a.customers) : 0,
    channelTop: [...a.channels.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "—",
  }));
}

// ───────── Segments ─────────

export interface Segment {
  id: string;
  label: string;
  count: number;
  totalValue: number;
  description: string;
}

export function segments(store: Store): Segment[] {
  const today = store.today;
  const defs: { id: string; label: string; description: string; pred: (c: Customer) => boolean }[] = [
    { id: "vip", label: "VIP", description: "4+ orders or $500+ lifetime spend", pred: (c) => c.orderCount >= 4 || c.totalSpent >= 50000 },
    { id: "high", label: "High value", description: "$250+ lifetime spend", pred: (c) => c.totalSpent >= 25000 && c.totalSpent < 50000 },
    { id: "repeat", label: "Repeat customers", description: "2–3 orders", pred: (c) => c.orderCount >= 2 && c.orderCount <= 3 },
    { id: "first", label: "First-time buyers", description: "1 order, acquired in last 60 days", pred: (c) => c.orderCount === 1 && daysBetween(c.createdAt, today) <= 60 },
    { id: "likely", label: "Likely to repurchase", description: "2+ orders, active in last 45 days", pred: (c) => c.orderCount >= 2 && daysBetween(c.lastOrderAt, today) <= 45 },
    { id: "dormant", label: "Dormant", description: "No order in 120+ days", pred: (c) => daysBetween(c.lastOrderAt, today) > 120 },
    { id: "atrisk", label: "At risk", description: "Repeat customer, quiet 60–120 days", pred: (c) => c.orderCount >= 2 && daysBetween(c.lastOrderAt, today) > 60 && daysBetween(c.lastOrderAt, today) <= 120 },
    { id: "recent", label: "Recently acquired", description: "First order in last 30 days", pred: (c) => daysBetween(c.createdAt, today) <= 30 },
  ];
  return defs.map((d) => {
    let count = 0, value = 0;
    for (const c of store.customers) {
      if (d.pred(c)) { count++; value += c.totalSpent; }
    }
    return { id: d.id, label: d.label, description: d.description, count, totalValue: value };
  });
}

/** Channel LTV comparison used by cohort insights. */
export function channelLtv(store: Store): { channel: string; customers: number; avgLtv: number; repeatPct: number }[] {
  const m = new Map<string, { n: number; ltv: number; rep: number }>();
  for (const c of store.customers) {
    let rec = m.get(c.acquisitionChannel);
    if (!rec) { rec = { n: 0, ltv: 0, rep: 0 }; m.set(c.acquisitionChannel, rec); }
    rec.n++; rec.ltv += c.totalSpent; if (c.orderCount >= 2) rec.rep++;
  }
  return [...m.entries()].map(([channel, r]) => ({
    channel, customers: r.n, avgLtv: r.n ? Math.round(r.ltv / r.n) : 0, repeatPct: r.n ? r.rep / r.n : 0,
  })).sort((a, b) => b.avgLtv - a.avgLtv);
}
