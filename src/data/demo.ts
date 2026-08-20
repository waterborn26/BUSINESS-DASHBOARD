// Demo dataset generator.
//
// This is not random dashboard filler: it simulates one coherent business day by day.
// Orders consume FIFO inventory lots; every dollar of sales, fees, refunds, payouts,
// inventory purchases, expenses, taxes and owner activity is posted to the double-entry
// ledger; bank transactions are derived from the ledger's cash legs. Engines therefore
// reconcile: cash on the Finance screen IS the ledger, and P&L ties to orders.
//
// Deliberately embedded storylines (so analytics/insights have something true to find):
//  • Mobile conversion drop after a site update 15 days ago (worst on Meta/Instagram traffic)
//  • Meta CPC/CAC drifting up over the last 60 days
//  • One best-seller ~10 days from stockout; two slow movers aging into dead stock
//  • A refund spike from a bad production batch ~35 days ago
//  • A price increase decision on one product 90 days ago (units −, profit +)
//  • BFCM + two launches + a summer drop, seasonality and steady growth

import {
  mulberry32, gaussian, poisson, pickWeighted, randInt, type Rng,
} from "@/lib/prng";
import { addDays, dateRange, dayOfWeek, dayOfYear, iso, monthKey } from "@/lib/dates";
import { clamp } from "@/lib/stats";
import type {
  AlertConfig, BankTransaction, Bill, Campaign, CategorizationRule, ConnectorState, Customer,
  Decision, FinancialAccount, Goal, InventoryLot, Launch, LedgerEntry, LedgerLine, LedgerSource,
  MarketingSpendDaily, Order, OrderItem, Product, PurchaseOrder, RecurringExpense, RollupDay,
  Sku, SocialPost, TaxLiability, TaxPayment, TrafficDaily,
} from "@/domain/types";
import { ALL_CAPABILITIES, type Capabilities } from "@/domain/types";

export interface Dataset {
  /** What this dataset actually knows — see domain/types Capabilities. */
  capabilities: Capabilities;
  today: string;
  start: string;
  days: string[];
  siteUpdateDay: string;
  products: Product[];
  skus: Sku[];
  customers: Customer[];
  orders: Order[];
  ordersByDate: Map<string, Order[]>;
  rollups: Map<string, RollupDay>;
  lots: InventoryLot[];
  purchaseOrders: PurchaseOrder[];
  bills: Bill[];
  recurring: RecurringExpense[];
  taxLiabilities: TaxLiability[];
  taxPayments: TaxPayment[];
  campaigns: Campaign[];
  spendDaily: MarketingSpendDaily[];
  trafficDaily: TrafficDaily[];
  socialPosts: SocialPost[];
  launches: Launch[];
  decisions: Decision[];
  goals: Goal[];
  alertConfigs: AlertConfig[];
  finAccounts: FinancialAccount[];
  ledger: LedgerEntry[];
  bankTx: BankTransaction[];
  rules: CategorizationRule[];
  connectors: ConnectorState[];
  /** User-entered effective income tax rate for planning estimates. */
  incomeTaxRatePct: number;
}

// ───────────────────────── Catalog ─────────────────────────

interface ProductSpec {
  name: string; collection: string; price: number; costRatio: number;
  weight: number;            // relative demand
  season: "summer" | "winter" | "even";
  launchOffset: number;      // days from sim start (negative = pre-existing)
  variants: string[];
  trend: number;             // demand multiplier per year (1 = flat)
  dead?: boolean;            // historical over-buy that never sold through
  overstock?: boolean;       // over-ordered ahead of last season
}

const CATALOG: ProductSpec[] = [
  { name: "Tidewater Duffel 40L", collection: "Bags", price: 14800, costRatio: 0.30, weight: 9.5, season: "even", launchOffset: 104, variants: ["Slate", "Moss"], trend: 1.5 },
  { name: "Crosscurrent Sling", collection: "Bags", price: 6800, costRatio: 0.28, weight: 8.0, season: "even", launchOffset: -300, variants: ["Black", "Sand"], trend: 1.25 },
  { name: "Driftline Tote", collection: "Bags", price: 5400, costRatio: 0.30, weight: 4.0, season: "summer", launchOffset: -300, variants: ["Natural"], trend: 1.0 },
  { name: "Meridian Field Pack 22L", collection: "Bags", price: 12400, costRatio: 0.31, weight: 7.2, season: "even", launchOffset: -300, variants: ["Slate", "Olive", "Black"], trend: 1.35 },
  { name: "Summit Shell Jacket", collection: "Apparel", price: 16800, costRatio: 0.34, weight: 6.0, season: "winter", launchOffset: 278, variants: ["S", "M", "L"], trend: 1.4 },
  { name: "Basecamp Hoodie", collection: "Apparel", price: 8800, costRatio: 0.33, weight: 7.5, season: "winter", launchOffset: -300, variants: ["S", "M", "L"], trend: 1.2 },
  { name: "Waterline Tee", collection: "Apparel", price: 3600, costRatio: 0.28, weight: 8.5, season: "summer", launchOffset: -300, variants: ["S", "M", "L"], trend: 1.1 },
  { name: "Harbor Cap", collection: "Apparel", price: 3200, costRatio: 0.25, weight: 5.5, season: "even", launchOffset: -300, variants: ["Navy", "Stone"], trend: 1.15 },
  { name: "Ridgeline Beanie", collection: "Apparel", price: 2800, costRatio: 0.24, weight: 3.6, season: "winter", launchOffset: -300, variants: ["Charcoal"], trend: 1.0 },
  { name: "Cove Boardshorts", collection: "Apparel", price: 6200, costRatio: 0.30, weight: 4.4, season: "summer", launchOffset: -140, variants: ["30", "32", "34"], trend: 1.3 },
  { name: "Everflask 32oz", collection: "Drinkware", price: 4400, costRatio: 0.26, weight: 9.0, season: "even", launchOffset: -300, variants: ["Slate", "Moss", "Clay"], trend: 1.3 },
  { name: "Everflask 20oz", collection: "Drinkware", price: 3800, costRatio: 0.26, weight: 6.8, season: "even", launchOffset: -300, variants: ["Slate", "Clay"], trend: 1.2 },
  { name: "Camp Mug 12oz", collection: "Drinkware", price: 2600, costRatio: 0.27, weight: 5.0, season: "winter", launchOffset: -300, variants: ["Enamel"], trend: 1.05 },
  { name: "Trailhead Bottle Sling", collection: "Drinkware", price: 2400, costRatio: 0.29, weight: 2.6, season: "summer", launchOffset: -300, variants: ["Sand"], trend: 0.95 },
  { name: "Fieldnotes Journal Set", collection: "Goods", price: 2200, costRatio: 0.32, weight: 3.0, season: "even", launchOffset: -300, variants: ["3-pack"], trend: 1.0 },
  { name: "Meridian Multi-Tool", collection: "Goods", price: 5800, costRatio: 0.35, weight: 4.6, season: "even", launchOffset: -300, variants: ["Steel"], trend: 1.1 },
  { name: "Dry Bag 10L", collection: "Goods", price: 3400, costRatio: 0.27, weight: 3.8, season: "summer", launchOffset: -300, variants: ["Yellow", "Slate"], trend: 1.05 },
  { name: "Packable Rain Poncho", collection: "Goods", price: 4200, costRatio: 0.31, weight: 2.2, season: "even", launchOffset: -300, variants: ["One size"], trend: 0.9 },
  { name: "Basecamp Blanket", collection: "Goods", price: 7800, costRatio: 0.34, weight: 3.4, season: "winter", launchOffset: -300, variants: ["Plaid"], trend: 1.1, overstock: true },
  { name: "Ember Camp Lantern", collection: "Goods", price: 4900, costRatio: 0.36, weight: 3.2, season: "even", launchOffset: -300, variants: ["Brass"], trend: 1.0 },
  // The three `dead` SKUs were over-bought and barely sell — they exist to strand
  // real capital on the shelf, which the inventory engine should surface as such.
  { name: "Coastal Candle", collection: "Goods", price: 2800, costRatio: 0.30, weight: 0.55, season: "winter", launchOffset: -300, variants: ["8oz"], trend: 0.55, dead: true },
  { name: "Canvas Patch Kit", collection: "Goods", price: 1400, costRatio: 0.33, weight: 0.30, season: "even", launchOffset: -300, variants: ["Kit"], trend: 0.5, dead: true },
  { name: "Voyager Passport Wallet", collection: "Goods", price: 3800, costRatio: 0.29, weight: 0.45, season: "even", launchOffset: -300, variants: ["Tan"], trend: 0.55, dead: true },
  { name: "Cove Colorway Duffel (LE)", collection: "Bags", price: 15800, costRatio: 0.31, weight: 5.5, season: "summer", launchOffset: 412, variants: ["Cove"], trend: 1.0 },
  { name: "Tidepool Sandal", collection: "Apparel", price: 5600, costRatio: 0.32, weight: 3.3, season: "summer", launchOffset: -60, variants: ["8", "9", "10"], trend: 1.1 },
  { name: "Overlook Sunglasses", collection: "Goods", price: 6400, costRatio: 0.22, weight: 4.2, season: "summer", launchOffset: -300, variants: ["Smoke"], trend: 1.2 },
  { name: "Switchback Belt", collection: "Apparel", price: 2900, costRatio: 0.26, weight: 2.8, season: "even", launchOffset: -300, variants: ["One size"], trend: 1.0 },
  { name: "Northbound Parka", collection: "Apparel", price: 22800, costRatio: 0.38, weight: 2.4, season: "winter", launchOffset: -300, variants: ["M", "L"], trend: 1.15, overstock: true },
];

