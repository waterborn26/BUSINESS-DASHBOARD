// WaterBorn Workshop — real Shopify data.
//
// Snapshot pulled from the connected Shopify store on 2026-08-20 via the Admin API.
// Totals reconcile to Shopify's own reported figures: 811 orders, $51,837.52 gross.
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

export interface RealDay {
  date: string;
  orders: number;
  gross: number;      // cents
  discounts: number;  // cents, positive magnitude
  refunds: number;    // cents, positive magnitude
  net: number;        // cents
  shipping: number;   // cents
  taxes: number;      // cents
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

export const REAL_DAYS: RealDay[] = rows(dailyCsv).map((r) => ({
  date: r[0],
  orders: Number(r[1]) || 0,
  gross: cents(r[2]),
  discounts: Math.abs(cents(r[3])),
  refunds: Math.abs(cents(r[4])),
  net: cents(r[5]),
  shipping: cents(r[6]),
  taxes: cents(r[7]),
}));

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
  snapshotDate: "2026-08-20",
  firstDay: REAL_DAYS[0]?.date ?? "",
  lastDay: "2026-08-20",
} as const;
