// P&L engine — a structured income statement computed entirely from the ledger.

import type { Store } from "@/data/store";
import { COA } from "@/domain/coa";
import { accountActivity } from "./ledger";
import type { Period } from "@/lib/dates";

export interface PnlLine {
  accountId: string;
  label: string;
  amount: number;
}

export interface PnlStatement {
  period: Period;
  revenue: PnlLine[];
  revenueTotal: number;
  contra: PnlLine[];        // discounts, refunds (positive numbers, subtract)
  contraTotal: number;
  /** Shopify's "Net sales": product revenue less discounts and refunds, no shipping. */
  netRevenue: number;
  /** Shipping charged to customers. Revenue of the business, but not part of net sales. */
  shippingRevenue: number;
  /** Net sales + shipping. The base every margin below is taken against. */
  totalRevenue: number;
  cogs: PnlLine[];
  cogsTotal: number;
  grossProfit: number;
  grossMarginPct: number;   // of total revenue
  opex: PnlLine[];
  opexTotal: number;
  operatingProfit: number;
  operatingMarginPct: number;
}

export function pnl(store: Store, period: Period): PnlStatement {
  const lines = (type: string): PnlLine[] =>
    COA.filter((a) => a.type === type)
      .map((a) => ({ accountId: a.id, label: a.name, amount: accountActivity(store, a.id, period) }))
      .filter((l) => l.amount !== 0)
      .sort((a, b) => b.amount - a.amount);

  const revenue = lines("revenue");
  const contra = lines("contra_revenue");
  const cogs = lines("cogs");
  const opex = lines("expense");
  // Shipping is revenue of the business, but Shopify reports it outside "Net sales".
  // Keeping it in net revenue made every figure here disagree with the Shopify
  // dashboard by whatever shipping was charged, so it is split out and named.
  const shippingRevenue = revenue
    .filter((l) => l.accountId === "rev_shipping")
    .reduce((t, l) => t + l.amount, 0);
  const revenueTotal = revenue.reduce((t, l) => t + l.amount, 0) - shippingRevenue;
  const contraTotal = contra.reduce((t, l) => t + l.amount, 0);
  const netRevenue = revenueTotal - contraTotal;
  const totalRevenue = netRevenue + shippingRevenue;
  const cogsTotal = cogs.reduce((t, l) => t + l.amount, 0);
  const grossProfit = totalRevenue - cogsTotal;
  const opexTotal = opex.reduce((t, l) => t + l.amount, 0);
  const operatingProfit = grossProfit - opexTotal;
  return {
    period, revenue, revenueTotal, contra, contraTotal, netRevenue,
    shippingRevenue, totalRevenue,
    cogs, cogsTotal, grossProfit,
    grossMarginPct: totalRevenue ? grossProfit / totalRevenue : 0,
    opex, opexTotal, operatingProfit,
    operatingMarginPct: totalRevenue ? operatingProfit / totalRevenue : 0,
  };
}