const VENDORS = ["Cascadia Mfg Co.", "Pacific Textile Works", "Hangzhou Metalworks", "Baja Softgoods"];
const REGIONS = ["CA", "NY", "TX", "FL", "WA", "IL", "CO", "OR", "GA", "Other"];
const REGION_W = [26, 12, 10, 8, 7, 5, 5, 4, 4, 19];
// Sales-tax nexus: states where economic nexus has been crossed and tax is collected
// (rates in basis points of the taxable subtotal). OR has no sales tax; the rest are
// below the economic-nexus threshold, so no tax is collected there.
const NEXUS: Record<string, number> = {
  CA: 850, NY: 800, TX: 825, FL: 700, WA: 950, IL: 825, CO: 775,
};

/** Supplier lead time from PO to receipt, in days. */
const LEAD_DAYS = 35;

/** Landed-cost multiplier applied to catalog cost ratios (targets ~65% gross margin). */
const COGS_MULT = 1.15;

/**
 * Fixed monthly obligations, in cents. Single source of truth: the demo generator posts
 * these to the ledger and the cash forecaster schedules the same amounts, so the forward
 * projection can never drift from the history it is projecting.
 */
export const MONTHLY_OBLIGATIONS = {
  contractors: 405_000,
  payroll: 612_000,
  rent: 85_000,
  insurance: 21_000,
  loanPayment: 52_000,   // principal 38_000 + interest 14_000
  bankFees: 4_500,
  ownerDraw: 1_150_000,
} as const;

/** Obligations paid on the 2nd of each month (operating, excludes loan/draw). */
export const DAY2_OBLIGATIONS =
  MONTHLY_OBLIGATIONS.contractors + MONTHLY_OBLIGATIONS.payroll +
  MONTHLY_OBLIGATIONS.rent + MONTHLY_OBLIGATIONS.insurance;

const SOURCES = ["direct", "organic", "meta", "google", "tiktok", "email", "referral"] as const;
const SOURCE_MIX: Record<string, number> = { direct: 0.15, organic: 0.23, meta: 0.28, google: 0.12, tiktok: 0.08, email: 0.10, referral: 0.04 };
const SOURCE_CR: Record<string, number> = { direct: 0.036, organic: 0.026, meta: 0.017, google: 0.024, tiktok: 0.011, email: 0.045, referral: 0.020 };

// ───────────────────────── Generator ─────────────────────────

