-- Meridian normalized schema. All monetary values are INTEGER cents.
-- Provenance on derived-value tables: 'imported' | 'computed' | 'estimate' | 'manual'.

PRAGMA foreign_keys = ON;

-- ───────────────────────── Chart of accounts / ledger ─────────────────────────
CREATE TABLE accounts_coa (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','contra_revenue','cogs','expense')),
  subtype       TEXT,
  is_cash       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ledger_entries (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,               -- ISO yyyy-mm-dd
  memo          TEXT NOT NULL,
  source_type   TEXT NOT NULL,               -- order_batch | payout | po | bill | expense | tax | transfer | manual …
  source_id     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ledger_entries_date ON ledger_entries(date);

CREATE TABLE ledger_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id      TEXT NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
  account_id    TEXT NOT NULL REFERENCES accounts_coa(id),
  debit_cents   INTEGER NOT NULL DEFAULT 0,
  credit_cents  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ledger_lines_entry ON ledger_lines(entry_id);
CREATE INDEX idx_ledger_lines_account ON ledger_lines(account_id);

-- ───────────────────────── Financial accounts / transactions ─────────────────────────
CREATE TABLE financial_accounts (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('checking','savings','hysa','credit_card','processor','loan','paypal')),
  institution   TEXT,
  coa_account   TEXT REFERENCES accounts_coa(id),
  credit_limit_cents INTEGER,
  apr_bps       INTEGER,
  imported_balance_cents INTEGER,            -- statement/provider balance for reconciliation
  imported_balance_date  TEXT
);

CREATE TABLE bank_transactions (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES financial_accounts(id),
  date          TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,            -- signed: + inflow / - outflow
  merchant      TEXT,
  description   TEXT,
  category      TEXT,                        -- expense category or transfer/owner flag
  categorized_by TEXT CHECK (categorized_by IN ('rule','learned','user','none')),
  is_transfer   INTEGER NOT NULL DEFAULT 0,
  transfer_pair_id TEXT,
  reconciled    INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'manual',
  linked_entity TEXT
);
CREATE INDEX idx_bank_tx_date ON bank_transactions(date);
CREATE INDEX idx_bank_tx_account ON bank_transactions(account_id, date);

CREATE TABLE categorization_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern       TEXT NOT NULL,               -- merchant substring, case-insensitive
  category      TEXT NOT NULL,
  created_by    TEXT NOT NULL DEFAULT 'user',
  hits          INTEGER NOT NULL DEFAULT 0
);

-- ───────────────────────── Commerce ─────────────────────────
CREATE TABLE products (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  collection    TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  launched_at   TEXT
);

CREATE TABLE skus (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES products(id),
  sku           TEXT NOT NULL,
  variant       TEXT,
  price_cents   INTEGER NOT NULL,
  weight_grams  INTEGER
);
CREATE INDEX idx_skus_product ON skus(product_id);

CREATE TABLE customers (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  acquisition_channel TEXT,
  acquisition_campaign TEXT,
  region        TEXT
);

CREATE TABLE orders (
  id            TEXT PRIMARY KEY,
  customer_id   TEXT REFERENCES customers(id),
  placed_at     TEXT NOT NULL,               -- ISO datetime
  date          TEXT NOT NULL,               -- ISO date (denormalized for aggregation)
  channel       TEXT NOT NULL,               -- online | wholesale …
  traffic_source TEXT,
  device        TEXT,
  region        TEXT,
  gross_cents   INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  shipping_revenue_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents     INTEGER NOT NULL DEFAULT 0,
  refund_cents  INTEGER NOT NULL DEFAULT 0,
  refunded_at   TEXT,
  fees_cents    INTEGER NOT NULL DEFAULT 0,  -- payment processing
  cogs_cents    INTEGER NOT NULL DEFAULT 0,  -- landed cost of consumed lots
  fulfillment_cents INTEGER NOT NULL DEFAULT 0,
  is_first_order INTEGER NOT NULL DEFAULT 0,
  launch_id     TEXT
);
CREATE INDEX idx_orders_date ON orders(date);
CREATE INDEX idx_orders_customer ON orders(customer_id);

CREATE TABLE order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id        TEXT NOT NULL REFERENCES skus(id),
  qty           INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  unit_cogs_cents  INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_sku ON order_items(sku_id);

