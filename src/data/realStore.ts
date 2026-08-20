// Build the app's normalized Store from real WaterBorn Workshop Shopify data.
//
// The guiding rule: Shopify knows what it knows. It reports revenue, discounts,
// refunds, shipping and tax collected. It does NOT know bank balances, expenses,
// landed cost, purchase orders, bills or ad spend. Everything derived from those is
// left genuinely empty so the app reports "not available" rather than computing a
// confident $0 — a fabricated zero is worse than an honest blank.

import type { Store } from "./store";
import type {
  AlertConfig, BankTransaction, Bill, Campaign, CategorizationRule, ConnectorState,
  Customer, Decision, FinancialAccount, Goal, InventoryLot, Launch, LedgerEntry,
  LedgerLine, MarketingSpendDaily, Order, Product, PurchaseOrder, RecurringExpense,
  RollupDay, Sku, SocialPost, TaxLiability, TaxPayment, TrafficDaily,
} from "@/domain/types";
import { addDays, dateRange } from "@/lib/dates";
import { REAL_CHANNELS, REAL_DAYS, REAL_META, REAL_PRODUCTS } from "./real";

/** Channel labels Shopify reports; blank means no referrer was recorded. */
function channelName(raw: string): string {
  if (!raw || raw === "direct") return "direct";
  return raw;
}