export function generateDataset(todayIso?: string): Dataset {
  const rng = mulberry32(0xC0FFEE);
  const today = todayIso ?? iso(new Date());
  const N = 445;
  const start = addDays(today, -(N - 1));
  const days = dateRange(start, today);
  const siteUpdateDay = addDays(today, -15);
  const refundSpikeStart = addDays(today, -38);
  const refundSpikeEnd = addDays(today, -31);
  const priceIncreaseDay = addDays(today, -90);
  const tiktokStart = addDays(start, 150);

  // Products & SKUs
  const products: Product[] = [];
  const skus: Sku[] = [];
  const skusByProduct = new Map<string, Sku[]>();
  CATALOG.forEach((spec, pi) => {
    const pid = `P${String(pi + 1).padStart(2, "0")}`;
    const launched = spec.launchOffset < 0 ? addDays(start, spec.launchOffset) : addDays(start, spec.launchOffset);
    products.push({ id: pid, name: spec.name, collection: spec.collection, status: "active", launchedAt: launched });
    const list: Sku[] = spec.variants.map((v, vi) => ({
      id: `${pid}-S${vi + 1}`,
      productId: pid,
      sku: `${spec.name.split(" ")[0].toUpperCase().slice(0, 6)}-${String(pi + 1).padStart(2, "0")}${vi + 1}`,
      variant: v,
      price: spec.price,
    }));
    skus.push(...list);
    skusByProduct.set(pid, list);
  });
  // Storyline: price increase on Crosscurrent Sling (P02) 90 days ago: $68 → $74.
  const pricedUpProduct = "P02";
  const priceOld = 6800, priceNew = 7400;

  // Launches
  const launches: Launch[] = [
    { id: "L1", name: "Tidewater Duffel Launch", date: addDays(start, 104), productIds: ["P01"], marketingBudget: 420000, notes: "Hero product launch with email + Meta push." },
    { id: "L2", name: "Summit Shell Launch", date: addDays(start, 278), productIds: ["P05"], marketingBudget: 380000, notes: "Winter flagship outerwear." },
    { id: "L3", name: "Cove Colorway Drop", date: addDays(start, 412), productIds: ["P24", "P10"], marketingBudget: 260000, notes: "Limited summer colorway drop." },
  ];
  const launchByDate = new Map<string, Launch>();
  for (const l of launches) launchByDate.set(l.date, l);

  // ── Ledger machinery ──────────────────────────────────────
  const ledger: LedgerEntry[] = [];
  let entrySeq = 0;
  function post(date: string, memo: string, sourceType: LedgerSource, lines: LedgerLine[], sourceId?: string) {
    let d = 0, c = 0;
    const clean = lines.filter((l) => l.debit !== 0 || l.credit !== 0);
    for (const l of clean) { d += l.debit; c += l.credit; }
    if (d !== c) throw new Error(`Unbalanced entry "${memo}" on ${date}: dr ${d} cr ${c}`);
    if (clean.length === 0) return;
    ledger.push({ id: `J${++entrySeq}`, date, memo, sourceType, sourceId, lines: clean });
  }
  const dr = (accountId: string, amt: number): LedgerLine => ({ accountId, debit: amt, credit: 0 });
  const cr = (accountId: string, amt: number): LedgerLine => ({ accountId, debit: 0, credit: amt });

  // ── Inventory machinery (FIFO lots) ───────────────────────
  const lots: InventoryLot[] = [];
  const lotsBySku = new Map<string, InventoryLot[]>();
  let lotSeq = 0;
  function addLot(skuId: string, receivedAt: string, qty: number, unitMfg: number, unitPackaging: number, unitFreight: number, unitDuties: number, poId?: string) {
    const lot: InventoryLot = {
      id: `LOT${++lotSeq}`, skuId, poId, receivedAt, qty, remainingQty: qty,
      unitMfg, unitPackaging, unitFreight, unitDuties,
      unitLanded: unitMfg + unitPackaging + unitFreight + unitDuties,
    };
    lots.push(lot);
    if (!lotsBySku.has(skuId)) lotsBySku.set(skuId, []);
    lotsBySku.get(skuId)!.push(lot);
    return lot;
  }
  function stockOf(skuId: string): number {
    let q = 0;
    for (const l of lotsBySku.get(skuId) ?? []) q += l.remainingQty;
    return q;
  }
  /** Consume qty FIFO; returns { cogs, mfg, pack, freight, duties, consumed }. */
  function consume(skuId: string, qty: number) {
    let need = qty, cogs = 0, mfg = 0, pack = 0, freight = 0, duties = 0, consumed = 0;
    for (const l of lotsBySku.get(skuId) ?? []) {
      if (need <= 0) break;
      const take = Math.min(need, l.remainingQty);
      if (take <= 0) continue;
      l.remainingQty -= take;
      need -= take;
      consumed += take;
      cogs += take * l.unitLanded;
      mfg += take * l.unitMfg; pack += take * l.unitPackaging;
      freight += take * l.unitFreight; duties += take * l.unitDuties;
    }
    return { cogs, mfg, pack, freight, duties, consumed };
  }

  const specFor = (pid: string) => CATALOG[Number(pid.slice(1)) - 1];
  function unitCosts(pid: string) {
    const spec = specFor(pid);
    // COGS_MULT lifts landed cost to a realistic DTC hard-goods gross margin (~65%).
    const base = spec.price * spec.costRatio * COGS_MULT;
    const mfg = Math.round(base * 0.74);
    const pack = Math.round(base * 0.08);
    const freight = Math.round(base * 0.12);
    const duties = Math.round(base * 0.06);
    return { mfg, pack, freight, duties, landed: mfg + pack + freight + duties };
  }

  // Opening inventory (received before window, paid before window → in opening equity)
  let openingInventoryValue = 0;
  for (const p of products) {
    const spec = specFor(p.id);
    if (spec.launchOffset >= 0) continue;
    const uc = unitCosts(p.id);
    const variantCount = skusByProduct.get(p.id)!.length;
    // `dead` SKUs carry a historical over-buy that never sold through; `overstock`
    // SKUs were ordered heavily ahead of a season that is now behind us.
    const overbuy = spec.dead ? 9 : spec.overstock ? 4 : 1;
    for (const s of skusByProduct.get(p.id)!) {
      const qty = Math.round(((spec.weight * 9) / variantCount + randInt(rng, 10, 40)) * overbuy);
      addLot(s.id, addDays(start, -20), qty, uc.mfg, uc.pack, uc.freight, uc.duties);
      openingInventoryValue += qty * uc.landed;
    }
  }

  // Opening balances
  const OPEN_CHECKING = 5_000_000, OPEN_SAVINGS = 1_800_000, OPEN_PAYPAL = 84_000, OPEN_EQUIP = 640_000, OPEN_LOAN = 2_150_000;
  post(addDays(start, -1), "Opening balances", "opening", [
    dr("cash_checking", OPEN_CHECKING),
    dr("cash_savings", OPEN_SAVINGS),
    dr("cash_paypal", OPEN_PAYPAL),
    dr("inventory", openingInventoryValue),
    dr("equipment", OPEN_EQUIP),
    cr("loan_sba", OPEN_LOAN),
    cr("owner_contributions", OPEN_CHECKING + OPEN_SAVINGS + OPEN_PAYPAL + openingInventoryValue + OPEN_EQUIP - OPEN_LOAN),
  ]);

  // Purchase orders
  const purchaseOrders: PurchaseOrder[] = [];
  let poSeq = 0;
  interface PendingPo { po: PurchaseOrder; receiveOn: string; balanceDueOn: string; }
  const pendingPos: PendingPo[] = [];
  function createPo(date: string, pid: string, totalQty: number, leadDays: number) {
    const uc = unitCosts(pid);
    const variants = skusByProduct.get(pid)!;
    const per = Math.max(1, Math.round(totalQty / variants.length));
    const items = variants.map((s) => ({ skuId: s.id, qty: per, unitCost: uc.mfg + uc.pack }));
    const goods = items.reduce((t, i) => t + i.qty * i.unitCost, 0);
    const freight = Math.round(goods * 0.14);
    const duties = Math.round(goods * 0.07);
    const po: PurchaseOrder = {
      id: `PO-${String(++poSeq).padStart(3, "0")}`,
      vendor: VENDORS[Number(pid.slice(1)) % VENDORS.length],
      createdAt: date, expectedAt: addDays(date, leadDays),
      status: "deposit_paid", total: goods + freight + duties, paid: 0,
      freight, duties, allocation: "per_unit", items,
    };
    const deposit = Math.round(goods * 0.3);
    po.paid = deposit;
    purchaseOrders.push(po);
    pendingPos.push({ po, receiveOn: po.expectedAt, balanceDueOn: addDays(po.expectedAt, 15) });
    post(date, `PO deposit 30% — ${po.vendor} (${specFor(pid).name})`, "po",
      [dr("vendor_deposits", deposit), cr("cash_checking", deposit)], po.id);
    return po;
  }

  // ── Customers ─────────────────────────────────────────────
  const customers: Customer[] = [];
  const customerPool: number[] = []; // indexes of customers eligible to repeat
  let custSeq = 0;

  // ── Accumulators ──────────────────────────────────────────
  const orders: Order[] = [];
  const ordersByDate = new Map<string, Order[]>();
  const rollups = new Map<string, RollupDay>();
  const trafficDaily: TrafficDaily[] = [];
  const spendDaily: MarketingSpendDaily[] = [];
  const taxCollectedByMonthJur = new Map<string, number>(); // `${month}|${jur}`
  const taxRefundedByMonthJur = new Map<string, number>();
  const taxPayments: TaxPayment[] = [];
  const pendingRefunds: { onDate: string; order: Order }[] = [];
  const monthlyFulfillment = new Map<string, number>();

  const campaigns: Campaign[] = [
    { id: "C-META-P", channel: "meta", name: "Meta — Prospecting", objective: "conversions", startedAt: start },
    { id: "C-META-R", channel: "meta", name: "Meta — Retargeting", objective: "conversions", startedAt: start },
    { id: "C-GOO-B", channel: "google", name: "Google — Brand Search", objective: "search", startedAt: start },
    { id: "C-GOO-S", channel: "google", name: "Google — Shopping", objective: "shopping", startedAt: start },
    { id: "C-TT-P", channel: "tiktok", name: "TikTok — Spark Ads", objective: "conversions", startedAt: tiktokStart },
    { id: "C-KLA-F", channel: "email", name: "Klaviyo — Flows", objective: "retention", startedAt: start },
    { id: "C-KLA-C", channel: "email", name: "Klaviyo — Campaigns", objective: "retention", startedAt: start },
  ];

  // Demand helpers
  function annualSeason(dateStr: string, season: "summer" | "winter" | "even"): number {
    const doy = dayOfYear(dateStr);
    const phase = (doy / 365) * 2 * Math.PI;
    if (season === "summer") return 1 + 0.42 * Math.sin(phase - 1.1);       // peak ~July
    if (season === "winter") return 1 + 0.5 * Math.sin(phase + 1.9);        // peak ~Dec
    return 1;
  }
  function bfcm(dateStr: string): number {
    const m = dateStr.slice(5, 7), d = Number(dateStr.slice(8, 10));
    if (m === "11" && d >= 27) return 2.7;
    if (m === "11" && d >= 20) return 1.35;
    if (m === "12" && d <= 15) return 1.35;
    return 1;
  }
  const WD = [0.86, 1.0, 1.02, 1.0, 1.04, 1.12, 1.2]; // Sun..Sat

  function productDemandWeight(pid: string, dateStr: string, dIdx: number): number {
    const spec = specFor(pid);
    const launched = products[Number(pid.slice(1)) - 1].launchedAt;
    if (dateStr < launched) return 0;
    const ageDays = Math.max(0, dIdx - spec.launchOffset);
    const rampUp = spec.launchOffset >= 0 ? clamp(ageDays / 21, 0.15, 1) : 1;
    const trendF = Math.pow(spec.trend, dIdx / 365);
    let w = spec.weight * annualSeason(dateStr, spec.season) * rampUp * trendF;
    // launch spike on launch products
    for (const l of launches) {
      if (l.productIds.includes(pid)) {
        const dd = dIdx - (Number(dayIndex.get(l.date) ?? -999));
        if (dd === 0) w *= 7;
        else if (dd === 1) w *= 3.4;
        else if (dd === 2) w *= 2;
        else if (dd >= -7 && dd < 0) w *= 0.7; // pre-launch teaser holds demand
      }
    }
    if (pid === pricedUpProduct && dateStr >= priceIncreaseDay) w *= 0.955;
    return w;
  }

  const dayIndex = new Map<string, number>();
  days.forEach((d, i) => dayIndex.set(d, i));

  // Promo windows (sitewide 20% off)
  const promoWindows = [
    { start: addDays(start, 55), end: addDays(start, 58), label: "Summer Sale" },
    { start: addDays(start, 240), end: addDays(start, 243), label: "Spring Sale" },
  ];
  function promoActive(d: string): boolean {
    const m = d.slice(5, 7), dd = Number(d.slice(8, 10));
    if (m === "11" && dd >= 27) return true;
    return promoWindows.some((w) => d >= w.start && d <= w.end);
  }

  // Weekly ad-spend accumulation → posted to Amex weekly
  let adSpendAccrued = 0;
  let ccBalanceTracker = 0;
  let ccStatement = 0;

  // Payout queue: net clearing amount per day, paid out 2 business days later
  const payoutQueue: { date: string; amount: number }[] = [];

  // ─────────────────── Daily simulation loop ───────────────────
  for (let d = 0; d < N; d++) {
    const date = days[d];
    const growth = Math.pow(1.62, d / 365); // ~62%/yr topline growth
    const isPromo = promoActive(date);
    const launchToday = launchByDate.get(date);

    // Receive pending POs due today
    for (const pp of pendingPos.filter((p) => p.receiveOn === date)) {
      const { po } = pp;
      po.status = "in_transit";
      const goods = po.items.reduce((t, i) => t + i.qty * i.unitCost, 0);
      const deposit = Math.round(goods * 0.3);
      const balance = goods - deposit;
      const totalUnits = po.items.reduce((t, i) => t + i.qty, 0);
      const perUnitFreight = Math.round(po.freight / totalUnits);
      const perUnitDuties = Math.round(po.duties / totalUnits);
      for (const it of po.items) {
        const pid = it.skuId.split("-S")[0];
        const uc = unitCosts(pid);
        addLot(it.skuId, date, it.qty, uc.mfg, uc.pack, perUnitFreight, perUnitDuties, po.id);
      }
      const landedTotal = goods + po.freight + po.duties;
      post(date, `PO received — ${po.vendor}`, "po", [
        dr("inventory", landedTotal),
        cr("vendor_deposits", deposit),
        cr("accounts_payable", balance),
        cr("cash_checking", po.freight + po.duties), // freight+duties invoices paid on receipt
      ], po.id);
      po.receivedAt = date;
      po.status = "received";
      po.paid += po.freight + po.duties;
    }
    for (const pp of pendingPos.filter((p) => p.balanceDueOn === date)) {
      const { po } = pp;
      const goods = po.items.reduce((t, i) => t + i.qty * i.unitCost, 0);
      const balance = goods - Math.round(goods * 0.3);
      // Leave the most recent PO balance unpaid at end of window (open AP storyline)
      if (addDays(date, 0) <= today) {
        post(date, `PO balance — ${po.vendor}`, "po", [dr("accounts_payable", balance), cr("cash_checking", balance)], po.id);
        po.paid += balance;
        po.status = "closed";
      }
    }

    // ── Traffic per source×device ──
    const baseSessions = 950 * growth * WD[dayOfWeek(date)] * bfcm(date) *
      (isPromo ? 1.4 : 1) * (launchToday ? 2.3 : 1) * (1 + 0.18 * Math.sin(dayOfYear(date) / 365 * 2 * Math.PI - 0.9));
    const dayTraffic: TrafficDaily[] = [];
    const cellOrders: { src: string; device: "desktop" | "mobile"; count: number }[] = [];
    for (const src of SOURCES) {
      if (src === "tiktok" && date < tiktokStart) continue;
      let srcSessions = baseSessions * SOURCE_MIX[src] * (1 + 0.1 * gaussian(rng) * 0.5);
      // Meta click cost drift: last 60 days, same spend buys fewer sessions
      const daysFromEnd = N - 1 - d;
      if (src === "meta" && daysFromEnd < 60) srcSessions *= 1 - 0.20 * (1 - daysFromEnd / 60);
      for (const device of ["desktop", "mobile"] as const) {
        const share = device === "mobile" ? 0.62 : 0.38;
        const sessions = Math.max(0, Math.round(srcSessions * share));
        let cvr = SOURCE_CR[src] * (device === "mobile" ? 0.78 : 1.18) * (isPromo ? 1.25 : 1);
        // Storyline: site update hurts mobile conversion, worst for meta traffic
        if (date >= siteUpdateDay && device === "mobile") cvr *= src === "meta" ? 0.70 : 0.85;
        const purchases = poisson(rng, sessions * cvr);
        const pv = Math.round(sessions * (0.46 + 0.05 * gaussian(rng) * 0.2));
        let atcRate = 0.085;
        if (date >= siteUpdateDay && device === "mobile") atcRate *= 0.8; // bounce up after update
        const atc = Math.max(purchases, Math.round(sessions * atcRate));
        const checkouts = Math.max(purchases, Math.round(atc * 0.45));
        dayTraffic.push({ date, source: src, device, sessions, productViews: pv, addToCarts: atc, checkouts, purchases });
        if (purchases > 0) cellOrders.push({ src, device, count: purchases });
      }
    }
    trafficDaily.push(...dayTraffic);

    // ── Orders ──
    let R: RollupDay = {
      date, orders: 0, units: 0, gross: 0, discounts: 0, refunds: 0, shippingRev: 0,
      taxCollected: 0, fees: 0, cogs: 0, fulfillment: 0, adSpend: 0,
      sessions: dayTraffic.reduce((t, r) => t + r.sessions, 0), newCustomers: 0,
    };
    let dayCogsMfg = 0, dayCogsPack = 0, dayCogsFre = 0, dayCogsDut = 0;
    const dayOrders: Order[] = [];
    const activePids = products.filter((p) => p.launchedAt <= date).map((p) => p.id);
    const weights = activePids.map((pid) => productDemandWeight(pid, date, d));

    let orderSeqDay = 0;
    for (const cell of cellOrders) {
      for (let k = 0; k < cell.count; k++) {
        // customer
        const returningProb = clamp(0.20 + 0.14 * (d / N) + (cell.src === "email" ? 0.35 : 0), 0, 0.75);
        let cIdx: number;
        let isFirst = false;
        if (customerPool.length > 40 && rng() < returningProb) {
          cIdx = customerPool[Math.floor(rng() * customerPool.length)];
        } else {
          isFirst = true;
          cIdx = custSeq;
          customers.push({
            id: `CU${++custSeq}`, createdAt: date,
            acquisitionChannel: cell.src, region: pickWeighted(rng, REGIONS, REGION_W),
            orderCount: 0, totalSpent: 0, firstOrderAt: date, lastOrderAt: date,
          });
          cIdx = custSeq - 1;
          customerPool.push(cIdx);
          R.newCustomers++;
        }
        const cust = customers[cIdx];

        // items
        const nItems = pickWeighted(rng, [1, 2, 3], [62, 27, 11]);
        const items: OrderItem[] = [];
        let gross = 0, cogs = 0;
        for (let it = 0; it < nItems; it++) {
          const pid = pickWeighted(rng, activePids, weights);
          const variants = skusByProduct.get(pid)!;
          const skuObj = variants[Math.floor(rng() * variants.length)];
          if (stockOf(skuObj.id) <= 0) continue; // stockout: sale lost
          const qty = 1;
          let unitPrice = skuObj.price;
          if (pid === pricedUpProduct) unitPrice = date >= priceIncreaseDay ? priceNew : priceOld;
          const c = consume(skuObj.id, qty);
          if (c.consumed === 0) continue;
          items.push({ skuId: skuObj.id, productId: pid, qty, unitPrice, unitCogs: c.cogs });
          gross += unitPrice;
          cogs += c.cogs;
          dayCogsMfg += c.mfg; dayCogsPack += c.pack; dayCogsFre += c.freight; dayCogsDut += c.duties;
        }
        if (items.length === 0) continue;

        const discount = isPromo ? Math.round(gross * 0.2) : rng() < 0.08 ? Math.round(gross * 0.1) : 0;
        const subtotal = gross - discount;
        const shippingRevenue = subtotal < 7500 ? 600 : 0;
        const region = cust.region;
        const taxBps = NEXUS[region] ?? 0;
        const tax = Math.round((subtotal * taxBps) / 10000);
        const charged = subtotal + shippingRevenue + tax;
        const fees = Math.round(charged * 0.029) + 30;
        const fulfillment = 420 + (items.length - 1) * 110;

        const order: Order = {
          id: `#${10000 + orders.length + dayOrders.length}`,
          customerId: cust.id, date, hour: randInt(rng, 6, 23),
          channel: "online", trafficSource: cell.src, device: cell.device, region,
          items, gross, discount, shippingRevenue, tax, refund: 0, fees, cogs, fulfillment,
          isFirstOrder: isFirst,
          launchId: launchToday && items.some((i) => launchToday.productIds.includes(i.productId)) ? launchToday.id : undefined,
        };
        orderSeqDay++;

        // refunds: baseline 3.5%; bad-batch window 16% for Everflask 32oz
        const inSpike = date >= refundSpikeStart && date <= refundSpikeEnd && items.some((i) => i.productId === "P11");
        const refundProb = inSpike ? 0.17 : 0.035;
        if (rng() < refundProb) {
          const rdate = addDays(date, randInt(rng, 2, 9));
          if (rdate <= today) pendingRefunds.push({ onDate: rdate, order });
        }

        cust.orderCount++;
        cust.totalSpent += subtotal + shippingRevenue;
        cust.lastOrderAt = date;
        dayOrders.push(order);

        R.orders++; R.units += items.reduce((t, i) => t + i.qty, 0);
        R.gross += gross; R.discounts += discount; R.shippingRev += shippingRevenue;
        R.taxCollected += tax; R.fees += fees; R.cogs += cogs; R.fulfillment += fulfillment;
        if (tax > 0) {
          const key = `${monthKey(date)}|${region}`;
          taxCollectedByMonthJur.set(key, (taxCollectedByMonthJur.get(key) ?? 0) + tax);
        }
      }
    }
    orders.push(...dayOrders);
    ordersByDate.set(date, dayOrders);

    // Post daily sales aggregate to ledger
    if (R.orders > 0) {
      const clearing = R.gross - R.discounts + R.shippingRev + R.taxCollected;
      post(date, `Daily sales — ${R.orders} orders`, "order_batch", [
        dr("processor_clearing", clearing),
        dr("contra_discounts", R.discounts),
        cr("rev_product", R.gross),
        cr("rev_shipping", R.shippingRev),
        cr("sales_tax_payable", R.taxCollected),
      ]);
      post(date, "Payment processing fees", "order_batch", [
        dr("exp_processing", R.fees), cr("processor_clearing", R.fees),
      ]);
      post(date, "COGS — landed cost of units sold", "order_batch", [
        dr("cogs_product", dayCogsMfg), dr("cogs_packaging", dayCogsPack),
        dr("cogs_freight", dayCogsFre), dr("cogs_duties", dayCogsDut),
        cr("inventory", dayCogsMfg + dayCogsPack + dayCogsFre + dayCogsDut),
      ]);
      payoutQueue.push({ date, amount: clearing - R.fees });
      monthlyFulfillment.set(monthKey(date), (monthlyFulfillment.get(monthKey(date)) ?? 0) + R.fulfillment);
    }

    // Process refunds due today
    let dayRefund = 0, dayRefundTax = 0;
    for (const pr of pendingRefunds.filter((p) => p.onDate === date)) {
      const o = pr.order;
      const productPortion = o.gross - o.discount;
      o.refund = productPortion;
      o.refundedAt = date;
      dayRefund += productPortion;
      dayRefundTax += o.tax;
      if (o.tax > 0) {
        const key = `${monthKey(date)}|${o.region}`;
        taxRefundedByMonthJur.set(key, (taxRefundedByMonthJur.get(key) ?? 0) + o.tax);
      }
      const rr = rollups.get(o.date); // attribute refund cash to refund date rollup
      void rr;
    }
    if (dayRefund > 0) {
      R.refunds = dayRefund;
      post(date, "Customer refunds", "order_batch", [
        dr("contra_refunds", dayRefund), dr("sales_tax_payable", dayRefundTax),
        cr("processor_clearing", dayRefund + dayRefundTax),
      ]);
      payoutQueue.push({ date, amount: -(dayRefund + dayRefundTax) });
    }

    // Payouts: settle amounts from 2 days ago
    const settleDate = addDays(date, -2);
    let payoutAmt = 0;
    for (let i = payoutQueue.length - 1; i >= 0; i--) {
      if (payoutQueue[i].date === settleDate) {
        payoutAmt += payoutQueue[i].amount;
        payoutQueue.splice(i, 1);
      }
    }
    if (payoutAmt > 0) {
      post(date, "Shopify Payments payout", "payout", [dr("cash_checking", payoutAmt), cr("processor_clearing", payoutAmt)]);
    } else if (payoutAmt < 0) {
      post(date, "Shopify Payments net refund debit", "payout", [dr("processor_clearing", -payoutAmt), cr("cash_checking", -payoutAmt)]);
    }

    // ── Marketing spend ──
    const metaCpcDrift = (N - 1 - d) < 60 ? 1 + 0.32 * (1 - (N - 1 - d) / 60) : 1;
    const launchBoost = launchToday ? 2.2 : 1;
    const metaSessions = dayTraffic.filter((t) => t.source === "meta").reduce((t, r) => t + r.sessions, 0);
    const googleSessions = dayTraffic.filter((t) => t.source === "google").reduce((t, r) => t + r.sessions, 0);
    const ttSessions = dayTraffic.filter((t) => t.source === "tiktok").reduce((t, r) => t + r.sessions, 0);
    const metaSpend = Math.round(metaSessions * 78 * metaCpcDrift * launchBoost);
    const googleSpend = Math.round(googleSessions * 72 * launchBoost);
    const ttSpend = date >= tiktokStart ? Math.round(ttSessions * 88) : 0;
    const metaOrders = dayOrders.filter((o) => o.trafficSource === "meta");
    const googleOrders = dayOrders.filter((o) => o.trafficSource === "google");
    const ttOrders = dayOrders.filter((o) => o.trafficSource === "tiktok");
    const rev = (os: Order[]) => os.reduce((t, o) => t + o.gross - o.discount + o.shippingRevenue, 0);
    const newC = (os: Order[]) => os.filter((o) => o.isFirstOrder).length;
    if (metaSpend > 0) {
      spendDaily.push(
        { date, channel: "meta", campaignId: "C-META-P", spend: Math.round(metaSpend * 0.72), impressions: Math.round(metaSessions * 42 * 0.72), clicks: Math.round(metaSessions * 0.78 * 0.72), attributedRevenue: Math.round(rev(metaOrders) * 0.8), newCustomers: Math.round(newC(metaOrders) * 0.85) },
        { date, channel: "meta", campaignId: "C-META-R", spend: Math.round(metaSpend * 0.28), impressions: Math.round(metaSessions * 42 * 0.28), clicks: Math.round(metaSessions * 0.78 * 0.28), attributedRevenue: Math.round(rev(metaOrders) * 0.55), newCustomers: Math.round(newC(metaOrders) * 0.15) },
      );
    }
    if (googleSpend > 0) {
      spendDaily.push(
        { date, channel: "google", campaignId: "C-GOO-B", spend: Math.round(googleSpend * 0.35), impressions: Math.round(googleSessions * 9 * 0.35), clicks: Math.round(googleSessions * 0.9 * 0.35), attributedRevenue: Math.round(rev(googleOrders) * 0.6), newCustomers: Math.round(newC(googleOrders) * 0.5) },
        { date, channel: "google", campaignId: "C-GOO-S", spend: Math.round(googleSpend * 0.65), impressions: Math.round(googleSessions * 14 * 0.65), clicks: Math.round(googleSessions * 0.9 * 0.65), attributedRevenue: Math.round(rev(googleOrders) * 0.55), newCustomers: Math.round(newC(googleOrders) * 0.5) },
      );
    }
    if (ttSpend > 0) {
      spendDaily.push({ date, channel: "tiktok", campaignId: "C-TT-P", spend: ttSpend, impressions: ttSessions * 55, clicks: Math.round(ttSessions * 1.1), attributedRevenue: Math.round(rev(ttOrders) * 1.15), newCustomers: newC(ttOrders) });
    }
    R.adSpend = metaSpend + googleSpend + ttSpend;
    adSpendAccrued += R.adSpend;

    // Weekly ad spend → Amex
    if (dayOfWeek(date) === 1 && adSpendAccrued > 0) {
      post(date, "Ad platforms — weekly charges (Meta, Google, TikTok)", "cc_charge",
        [dr("exp_advertising", adSpendAccrued), cr("cc_amex", adSpendAccrued)]);
      ccBalanceTracker += adSpendAccrued;
      adSpendAccrued = 0;
    }

    // ── Monthly events (posted on specific days of month) ──
    const dom = Number(date.slice(8, 10));
    const mk = monthKey(date);
    if (dom === 1) {
      // Recurring software subscriptions → Amex (defined below in `recurringDefs`)
      let subsTotal = 0;
      for (const s of recurringDefs) {
        if (s.cadence === "monthly" && date >= s.startedAt) subsTotal += s.amount;
      }
      post(date, "Software subscriptions (monthly)", "cc_charge", [dr("exp_software", subsTotal), cr("cc_amex", subsTotal)]);
      ccBalanceTracker += subsTotal;
      // Email platform counts as marketing software; klaviyo spend row for MER completeness
      spendDaily.push({ date, channel: "email", campaignId: "C-KLA-C", spend: 19900, impressions: 0, clicks: 0, attributedRevenue: 0, newCustomers: 0 });
    }
    if (dom === 2) {
      const M = MONTHLY_OBLIGATIONS;
      post(date, "Contractors — design, VA, bookkeeping", "expense", [dr("exp_contractors", M.contractors), cr("cash_checking", M.contractors)]);
      post(date, "Payroll — operations coordinator (incl. employer taxes)", "expense", [dr("exp_payroll", M.payroll), cr("cash_checking", M.payroll)]);
      post(date, "Studio rent & storage", "expense", [dr("exp_rent", M.rent), cr("cash_checking", M.rent)]);
      post(date, "Business insurance", "expense", [dr("exp_insurance", M.insurance), cr("cash_checking", M.insurance)]);
    }
    if (dom === 3) {
      // 3PL invoice for prior month's fulfillment
      const prevMk = monthKey(addDays(date, -15));
      const amt = monthlyFulfillment.get(prevMk) ?? 0;
      if (amt > 0) post(date, "3PL fulfillment invoice — prior month", "bill", [dr("exp_shipping", amt), cr("cash_checking", amt)]);
    }
    if (dom === 5) {
      post(date, "SBA loan payment", "loan", [dr("loan_sba", 38000), dr("exp_interest", 14000), cr("cash_checking", MONTHLY_OBLIGATIONS.loanPayment)]);
      post(date, "Bank & wire fees", "expense", [dr("exp_bank_fees", MONTHLY_OBLIGATIONS.bankFees), cr("cash_checking", MONTHLY_OBLIGATIONS.bankFees)]);
    }
    if (dom === 15) {
      // Amex payment: pay accumulated statement balance
      if (ccStatement > 0) {
        post(date, "Amex payment — statement balance", "cc_payment", [dr("cc_amex", ccStatement), cr("cash_checking", ccStatement)]);
        ccBalanceTracker -= ccStatement;
      }
      ccStatement = 0;
    }
    if (dom === 28) {
      ccStatement = ccBalanceTracker; // statement closes; paid on the 15th
      post(date, "Owner draw", "owner", [dr("owner_draws", MONTHLY_OBLIGATIONS.ownerDraw), cr("cash_checking", MONTHLY_OBLIGATIONS.ownerDraw)]);
    }
    // Sales tax remittance on the 20th for the previous month, per jurisdiction
    if (dom === 20) {
      const prevMk = monthKey(addDays(date, -25));
      for (const jur of Object.keys(NEXUS)) {
        const key = `${prevMk}|${jur}`;
        const owed = (taxCollectedByMonthJur.get(key) ?? 0) - (taxRefundedByMonthJur.get(key) ?? 0);
        if (owed > 0 && date <= today) {
          post(date, `Sales tax remittance — ${jur} (${prevMk})`, "tax_remit", [dr("sales_tax_payable", owed), cr("cash_checking", owed)]);
          taxPayments.push({ id: `TXP-${taxPayments.length + 1}`, kind: "sales", date, amount: owed, jurisdiction: jur, liabilityId: `STL-${prevMk}-${jur}` });
        }
      }
    }
    // Quarterly estimated income tax (owner pass-through, paid from business as draw)
    if ((mk.endsWith("-01") || mk.endsWith("-04") || mk.endsWith("-06") || mk.endsWith("-09")) && dom === 14) {
      // Deliberately a little light: leaves a visible reserve shortfall to plan against.
      const amt = 380000 + Math.round(d * 800);
      post(date, "Quarterly estimated income tax payment (owner)", "tax_payment", [dr("owner_draws", amt), cr("cash_checking", amt)]);
      taxPayments.push({ id: `TXP-${taxPayments.length + 1}`, kind: "income_estimated", date, amount: amt, jurisdiction: "Federal+State" });
    }
    // Monthly transfer to savings (cash management)
    if (dom === 25) {
      post(date, "Transfer to savings (reserve building)", "transfer", [dr("cash_savings", 250000), cr("cash_checking", 250000)]);
    }
    // Occasional one-off expenses
    if (rng() < 0.025) {
      const oneOffs: [string, string, number][] = [
        ["Photography day rate", "exp_professional", 65000],
        ["Trade show travel", "exp_travel", 88000],
        ["Packaging design", "exp_professional", 45000],
        ["Warehouse shelving", "exp_equipment", 38000],
        ["Product samples courier", "exp_shipping", 12000],
        ["Legal review", "exp_professional", 55000],
      ];
      const [memo, acct, amt] = oneOffs[Math.floor(rng() * oneOffs.length)];
      post(date, memo, "expense", [dr(acct, amt), cr("cash_checking", amt)]);
    }

    // ── Reorder check (weekly) ──
    if (d % 7 === 3 && d < N - 5) {
      for (const p of products) {
        if (p.launchedAt > date) continue;
        const spec = specFor(p.id);
        if (spec.dead) continue; // storyline: nobody reorders the dead stock
        const variants = skusByProduct.get(p.id)!;
        const stock = variants.reduce((t, s) => t + stockOf(s.id), 0);
        // recent velocity: units sold last 28 days
        let sold28 = 0;
        for (let b = Math.max(0, d - 27); b <= d; b++) {
          for (const o of ordersByDate.get(days[b]) ?? []) {
            for (const it of o.items) if (it.productId === p.id) sold28 += it.qty;
          }
        }
        const velocity = sold28 / 28;
        const daysLeft = velocity > 0 ? stock / velocity : 999;
        // Storyline: under-order the Everflask 32oz late in the window so it draws down
        // into a genuine stockout risk the recommendation engine has to act on.
        const isConstrained = p.id === "P11" && d > N - 150;
        // Reorder to ~55 days of cover past the lead time — a disciplined operator's
        // policy, not "buy as much as demand allows".
        if (daysLeft < LEAD_DAYS + 10 && velocity > 0.15) {
          const target = isConstrained ? 25 : Math.round(velocity * (LEAD_DAYS + 55));
          const onOrder = pendingPos
            .filter((pp) => pp.po.status !== "closed" && !pp.po.receivedAt)
            .reduce((q, pp) => q + pp.po.items.filter((i) => i.skuId.startsWith(p.id + "-")).reduce((s, i) => s + i.qty, 0), 0);
          const qty = Math.max(isConstrained ? 25 : 30, target - stock - onOrder);
          if (qty > 20) createPo(date, p.id, qty, LEAD_DAYS);
        }
      }
    }

    rollups.set(date, R);
  }

  // ── Recurring expense definitions (also drives the subscriptions ledger posting above) ──
  // NOTE: defined with `var`-style hoisting avoided — this array is referenced inside the loop,
  // so it is declared before via function hoisting workaround below.

  // (recurringDefs is declared before the loop in execution order — see bottom assembly)

  // ── Assemble tax liabilities per month × jurisdiction ──
  const taxLiabilities: TaxLiability[] = [];
  const monthsSeen = new Set<string>();
  for (const key of taxCollectedByMonthJur.keys()) monthsSeen.add(key);
  const remittedKeys = new Set(taxPayments.filter((t) => t.kind === "sales").map((t) => t.liabilityId));
  for (const key of [...monthsSeen].sort()) {
    const [mk, jur] = key.split("|");
    const collected = taxCollectedByMonthJur.get(key) ?? 0;
    const refunded = taxRefundedByMonthJur.get(key) ?? 0;
    const id = `STL-${mk}-${jur}`;
    const periodStart = `${mk}-01`;
    const periodEnd = addDays(`${mk}-01`, 32).slice(0, 7) + "-01";
    taxLiabilities.push({
      id, kind: "sales", jurisdiction: jur,
      periodStart, periodEnd: addDays(periodEnd, -1),
      filingDue: addDays(periodEnd, 19), paymentDue: addDays(periodEnd, 19),
      collected, refunded,
      remitted: remittedKeys.has(id) ? collected - refunded : 0,
      provenance: "imported",
    });
  }

  // ── Bank transactions from ledger cash legs ──
  const bankTx: BankTransaction[] = [];
  const CASH_TO_FIN: Record<string, string> = {
    cash_checking: "FA-CHK", cash_savings: "FA-SAV", cash_paypal: "FA-PP", cc_amex: "FA-AMEX",
  };
  const merchantFor: Record<string, string> = {
    payout: "SHOPIFY PAYMENTS", po: "WIRE — VENDOR", expense: "ACH", cc_charge: "ADS PLATFORMS",
    cc_payment: "AMEX EPAYMENT", tax_remit: "CDTFA / NYSTAX / WADOR", tax_payment: "IRS USATAXPYMT",
    transfer: "TRANSFER", owner: "OWNER", loan: "SBA LOAN SERV", bill: "3PL FULFILLMENT",
    manual: "MANUAL", opening: "OPENING", order_batch: "SHOPIFY", empty: "",
  };
  const catForSource: Record<string, string | null> = {
    payout: "revenue_deposit", po: "inventory_purchase", cc_payment: "cc_payment",
    tax_remit: "tax_payment", tax_payment: "tax_payment", transfer: "transfer",
    owner: "owner_draw", loan: "loan_payment", bill: "exp_shipping",
  };
  let txSeq = 0;
  for (const e of ledger) {
    if (e.sourceType === "opening") continue;
    for (const l of e.lines) {
      const fin = CASH_TO_FIN[l.accountId];
      if (!fin) continue;
      const isCc = l.accountId === "cc_amex";
      // For cash accounts: debit=inflow. For the credit card: credit=charge (negative), debit=payment (positive).
      const amount = isCc ? l.debit - l.credit : l.debit - l.credit;
      if (amount === 0) continue;
      const expLine = e.lines.find((x) => x.accountId.startsWith("exp_") || x.accountId.startsWith("cogs_"));
      let category: string | null = catForSource[e.sourceType] ?? (expLine ? expLine.accountId : null);
      if (e.sourceType === "expense" && expLine) category = expLine.accountId;
      if (e.sourceType === "cc_charge" && expLine) category = expLine.accountId;
      let categorizedBy: BankTransaction["categorizedBy"] = category ? "rule" : "none";
      // leave a handful of recent one-offs uncategorized for the review queue
      if (e.sourceType === "expense" && e.date > addDays(today, -21) && rng() < 0.5) {
        category = null; categorizedBy = "none";
      }
      bankTx.push({
        id: `TX${++txSeq}`, accountId: fin, date: e.date, amount,
        merchant: merchantFor[e.sourceType] ?? "ACH",
        description: e.memo, category, categorizedBy,
        isTransfer: e.sourceType === "transfer",
        reconciled: e.date < addDays(today, -7),
        linkedEntity: e.sourceId,
      });
    }
  }

  // ── Financial accounts ──
  const bal = (acct: string) => {
    let b = 0;
    for (const e of ledger) for (const l of e.lines) if (l.accountId === acct) b += l.debit - l.credit;
    return b;
  };
  const finAccounts: FinancialAccount[] = [
    { id: "FA-CHK", name: "Mercury Checking", kind: "checking", institution: "Mercury", coaAccount: "cash_checking", importedBalance: bal("cash_checking"), importedBalanceDate: today },
    { id: "FA-SAV", name: "Mercury Treasury (HYSA)", kind: "hysa", institution: "Mercury", coaAccount: "cash_savings", aprBps: 430, importedBalance: bal("cash_savings"), importedBalanceDate: today },
    { id: "FA-PP", name: "PayPal", kind: "paypal", institution: "PayPal", coaAccount: "cash_paypal", importedBalance: bal("cash_paypal"), importedBalanceDate: today },
    { id: "FA-AMEX", name: "Amex Business Gold", kind: "credit_card", institution: "American Express", coaAccount: "cc_amex", creditLimit: 3_500_000, importedBalance: bal("cc_amex"), importedBalanceDate: today, paymentDue: addDays(today, 26 - Number(today.slice(8, 10)) < 0 ? 41 : 26 - Number(today.slice(8, 10))) },
    { id: "FA-SHOP", name: "Shopify Payments (clearing)", kind: "processor", institution: "Shopify", coaAccount: "processor_clearing", importedBalance: bal("processor_clearing"), importedBalanceDate: today },
    { id: "FA-LOAN", name: "SBA Working Capital Loan", kind: "loan", institution: "Live Oak Bank", coaAccount: "loan_sba", aprBps: 875, importedBalance: bal("loan_sba"), importedBalanceDate: today },
  ];

  // ── Open bills at "today" ──
  const bills: Bill[] = [];
  // open PO balances become AP bills
  for (const po of purchaseOrders) {
    if (po.status === "received" && po.paid < po.total) {
      bills.push({
        id: `BILL-${po.id}`, vendor: po.vendor, description: `PO balance — ${po.id}`,
        category: "inventory_purchase", total: po.total - po.freight - po.duties,
        paid: po.paid - po.freight - po.duties < 0 ? 0 : po.paid - po.freight - po.duties,
        issuedAt: po.receivedAt!, dueAt: addDays(po.receivedAt!, 15),
        status: addDays(po.receivedAt!, 15) < today ? "overdue" : "open", linkedPo: po.id,
      });
    }
  }
  bills.push(
    { id: "BILL-FR1", vendor: "Flexport", description: "Ocean freight — August consolidation", category: "cogs_freight", total: 184000, paid: 0, issuedAt: addDays(today, -9), dueAt: addDays(today, 12), status: "open" },
    { id: "BILL-CT1", vendor: "Alta Creative", description: "Fall campaign content production", category: "exp_contractors", total: 240000, paid: 0, issuedAt: addDays(today, -5), dueAt: addDays(today, 16), status: "open" },
    { id: "BILL-PK1", vendor: "Packlane", description: "Mailer box restock", category: "cogs_packaging", total: 96000, paid: 0, issuedAt: addDays(today, -3), dueAt: addDays(today, 21), status: "open" },
  );

  // ── Social posts ──
  const socialPosts: SocialPost[] = [];
  const formats: SocialPost["format"][] = ["reel", "photo", "carousel", "video"];
  const subjects = ["product feature", "behind the scenes", "customer story", "lifestyle", "launch teaser", "how it's made", "founder note"];
  let followerBase = 12400;
  for (let d = 0; d < N; d += 1) {
    const date = days[d];
    if (rng() < 0.42) {
      const platform = pickWeighted(rng, ["instagram", "tiktok", "youtube"] as const, [55, 35, 10]);
      const format = platform === "instagram" ? pickWeighted(rng, formats, [45, 25, 25, 5]) : "video";
      const subject = subjects[Math.floor(rng() * subjects.length)];
      const viral = rng() < 0.04;
      const baseReach = (platform === "tiktok" ? 5200 : 2800) * (1 + d / N) * (viral ? 14 : 1) * (0.5 + rng());
      const reach = Math.round(baseReach);
      const productId = rng() < 0.6 ? products[Math.floor(rng() * products.length)].id : undefined;
      const engagement = Math.round(reach * (subject === "how it's made" ? 0.085 : 0.055) * (0.6 + rng()));
      socialPosts.push({
        id: `SP${socialPosts.length + 1}`, platform, postedAt: date, format, subject, productId,
        impressions: Math.round(reach * 1.35), reach, engagement,
        saves: Math.round(engagement * 0.3), shares: Math.round(engagement * 0.12),
        videoViews: format === "photo" ? 0 : Math.round(reach * 0.8),
        linkClicks: Math.round(reach * (subject === "product feature" ? 0.021 : 0.009)),
        followersDelta: Math.round(reach * 0.012),
      });
      followerBase += Math.round(reach * 0.012);
    }
  }

  // ── Decisions ──
  const decisions: Decision[] = [
    {
      id: "D1", date: priceIncreaseDay, title: "Raised Crosscurrent Sling price $68 → $74",
      description: "8.8% price increase on the #2 seller.", hypothesis: "Demand is inelastic below $75; margin gain outweighs volume loss.",
      expectedOutcome: "Units −5% or better, contribution profit +8%+", invested: 0,
      metrics: ["units:P02", "revenue:P02", "contribution:P02"], status: "active",
    },
    {
      id: "D2", date: addDays(today, -15), title: "Shipped new product-page template",
      description: "Redesigned PDP with new gallery and reviews layout.", hypothesis: "Richer PDP will lift conversion.",
      expectedOutcome: "PDP conversion +10%", invested: 180000,
      metrics: ["conversion:mobile", "conversion:all"], status: "active",
    },
    {
      id: "D3", date: addDays(start, 278), title: "Launched Summit Shell with $3.8k marketing budget",
      description: "Winter flagship launch.", hypothesis: "Outerwear expands winter revenue base.",
      expectedOutcome: "$40k first-30-day revenue", invested: 380000,
      metrics: ["revenue:P05"], status: "evaluated",
    },
    {
      id: "D4", date: addDays(today, -62), title: "Increased Meta prospecting budget +25%",
      description: "Scaled prospecting campaign.", hypothesis: "Efficient CAC holds at higher spend.",
      expectedOutcome: "CAC stays under $22", invested: 0,
      metrics: ["cac:meta", "roas:meta"], status: "active",
    },
    {
      id: "D5", date: addDays(start, 150), title: "Started TikTok Spark Ads",
      description: "New acquisition channel test.", hypothesis: "TikTok reaches younger audience at lower CPM.",
      expectedOutcome: "ROAS > 1.5 within 60 days", invested: 0,
      metrics: ["roas:tiktok"], status: "active",
    },
  ];

  // ── Goals / alerts / connectors ──
  const goals: Goal[] = [
    { id: "G1", metric: "net_revenue", label: "Annual Net Revenue", target: 165_000_000, period: "annual", isMoney: true },
    { id: "G2", metric: "contribution_profit", label: "Annual Contribution Profit", target: 52_000_000, period: "annual", isMoney: true },
    { id: "G3", metric: "available_cash", label: "Available Cash Floor", target: 4_000_000, period: "annual", isMoney: true },
    { id: "G4", metric: "orders", label: "Monthly Orders", target: 1400, period: "monthly", isMoney: false },
    { id: "G5", metric: "conversion", label: "Site Conversion Rate", target: 0.026, period: "monthly", isMoney: false },
  ];
  const alertConfigs: AlertConfig[] = [
    { id: "A1", label: "Daily revenue drops vs 30-day norm", metric: "net_revenue", comparator: "pct_drop", threshold: 0.30, enabled: true },
    { id: "A2", label: "Available cash floor", metric: "available_cash", comparator: "below", threshold: 2_500_000, enabled: true },
    { id: "A3", label: "Blended CAC ceiling", metric: "cac", comparator: "above", threshold: 2600, enabled: true },
    { id: "A4", label: "Conversion floor", metric: "conversion", comparator: "below", threshold: 0.02, enabled: true },
    { id: "A5", label: "Any SKU under 20 units", metric: "inventory_units", comparator: "below", threshold: 20, enabled: true },
    { id: "A6", label: "Refund rate spike", metric: "refund_rate", comparator: "above", threshold: 0.06, enabled: true },
    { id: "A7", label: "Credit utilization", metric: "cc_utilization", comparator: "above", threshold: 0.5, enabled: true },
  ];
  const connectors: ConnectorState[] = [
    { id: "demo", name: "Demo Dataset (simulated)", category: "Demo", status: "connected", lastSync: today, detail: "Deterministic simulated business — replace with live connectors below." },
    { id: "shopify", name: "Shopify", category: "Ecommerce", status: "demo", detail: "Orders, products, customers, payouts, tax. First real connector (Phase 2)." },
    { id: "stripe", name: "Stripe", category: "Payments", status: "available" },
    { id: "paypal", name: "PayPal", category: "Payments", status: "demo" },
    { id: "plaid", name: "Plaid (bank feeds)", category: "Banking", status: "available", detail: "Or import CSV statements from any bank." },
    { id: "csv", name: "CSV Import", category: "Banking", status: "available" },
    { id: "quickbooks", name: "QuickBooks", category: "Accounting", status: "available" },
    { id: "ga4", name: "Google Analytics 4", category: "Analytics", status: "demo" },
    { id: "gsc", name: "Search Console", category: "Analytics", status: "available" },
    { id: "meta", name: "Meta Ads", category: "Advertising", status: "demo" },
    { id: "googleads", name: "Google Ads", category: "Advertising", status: "demo" },
    { id: "tiktokads", name: "TikTok Ads", category: "Advertising", status: "demo" },
    { id: "klaviyo", name: "Klaviyo", category: "Email", status: "demo" },
    { id: "instagram", name: "Instagram", category: "Social", status: "demo" },
    { id: "tiktok", name: "TikTok", category: "Social", status: "demo" },
    { id: "avalara", name: "Avalara / TaxJar", category: "Sales Tax", status: "available" },
  ];

  const rules: CategorizationRule[] = [
    { pattern: "ADS PLATFORMS", category: "exp_advertising", createdBy: "system", hits: 64 },
    { pattern: "META", category: "exp_advertising", createdBy: "user", hits: 31 },
    { pattern: "ADOBE", category: "exp_software", createdBy: "user", hits: 15 },
    { pattern: "SHOPIFY PAYMENTS", category: "revenue_deposit", createdBy: "system", hits: 445 },
    { pattern: "USPS", category: "exp_shipping", createdBy: "user", hits: 8 },
    { pattern: "3PL", category: "exp_shipping", createdBy: "system", hits: 15 },
    { pattern: "IRS", category: "tax_payment", createdBy: "system", hits: 5 },
    { pattern: "WIRE — VENDOR", category: "inventory_purchase", createdBy: "system", hits: 40 },
  ];

  return {
    capabilities: ALL_CAPABILITIES,
    today, start, days, siteUpdateDay,
    products, skus, customers, orders, ordersByDate, rollups,
    lots, purchaseOrders, bills, recurring: recurringDefs, taxLiabilities, taxPayments,
    campaigns, spendDaily, trafficDaily, socialPosts, launches, decisions,
    goals, alertConfigs, finAccounts, ledger, bankTx, rules, connectors,
    incomeTaxRatePct: 25,
  };
}