-- ───────────────────────── Inventory ─────────────────────────
CREATE TABLE purchase_orders (
  id            TEXT PRIMARY KEY,
  vendor        TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expected_at   TEXT,
  received_at   TEXT,
  status        TEXT NOT NULL CHECK (status IN ('draft','deposit_paid','in_transit','received','closed','cancelled')),
  total_cents   INTEGER NOT NULL,
  paid_cents    INTEGER NOT NULL DEFAULT 0,
  freight_cents INTEGER NOT NULL DEFAULT 0,
  duties_cents  INTEGER NOT NULL DEFAULT 0,
  allocation    TEXT NOT NULL DEFAULT 'per_unit',
  notes         TEXT
);

CREATE TABLE inventory_lots (
  id            TEXT PRIMARY KEY,
  sku_id        TEXT NOT NULL REFERENCES skus(id),
  po_id         TEXT REFERENCES purchase_orders(id),
  received_at   TEXT NOT NULL,
  qty           INTEGER NOT NULL,
  remaining_qty INTEGER NOT NULL,
  unit_mfg_cents      INTEGER NOT NULL DEFAULT 0,
  unit_packaging_cents INTEGER NOT NULL DEFAULT 0,
  unit_freight_cents  INTEGER NOT NULL DEFAULT 0,
  unit_duties_cents   INTEGER NOT NULL DEFAULT 0,
  unit_landed_cents   INTEGER NOT NULL
);
CREATE INDEX idx_lots_sku ON inventory_lots(sku_id, received_at);

CREATE TABLE inventory_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  sku_id        TEXT NOT NULL REFERENCES skus(id),
  lot_id        TEXT REFERENCES inventory_lots(id),
  qty           INTEGER NOT NULL,            -- + receipt / - sale / adjustment
  reason        TEXT NOT NULL,               -- receipt | sale | return | adjustment | shrinkage
  ref_id        TEXT
);
CREATE INDEX idx_inv_mov_sku ON inventory_movements(sku_id, date);

-- ───────────────────────── Payables / commitments ─────────────────────────
CREATE TABLE bills (
  id            TEXT PRIMARY KEY,
  vendor        TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  total_cents   INTEGER NOT NULL,
  paid_cents    INTEGER NOT NULL DEFAULT 0,
  issued_at     TEXT NOT NULL,
  due_at        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('open','partial','paid','overdue')),
  linked_po     TEXT REFERENCES purchase_orders(id)
);
CREATE INDEX idx_bills_due ON bills(due_at);

CREATE TABLE recurring_expenses (
  id            TEXT PRIMARY KEY,
  vendor        TEXT NOT NULL,
  category      TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  cadence       TEXT NOT NULL CHECK (cadence IN ('monthly','annual','weekly')),
  next_charge   TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1
);

-- ───────────────────────── Taxes ─────────────────────────
CREATE TABLE tax_liabilities (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('sales','income_reserve')),
  jurisdiction  TEXT NOT NULL,
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  filing_due    TEXT,
  payment_due   TEXT,
  collected_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents  INTEGER NOT NULL DEFAULT 0,
  remitted_cents  INTEGER NOT NULL DEFAULT 0,
  provenance    TEXT NOT NULL CHECK (provenance IN ('imported','computed','estimate','manual','confirmed'))
);

CREATE TABLE tax_payments (
  id            TEXT PRIMARY KEY,
  liability_id  TEXT REFERENCES tax_liabilities(id),
  date          TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL,
  method        TEXT
);

-- ───────────────────────── Marketing / analytics ─────────────────────────
CREATE TABLE campaigns (
  id            TEXT PRIMARY KEY,
  channel       TEXT NOT NULL,               -- meta | google | tiktok | klaviyo …
  name          TEXT NOT NULL,
  objective     TEXT,
  started_at    TEXT,
  ended_at      TEXT
);