export function buildRealStore(): Store {
  const today = REAL_META.lastDay;
  const start = REAL_DAYS[0]?.date ?? today;
  const days = dateRange(start, today);

  // ── Products & SKUs ──────────────────────────────────────
  // Shopify's analytics gives per-product totals, not per-variant. One SKU per
  // product, priced at the observed average selling price.
  const products: Product[] = [];
  const skus: Sku[] = [];
  const skusByProduct = new Map<string, Sku[]>();
  REAL_PRODUCTS.forEach((p, i) => {
    const id = `WP${String(i + 1).padStart(2, "0")}`;
    products.push({
      id, name: p.name, collection: inferCollection(p.name),
      status: "active", launchedAt: start,
    });
    // Average selling price per order line is the best price signal available.
    const price = p.orders > 0 ? Math.round(p.gross / p.orders) : 0;
    const sku: Sku = { id: `${id}-S1`, productId: id, sku: "", variant: "Default", price };
    skus.push(sku);
    skusByProduct.set(id, [sku]);
  });

  // ── Daily rollups straight from Shopify's own numbers ─────
  const rollups = new Map<string, RollupDay>();
  const byDate = new Map(REAL_DAYS.map((d) => [d.date, d]));
  for (const date of days) {
    const d = byDate.get(date);
    rollups.set(date, {
      date,
      orders: d?.orders ?? 0,
      units: 0,                       // per-line quantities are not in this feed
      gross: d?.gross ?? 0,
      discounts: d?.discounts ?? 0,
      refunds: d?.refunds ?? 0,
      shippingRev: d?.shipping ?? 0,
      taxCollected: d?.taxes ?? 0,
      fees: 0,                        // processor fees not in this dataset
      cogs: 0,                        // no cost data — see COGS_UNKNOWN
      fulfillment: 0,
      adSpend: 0,                     // no ad platform connected
      sessions: 0,                    // no analytics connected
      newCustomers: 0,
    });
  }

  // ── Orders ───────────────────────────────────────────────
  // Shopify analytics is aggregated by day, so we synthesise one order record per
  // real order with that day's average values. Daily totals are exact; the split
  // across orders within a day is an even division, which is flagged in the UI.
  const orders: Order[] = [];
  const ordersByDate = new Map<string, Order[]>();
  const channelWeights = REAL_CHANNELS.map((c) => c.orders);
  const channelTotal = channelWeights.reduce((t, w) => t + w, 0) || 1;
  let seq = 0;
  for (const date of days) {
    const d = byDate.get(date);
    const list: Order[] = [];
    if (d && d.orders > 0) {
      const n = d.orders;
      const per = (v: number) => Math.round(v / n);
      for (let i = 0; i < n; i++) {
        // Deterministic channel assignment proportional to observed channel mix.
        const pick = ((seq * 997) % channelTotal);
        let acc = 0;
        let channel = "direct";
        for (let c = 0; c < REAL_CHANNELS.length; c++) {
          acc += REAL_CHANNELS[c].orders;
          if (pick < acc) { channel = channelName(REAL_CHANNELS[c].channel); break; }
        }
        orders.push({
          id: `WB-${++seq}`,
          customerId: `WC${seq}`,
          date,
          hour: 12,
          channel: "online",
          trafficSource: channel,
          device: "unknown" as Order["device"],
          region: "US",
          items: [],
          gross: per(d.gross),
          discount: per(d.discounts),
          shippingRevenue: per(d.shipping),
          tax: per(d.taxes),
          refund: per(d.refunds),
          fees: 0,
          cogs: 0,
          fulfillment: 0,
          isFirstOrder: true,
        });
        list.push(orders[orders.length - 1]);
      }
    }
    ordersByDate.set(date, list);
  }

  // ── Customers ────────────────────────────────────────────
  // Customer identity is not in the aggregate feed, so no cohort/LTV claims are made.
  const customers: Customer[] = [];

  // ── Ledger: revenue side only ────────────────────────────
  // Real sales post to the ledger. There is no bank feed, so cash, expenses and COGS
  // are absent by design rather than guessed at.
  const ledger: LedgerEntry[] = [];
  let entryNo = 0;
  const dr = (accountId: string, amt: number): LedgerLine => ({ accountId, debit: amt, credit: 0 });
  const cr = (accountId: string, amt: number): LedgerLine => ({ accountId, debit: 0, credit: amt });
  for (const d of REAL_DAYS) {
    const productRev = d.gross;
    const clearing = d.gross - d.discounts + d.shipping + d.taxes;
    if (productRev !== 0 || d.shipping !== 0 || d.taxes !== 0) {
      const lines = [
        dr("processor_clearing", clearing),
        dr("contra_discounts", d.discounts),
        cr("rev_product", productRev),
        cr("rev_shipping", d.shipping),
        cr("sales_tax_payable", d.taxes),
      ].filter((l) => l.debit !== 0 || l.credit !== 0);
      const totalDr = lines.reduce((t, l) => t + l.debit, 0);
      const totalCr = lines.reduce((t, l) => t + l.credit, 0);
      if (totalDr === totalCr && lines.length > 0) {
        ledger.push({
          id: `WJ${++entryNo}`, date: d.date,
          memo: `Shopify sales — ${d.orders} order${d.orders === 1 ? "" : "s"}`,
          sourceType: "order_batch", lines,
        });
      }
    }
    if (d.refunds !== 0) {
      ledger.push({
        id: `WJ${++entryNo}`, date: d.date, memo: "Customer refunds", sourceType: "order_batch",
        lines: [dr("contra_refunds", d.refunds), cr("processor_clearing", d.refunds)],
      });
    }
  }

  // ── Everything Shopify cannot tell us stays empty ────────
  const finAccounts: FinancialAccount[] = [];
  const bankTx: BankTransaction[] = [];
  const lots: InventoryLot[] = [];
  const purchaseOrders: PurchaseOrder[] = [];
  const bills: Bill[] = [];
  const recurring: RecurringExpense[] = [];
  const taxPayments: TaxPayment[] = [];
  const spendDaily: MarketingSpendDaily[] = [];
  const trafficDaily: TrafficDaily[] = [];
  const socialPosts: SocialPost[] = [];
  const launches: Launch[] = [];
  const decisions: Decision[] = [];
  const campaigns: Campaign[] = [];
  const rules: CategorizationRule[] = [];

  // Sales tax collected is real and is a real liability, even with no bank feed.
  const taxLiabilities: TaxLiability[] = [];
  const byMonth = new Map<string, number>();
  for (const d of REAL_DAYS) {
    if (d.taxes === 0) continue;
    const mk = d.date.slice(0, 7);
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + d.taxes);
  }
  for (const [mk, collected] of [...byMonth.entries()].sort()) {
    taxLiabilities.push({
      id: `WTL-${mk}`, kind: "sales", jurisdiction: "Collected (jurisdiction not in feed)",
      periodStart: `${mk}-01`, periodEnd: `${mk}-28`,
      filingDue: "", paymentDue: "",
      collected, refunded: 0, remitted: 0,
      provenance: "imported",
    });
  }

  const goals: Goal[] = [];
  const alertConfigs: AlertConfig[] = [];

  const connectors: ConnectorState[] = [
    {
      id: "shopify", name: "Shopify — WaterBorn Workshop", category: "Ecommerce",
      status: "connected", lastSync: REAL_META.snapshotDate,
      detail: `Snapshot of ${REAL_META.domain}: 811 orders, $51,838 gross since ${REAL_META.firstDay}.`,
    },
    { id: "plaid", name: "Bank feed (Plaid or CSV)", category: "Banking", status: "available", detail: "Needed for cash, available cash and expenses." },
    { id: "cogs", name: "Product costs (manual or CSV)", category: "Manual", status: "available", detail: "Needed for gross profit, margin and contribution." },
    { id: "ga4", name: "Google Analytics 4", category: "Analytics", status: "available", detail: "Needed for sessions, conversion and the funnel." },
    { id: "meta", name: "Meta Ads", category: "Advertising", status: "available", detail: "Needed for CAC, ROAS and MER." },
  ];

  const productById = new Map(products.map((p) => [p.id, p]));
  const skuById = new Map(skus.map((s) => [s.id, s]));

  return {
    // Shopify reports orders, revenue and tax collected — and nothing else. Everything
    // below is genuinely unknown until another source is connected, and the app says so
    // rather than treating absence as zero.
    capabilities: {
      cash: false,
      cogs: false,
      sessions: false,
      adSpend: false,
      customers: false,
      inventory: false,
      expenses: false,
      units: false,
    },
    today, start, days,
    siteUpdateDay: "",
    products, skus, customers, orders, ordersByDate, rollups,
    lots, purchaseOrders, bills, recurring, taxLiabilities, taxPayments,
    campaigns, spendDaily, trafficDaily, socialPosts, launches, decisions,
    goals, alertConfigs, finAccounts, ledger, bankTx, rules, connectors,
    incomeTaxRatePct: 25,
    productById, skuById, skusByProduct,
  };
}

function inferCollection(name: string): string {
  const n = name.toUpperCase();
  if (n.includes("BELT")) return "Belts";
  if (n.includes("PIN")) return "Pins";
  if (n.includes("HOODIE")) return "Hoodies";
  if (n.includes("TEE") || n.includes("SHIRT")) return "Tees";
  if (n.includes("BEANIE") || n.includes("TRUCKER")) return "Headwear";
  if (n.includes("BAG")) return "Bags";
  return "Other";
}