// Recurring subscriptions/expenses. Declared at module level so the daily loop can read it.
// Two near-duplicate design tools are intentional (expense-intelligence storyline).
const recurringDefs: RecurringExpense[] = [
  { id: "R1", vendor: "Shopify Advanced", category: "exp_software", amount: 39900, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R2", vendor: "Klaviyo", category: "exp_software", amount: 19900, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R3", vendor: "Adobe Creative Cloud", category: "exp_software", amount: 5999, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R4", vendor: "Figma", category: "exp_software", amount: 1500, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R5", vendor: "Canva Pro", category: "exp_software", amount: 1299, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R6", vendor: "Notion", category: "exp_software", amount: 1600, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R7", vendor: "Slack", category: "exp_software", amount: 1750, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R8", vendor: "QuickBooks Online", category: "exp_software", amount: 9000, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R9", vendor: "ShipStation", category: "exp_software", amount: 9900, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R10", vendor: "Gorgias (helpdesk)", category: "exp_software", amount: 6000, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R11", vendor: "Later (social)", category: "exp_software", amount: 4000, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R12", vendor: "Buffer (social)", category: "exp_software", amount: 3500, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R13", vendor: "Google Workspace", category: "exp_software", amount: 2880, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R14", vendor: "Dropbox", category: "exp_software", amount: 1999, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
  { id: "R15", vendor: "Judge.me Reviews", category: "exp_software", amount: 1500, cadence: "monthly", nextCharge: "", active: true, startedAt: "2020-01-01" },
];
