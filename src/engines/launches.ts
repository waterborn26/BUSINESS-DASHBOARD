// Launch analytics: performance measurement per launch + pre-launch forecaster.

import type { Store } from "@/data/store";
import type { Launch } from "@/domain/types";
import { addDays, type Period } from "@/lib/dates";
import { ordersInPeriod, periodTotals } from "./analytics";

export interface LaunchStats {
  launch: Launch;
  productNames: string[];
  launchDayRevenue: number;
  first24hOrders: number;
  day7Revenue: number;
  day30Revenue: number;
  unitsSold30: number;
  aov: number;
  newCustomers: number;
  returningCustomers: number;
  grossProfit30: number;
  contribution30: number;
  marketingSpend: number;
  sellThroughPct: number;   // units sold in 30d / units stocked at launch
  preLaunchSessionsLift: number;
}

export function launchStats(store: Store): LaunchStats[] {
  return store.launches.map((launch) => {
    const p30: Period = { start: launch.date, end: addDays(launch.date, 29) };
    const isLaunchOrder = (o: { launchId?: string; items: { productId: string }[] }) =>
      o.items.some((i) => launch.productIds.includes(i.productId));
    const orders30 = ordersInPeriod(store, p30, isLaunchOrder);
    const day0 = orders30.filter((o) => o.date === launch.date);
    const day7 = orders30.filter((o) => o.date <= addDays(launch.date, 6));

    const revOf = (os: typeof orders30) => os.reduce((t, o) => {
      // revenue share of launch products within the order
      const launchGross = o.items.filter((i) => launch.productIds.includes(i.productId))
        .reduce((s, i) => s + i.unitPrice * i.qty, 0);
      const share = o.gross > 0 ? launchGross / o.gross : 0;
      return t + Math.round((o.gross - o.discount + o.shippingRevenue) * share);
    }, 0);
    let units = 0, cogs = 0, fees = 0, fulfillment = 0;
    for (const o of orders30) {
      for (const it of o.items) {
        if (launch.productIds.includes(it.productId)) {
          units += it.qty;
          cogs += it.unitCogs * it.qty;
        }
      }
      fees += Math.round(o.fees * 0.8);
      fulfillment += Math.round(o.fulfillment * 0.8);
    }
    const rev30 = revOf(orders30);
    const grossProfit30 = rev30 - cogs;

    // Stock at launch: lots received on/before launch for the launch products
    let stocked = 0;
    for (const lot of store.lots) {
      const pid = lot.skuId.split("-S")[0];
      if (launch.productIds.includes(pid) && lot.receivedAt <= addDays(launch.date, 2)) stocked += lot.qty;
    }
    // Pre-launch traffic lift: 7d before launch vs 7d before that
    const pre = periodTotals(store, { start: addDays(launch.date, -7), end: addDays(launch.date, -1) });
    const preBase = periodTotals(store, { start: addDays(launch.date, -14), end: addDays(launch.date, -8) });

    return {
      launch,
      productNames: launch.productIds.map((id) => store.productById.get(id)?.name ?? id),
      launchDayRevenue: revOf(day0),
      first24hOrders: day0.length,
      day7Revenue: revOf(day7),
      day30Revenue: rev30,
      unitsSold30: units,
      aov: orders30.length ? Math.round(orders30.reduce((t, o) => t + o.gross - o.discount + o.shippingRevenue, 0) / orders30.length) : 0,
      newCustomers: orders30.filter((o) => o.isFirstOrder).length,
      returningCustomers: orders30.filter((o) => !o.isFirstOrder).length,
      grossProfit30,
      contribution30: grossProfit30 - fees - fulfillment - launch.marketingBudget,
      marketingSpend: launch.marketingBudget,
      sellThroughPct: stocked > 0 ? units / stocked : 0,
      preLaunchSessionsLift: preBase.sessions > 0 ? (pre.sessions - preBase.sessions) / preBase.sessions : 0,
    };
  });
}

// ───────── Launch forecaster ─────────

export interface LaunchForecastInput {
  price: number;         // cents
  unitCost: number;      // cents
  inventory: number;     // units available
  marketingBudget: number;
  expectedSessions: number; // launch-window sessions
  emailListSize: number;
}

export interface LaunchScenario {
  name: "Pessimistic" | "Expected" | "Optimistic";
  units: number;
  revenue: number;
  grossProfit: number;
  contribution: number;
  remainingInventory: number;
  cashGenerated: number;
  stockout: boolean;
}

export function forecastLaunch(store: Store, input: LaunchForecastInput): LaunchScenario[] {
  // Conversion assumptions derived from past launches: launch traffic converts ~1.6× baseline.
  const baseCr = 0.022 * 1.6;
  const emailBuyRate = 0.018; // of list, over launch window
  const make = (name: LaunchScenario["name"], mult: number): LaunchScenario => {
    const demand = Math.round((input.expectedSessions * baseCr + input.emailListSize * emailBuyRate) * mult);
    const units = Math.min(demand, input.inventory);
    const revenue = units * input.price;
    const cogs = units * input.unitCost;
    const fees = Math.round(revenue * 0.029);
    const fulfillment = units * 450;
    const grossProfit = revenue - cogs;
    return {
      name, units, revenue, grossProfit,
      contribution: grossProfit - fees - fulfillment - input.marketingBudget,
      remainingInventory: input.inventory - units,
      cashGenerated: revenue - fees - input.marketingBudget, // inventory already paid for
      stockout: demand > input.inventory,
    };
  };
  return [make("Pessimistic", 0.65), make("Expected", 1.0), make("Optimistic", 1.45)];
}
