// Canonical normalized entities. Every connector (Shopify, Plaid, Meta, …) and the
// demo generator produce these shapes; every engine consumes only these shapes.
// All money is integer cents. All dates are ISO `yyyy-mm-dd`.

/** Where a number came from — rendered distinctly throughout the UI. */
export type Provenance = "imported" | "computed" | "estimate" | "manual" | "confirmed";

// ───────── Ledger ─────────

export type CoaType =
  | "asset" | "liability" | "equity"
  | "revenue" | "contra_revenue" | "cogs" | "expense";

export interface CoaAccount {
  id: string;
  name: string;
  type: CoaType;
  subtype?: string;
  isCash?: boolean; // counts toward "Total Cash"
}

export interface LedgerLine {
  accountId: string;
  debit: number;  // cents
  credit: number; // cents
}

export type LedgerSource =
  | "order_batch" | "payout" | "po" | "bill" | "expense" | "cc_charge" | "cc_payment"
  | "tax_remit" | "tax_payment" | "transfer" | "owner" | "loan" | "manual" | "opening";

export interface LedgerEntry {
  id: string;
  date: string;
  memo: string;
  sourceType: LedgerSource;
  sourceId?: string;
  lines: LedgerLine[];
}

// ───────── Financial accounts / transactions ─────────

export type FinAccountKind = "checking" | "savings" | "hysa" | "credit_card" | "processor" | "loan" | "paypal";

export interface FinancialAccount {
  id: string;
  name: string;
  kind: FinAccountKind;
  institution: string;
  coaAccount: string;         // ledger account this maps to
  creditLimit?: number;
  aprBps?: number;
  importedBalance?: number;   // provider-reported, for reconciliation
  importedBalanceDate?: string;
  paymentDue?: string;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  date: string;
  amount: number;             // signed cents: + inflow, − outflow
  merchant: string;
  description: string;
  category: string | null;    // expense category id or special: transfer / owner_draw / owner_contribution / revenue_deposit
  categorizedBy: "rule" | "learned" | "user" | "none";
  isTransfer: boolean;
  reconciled: boolean;
  notes?: string;
  linkedEntity?: string;
}

export interface CategorizationRule {
  pattern: string;
  category: string;
  createdBy: "user" | "system";
  hits: number;
}

// ───────── Commerce ─────────

export interface Product {
  id: string;
  name: string;
  collection: string;
  status: "active" | "discontinued";
  launchedAt: string;
}

export interface Sku {
  id: string;
  productId: string;
  sku: string;
  variant: string;
  price: number; // current retail, cents
}

export interface Customer {
  id: string;
  createdAt: string;
  acquisitionChannel: string;
  region: string;
  orderCount: number;   // denormalized for speed
  totalSpent: number;   // net revenue cents
  firstOrderAt: string;
  lastOrderAt: string;
}

export interface OrderItem {
  skuId: string;
  productId: string;
  qty: number;
  unitPrice: number;
  unitCogs: number; // landed cost consumed FIFO at sale time
}

export interface Order {
  id: string;
  customerId: string;
  date: string;
  hour: number;
  channel: string;        // online | wholesale
  trafficSource: string;  // direct | organic | meta | google | tiktok | email | referral
  device: "desktop" | "mobile";
  region: string;
  items: OrderItem[];
  gross: number;          // sum of item price×qty, before discounts
  discount: number;
  shippingRevenue: number;
  tax: number;            // sales tax collected (imported provenance in real mode)
  refund: number;         // 0 or refunded amount (product portion)
  refundedAt?: string;
  fees: number;           // payment processing
  cogs: number;
  fulfillment: number;    // pick/pack/ship cost
  isFirstOrder: boolean;
  launchId?: string;
}

// ───────── Inventory ─────────

export interface InventoryLot {
  id: string;
  skuId: string;
  poId?: string;
  receivedAt: string;
  qty: number;
  remainingQty: number;
  unitMfg: number;
  unitPackaging: number;
  unitFreight: number;
  unitDuties: number;
  unitLanded: number;
}

