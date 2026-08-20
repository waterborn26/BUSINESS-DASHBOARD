// Inventory intelligence: velocity, days of supply, health classification,
// stockout projection, and cash-aware reorder recommendations.

import type { Store } from "@/data/store";
import { addDays } from "@/lib/dates";
import { productStats, type ProductStats } from "./analytics";
import { availableCash } from "./cash";

export type InventoryHealth = "Healthy" | "Overstocked" | "Understocked" | "Slow moving" | "Dead stock" | "Stockout risk";

export interface InventoryRow extends ProductStats {
  health: InventoryHealth;
  projectedStockoutDate: string | null;
  reorderPoint: number;          // units
  recommendedReorderQty: number; // demand-based
  cashSafeReorderQty: number;    // constrained by cash position
  reorderCost: number;           // cents for recommended qty
  landedUnitCost: number;
}

/** Default supplier lead time, in days. Per-vendor overrides come with the PO connector. */
export const LEAD_TIME_DAYS = 35;

/** Days of cover a reorder targets after the goods land. */
export const REORDER_COVER_DAYS = 55;

/** Available cash kept untouched by the cash-aware reorder planner. */
export const CASH_FLOOR = 2_000_000;

export function inventoryRows(store: Store): InventoryRow[] {
  const stats = productStats(store, { start: addDays(store.today, -89), end: store.today });
  const cashState = availableCash(store, store.today);
  // Budget available for inventory: keep a floor of available cash untouched.
  const inventoryBudget = Math.max(0, cashState.availableCash - CASH_FLOOR);

  const rows: InventoryRow[] = stats.map((s) => {
    const blendedVelocity = s.velocity14 * 0.6 + s.velocity28 * 0.4;
    const landedUnitCost = s.units > 0 ? Math.round(s.cogs / s.units) : (s.stock > 0 ? Math.round(s.stockValue / s.stock) : 0);
    const dos = s.daysOfSupply;
    // Classify by days of supply, not raw velocity: "how long would this stock last"
    // is what actually distinguishes dead capital from a healthy SKU, at any scale.
    let health: InventoryHealth;
    if (s.stock === 0) {
      // Out of stock: a risk if it still sells, otherwise simply discontinued.
      health = blendedVelocity > 0.05 ? "Stockout risk" : "Healthy";
    } else if (dos > 365) {
      health = "Dead stock";       // over a year of supply on hand
    } else if (dos > 180) {
      health = "Slow moving";      // 6–12 months of supply
    } else if (dos < LEAD_TIME_DAYS * 0.5) {
      health = "Stockout risk";    // will run out well before a reorder could land
    } else if (dos < LEAD_TIME_DAYS) {
      health = "Understocked";
    } else if (dos > 120) {
      health = "Overstocked";
    } else {
      health = "Healthy";
    }

    const projectedStockoutDate = blendedVelocity > 0.05 && dos < 365
      ? addDays(store.today, Math.round(dos)) : null;
    const reorderPoint = Math.ceil(blendedVelocity * (LEAD_TIME_DAYS + 14));
    // Demand-based reorder: cover REORDER_COVER_DAYS from receipt, less what's on order
    const onOrder = store.purchaseOrders
      .filter((po) => (po.status === "deposit_paid" || po.status === "in_transit"))
      .reduce((t, po) => t + po.items.filter((i) => i.skuId.startsWith(s.productId + "-")).reduce((q, i) => q + i.qty, 0), 0);
    const targetUnits = Math.ceil(blendedVelocity * (REORDER_COVER_DAYS + LEAD_TIME_DAYS));
    const recommendedReorderQty = health === "Dead stock" || health === "Slow moving"
      ? 0 : Math.max(0, targetUnits - s.stock - onOrder);
    return {
      ...s, health, projectedStockoutDate, reorderPoint,
      recommendedReorderQty, cashSafeReorderQty: recommendedReorderQty,
      reorderCost: recommendedReorderQty * landedUnitCost, landedUnitCost,
    };
  });

  // Cash-aware pass: allocate the inventory budget to the highest-urgency reorders first.
  const need = rows.filter((r) => r.recommendedReorderQty > 0)
    .sort((a, b) => a.daysOfSupply - b.daysOfSupply);
  let remaining = inventoryBudget;
  for (const r of need) {
    if (r.reorderCost <= remaining) {
      remaining -= r.reorderCost;
    } else {
      const affordable = r.landedUnitCost > 0 ? Math.floor(remaining / r.landedUnitCost) : 0;
      r.cashSafeReorderQty = Math.min(r.recommendedReorderQty, affordable);
      remaining -= r.cashSafeReorderQty * r.landedUnitCost;
    }
  }
  return rows;
}

export interface InventoryCapital {
  atCost: number;
  atRetail: number;
  slowMovingCapital: number;
  deadStockCapital: number;
  unitsTotal: number;
}

export function inventoryCapital(rows: InventoryRow[]): InventoryCapital {
  let atCost = 0, atRetail = 0, slow = 0, dead = 0, units = 0;
  for (const r of rows) {
    atCost += r.stockValue; atRetail += r.retailValue; units += r.stock;
    if (r.health === "Slow moving" || r.health === "Overstocked") slow += r.stockValue;
    if (r.health === "Dead stock") dead += r.stockValue;
  }
  return { atCost, atRetail, slowMovingCapital: slow, deadStockCapital: dead, unitsTotal: units };
}