CREATE TABLE marketing_spend_daily (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  channel       TEXT NOT NULL,
  campaign_id   TEXT REFERENCES campaigns(id),
  spend_cents   INTEGER NOT NULL,
  impressions   INTEGER NOT NULL DEFAULT 0,
  clicks        INTEGER NOT NULL DEFAULT 0,
  attributed_revenue_cents INTEGER NOT NULL DEFAULT 0,  -- platform-reported; not cross-summable
  new_customers INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_spend_date ON marketing_spend_daily(date, channel);

CREATE TABLE traffic_daily (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  source        TEXT NOT NULL,               -- direct | organic | meta | google | tiktok | email | referral
  device        TEXT NOT NULL,               -- desktop | mobile
  sessions      INTEGER NOT NULL,
  product_views INTEGER NOT NULL,
  add_to_carts  INTEGER NOT NULL,
  checkouts     INTEGER NOT NULL,
  purchases     INTEGER NOT NULL
);
CREATE INDEX idx_traffic_date ON traffic_daily(date);

CREATE TABLE social_posts (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,
  posted_at     TEXT NOT NULL,
  format        TEXT NOT NULL,               -- reel | photo | carousel | story | video
  subject       TEXT,
  product_id    TEXT REFERENCES products(id),
  impressions   INTEGER NOT NULL DEFAULT 0,
  reach         INTEGER NOT NULL DEFAULT 0,
  engagement    INTEGER NOT NULL DEFAULT 0,
  saves         INTEGER NOT NULL DEFAULT 0,
  shares        INTEGER NOT NULL DEFAULT 0,
  video_views   INTEGER NOT NULL DEFAULT 0,
  link_clicks   INTEGER NOT NULL DEFAULT 0,
  followers_delta INTEGER NOT NULL DEFAULT 0
);

-- ───────────────────────── Launches / decisions / goals / alerts ─────────────────────────
CREATE TABLE launches (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  date          TEXT NOT NULL,
  product_ids   TEXT NOT NULL,               -- JSON array
  marketing_budget_cents INTEGER NOT NULL DEFAULT 0,
  notes         TEXT
);

CREATE TABLE decisions (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  hypothesis    TEXT,
  expected_outcome TEXT,
  invested_cents INTEGER NOT NULL DEFAULT 0,
  metrics       TEXT,                        -- JSON array of metric ids to watch
  status        TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE goals (
  id            TEXT PRIMARY KEY,
  metric        TEXT NOT NULL,
  label         TEXT NOT NULL,
  target        REAL NOT NULL,
  period        TEXT NOT NULL,               -- annual | monthly
  created_at    TEXT NOT NULL
);

CREATE TABLE alerts_config (
  id            TEXT PRIMARY KEY,
  metric        TEXT NOT NULL,
  comparator    TEXT NOT NULL CHECK (comparator IN ('below','above','pct_drop','pct_rise')),
  threshold     REAL NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE alert_events (
  id            TEXT PRIMARY KEY,
  date          TEXT NOT NULL,
  severity      TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  title         TEXT NOT NULL,
  detail        TEXT,
  metric        TEXT,
  acknowledged  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE recommendation_state (
  id            TEXT PRIMARY KEY,             -- stable recommendation key
  status        TEXT NOT NULL CHECK (status IN ('open','done','ignored','remind','investigate')),
  updated_at    TEXT NOT NULL
);

-- ───────────────────────── Sync / audit ─────────────────────────
CREATE TABLE sync_state (
  connector     TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'disconnected',
  cursor        TEXT,
  last_sync_at  TEXT,
  last_error    TEXT
);

CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  actor         TEXT NOT NULL DEFAULT 'user',
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     TEXT,
  before_json   TEXT,
  after_json    TEXT
);

-- ───────────────────────── Precomputed rollups ─────────────────────────
CREATE TABLE rollup_daily (
  date          TEXT PRIMARY KEY,
  orders        INTEGER NOT NULL,
  units         INTEGER NOT NULL,
  gross_cents   INTEGER NOT NULL,
  discounts_cents INTEGER NOT NULL,
  refunds_cents INTEGER NOT NULL,
  shipping_rev_cents INTEGER NOT NULL,
  tax_collected_cents INTEGER NOT NULL,
  fees_cents    INTEGER NOT NULL,
  cogs_cents    INTEGER NOT NULL,
  fulfillment_cents INTEGER NOT NULL,
  ad_spend_cents INTEGER NOT NULL,
  sessions      INTEGER NOT NULL,
  new_customers INTEGER NOT NULL
);