export interface PurchaseOrder {
  id: string;
  vendor: string;
  createdAt: string;
  expectedAt: string;
  receivedAt?: string;
  status: "deposit_paid" | "in_transit" | "received" | "closed";
  total: number;
  paid: number;
  freight: number;
  duties: number;
  allocation: "per_unit" | "by_weight" | "by_value" | "manual";
  items: { skuId: string; qty: number; unitCost: number }[];
}

// ───────── Payables ─────────

export interface Bill {
  id: string;
  vendor: string;
  description: string;
  category: string;
  total: number;
  paid: number;
  issuedAt: string;
  dueAt: string;
  status: "open" | "partial" | "paid" | "overdue";
  linkedPo?: string;
}

export interface RecurringExpense {
  id: string;
  vendor: string;
  category: string;
  amount: number;
  cadence: "monthly" | "annual";
  nextCharge: string;
  active: boolean;
  startedAt: string;
}

// ───────── Taxes ─────────

export interface TaxLiability {
  id: string;
  kind: "sales";
  jurisdiction: string;   // e.g. "CA", "NY"
  periodStart: string;
  periodEnd: string;
  filingDue: string;
  paymentDue: string;
  collected: number;
  refunded: number;
  remitted: number;
  provenance: Provenance;
}

export interface TaxPayment {
  id: string;
  liabilityId?: string;
  kind: "sales" | "income_estimated";
  date: string;
  amount: number;
  jurisdiction: string;
}

// ───────── Marketing / analytics ─────────

export interface Campaign {
  id: string;
  channel: string;
  name: string;
  objective: string;
  startedAt: string;
  endedAt?: string;
}

export interface MarketingSpendDaily {
  date: string;
  channel: string;      // meta | google | tiktok | email
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  attributedRevenue: number; // platform-reported — never cross-summed
  newCustomers: number;
}

export interface TrafficDaily {
  date: string;
  source: string;
  device: "desktop" | "mobile";
  sessions: number;
  productViews: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
}

export interface SocialPost {
  id: string;
  platform: "instagram" | "tiktok" | "youtube";
  postedAt: string;
  format: "reel" | "photo" | "carousel" | "video";
  subject: string;
  productId?: string;
  impressions: number;
  reach: number;
  engagement: number;
  saves: number;
  shares: number;
  videoViews: number;
  linkClicks: number;
  followersDelta: number;
}

// ───────── Launches / decisions / goals ─────────

export interface Launch {
  id: string;
  name: string;
  date: string;
  productIds: string[];
  marketingBudget: number;
  notes: string;
}

export interface Decision {
  id: string;
  date: string;
  title: string;
  description: string;
  hypothesis: string;
  expectedOutcome: string;
  invested: number;
  metrics: string[];
  status: "active" | "evaluated";
}

export interface Goal {
  id: string;
  metric: string;   // metric id understood by the analytics engine
  label: string;
  target: number;   // cents for money metrics, plain number otherwise
  period: "annual" | "monthly";
  isMoney: boolean;
}

export interface AlertConfig {
  id: string;
  label: string;
  metric: string;
  comparator: "below" | "above" | "pct_drop" | "pct_rise";
  threshold: number;
  enabled: boolean;
}

// ───────── Daily rollup (precomputed) ─────────

export interface RollupDay {
  date: string;
  orders: number;
  units: number;
  gross: number;
  discounts: number;
  refunds: number;
  shippingRev: number;
  taxCollected: number;
  fees: number;
  cogs: number;
  fulfillment: number;
  adSpend: number;
  sessions: number;
  newCustomers: number;
}

// ───────── Sync metadata ─────────

export interface ConnectorState {
  id: string;
  name: string;
  category: string;
  status: "connected" | "demo" | "available" | "error";
  lastSync?: string;
  detail?: string;
}
