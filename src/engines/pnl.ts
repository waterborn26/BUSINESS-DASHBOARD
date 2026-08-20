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
  netRevenue: number;
  cogs: PnlLine[];
  cogsTotal: number;
  grossProfit: number;
  grossMarginPct: number;   // of net revenue
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
  const revenueTotal = revenue.reduce((t, l) => t + l.amount, 0);
  const contraTotal = contra.reduce((t, l) => t + l.amount, 0);
  const netRevenue = revenueTotal - contraTotal;
  const cogsTotal = cogs.reduce((t, l) => t + l.amount, 0);
  const grossProfit = netRevenue - cogsTotal;
  const opexTotal = opex.reduce((t, l) => t + l.amount, 0);
  const operatingProfit = grossProfit - opexTotal;
  return {
    period, revenue, revenueTotal, contra, contraTotal, netRevenue,
    cogs, cogsTotal, grossProfit,
    grossMarginPct: netRevenue ? grossProfit / netRevenue : 0,
    opex, opexTotal, operatingProfit,
    operatingMarginPct: netRevenue ? operatingProfit / netRevenue : 0,
  };
}
