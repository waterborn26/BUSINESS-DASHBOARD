// WaterBorn Workshop — real Shopify data.
//
// Snapshot pulled from the connected Shopify store on 2026-10-28 via the Admin API.
// Totals reconcile to Shopify's own reported figures: 1,012 orders, $64,453.51 gross.
//
// This is a SNAPSHOT, not a live feed. The runtime connector in src/connectors/shopify.ts
// refreshes it from the Admin API; until that runs, these numbers are as of the pull date.
//
// What this data does and does not contain — the app states this honestly rather than
// implying completeness:
//   HAVE: orders, revenue, discounts, refunds, shipping, tax collected, products, channels
//   MISSING: bank balances, expenses, COGS/landed cost, purchase orders, vendor bills,
//            ad spend, site sessions. Those need a bank connection or manual entry, so
//            every metric derived from them is reported as unavailable, never as zero.

import dailyCsv from "./waterborn-daily.csv?raw";
import productsCsv from "./waterborn-products.csv?raw";
import channelsCsv from "./waterborn-channels.csv?raw";
import cogsCsv from "./waterborn-cogs.csv?raw";

export interface RealDay {
  date: string;
  orders: number;
  gross: number;      // cents
  discounts: number;  // cents, positive magnitude
  refunds: number;    // cents, positive magnitude
  net: number;        // cents
  shipping: number;   // cents
  taxes: number;      // cents
  /** Cost of goods, as Shopify itself reports it. 0 where no cost is recorded. */
  cogs: number;
  /**
   * Shopify's own gross profit. It counts ONLY the lines that carry a cost, so
   * `net - cogs` is not the same number and would overstate. Margin must be taken
   * against `costCovered`, not against net revenue.
   */
  grossProfit: number;
  /** The slice of the day's net revenue that has a cost behind it: cogs + grossProfit. */
  costCovered: number;
  /** True where Shopify reported the day directly; false where it came from a month total. */
  cogsExact: boolean;
}

export interface RealProduct {
  name: string;
  gross: number;
  net: number;
  orders: number;
}

export interface RealChannel {
  channel: string;
  orders: number;
  gross: number;
  net: number;
}

/** Dollars string → integer cents, rounding half away from zero. */
function cents(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function rows(csv: string): string[][] {
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .filter((l) => l.trim().length > 0)
    .map((l) => splitCsvLine(l));
}

/** Minimal CSV split that tolerates commas inside product names. */
function splitCsvLine(line: string): string[] {
  // Our product names contain no quoted commas, but they DO contain " - " and "/".
  // Split from the right for the fixed-width numeric tail so names stay intact.
  return line.split(",");
}

interface CogsRow { cogs: number; grossProfit: number; exact: boolean }
const COGS_BY_DAY = new Map<string, CogsRow>(
  rows(cogsCsv).map((r) => [r[0], {
    cogs: cents(r[1]), grossProfit: cents(r[2]), exact: r[3] === "1",
  }]),
);

export const REAL_DAYS: RealDay[] = rows(dailyCsv).map((r) => {
  const c = COGS_BY_DAY.get(r[0]);
  return {
    date: r[0],
    orders: Number(r[1]) || 0,
    gross: cents(r[2]),
    discounts: Math.abs(cents(r[3])),
    refunds: Math.abs(cents(r[4])),
    net: cents(r[5]),
    shipping: cents(r[6]),
    taxes: cents(r[7]),
    cogs: c?.cogs ?? 0,
    grossProfit: c?.grossProfit ?? 0,
    costCovered: (c?.cogs ?? 0) + (c?.grossProfit ?? 0),
    cogsExact: c?.exact ?? false,
  };
});

export const REAL_PRODUCTS: RealProduct[] = rows(productsCsv).map((r) => {
  // Product names may contain commas; the numeric tail is the last three fields.
  const orders = Number(r[r.length - 1]) || 0;
  const net = cents(r[r.length - 2]);
  const gross = cents(r[r.length - 3]);
  const name = r.slice(0, r.length - 3).join(",");
  return { name, gross, net, orders };
});

export const REAL_CHANNELS: RealChannel[] = rows(channelsCsv).map((r) => ({
  channel: r[0],
  orders: Number(r[1]) || 0,
  gross: cents(r[2]),
  net: cents(r[3]),
}));

export const REAL_META = {
  shopName: "WaterBorn Workshop",
  domain: "waterbornworkshop.com",
  currency: "USD",
  snapshotDate: "2026-10-28",
  firstDay: REAL_DAYS[0]?.date ?? "",
  lastDay: "2026-10-27",
  /**
   * Share of net sales with a cost behind them. Shopify has no cost on the rest —
   * chiefly the $17.1k sold under deleted product titles — so any margin shown for a
   * period must be taken against covered revenue, not against all of it.
   */
  costCoveragePct: 75,
} as const;
