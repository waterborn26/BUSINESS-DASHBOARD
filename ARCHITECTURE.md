# Meridian — Architecture

**Meridian** is a native-feeling macOS desktop application that acts as a full business
intelligence, financial management, forecasting, and decision-support system for a small
e-commerce brand. It answers: *what is happening, why, where is my money, what do I owe,
what happens next, and what should I do about it.*

---

## 1–2. Technology Stack & Rationale

| Layer | Choice |
|---|---|
| Desktop shell | **Tauri 2** (Rust) |
| UI | **React 19 + TypeScript**, custom SVG chart library (zero chart deps) |
| Local database | **SQLite** (via `tauri-plugin-sql`; schema in `src-tauri/migrations`) |
| Secrets | **macOS Keychain** via the Rust `keyring` crate (never in the DB or config) |
| Financial/analytics engines | Pure TypeScript modules (framework-free, unit-testable) |
| Background sync | Tauri async Rust tasks + a TS sync scheduler per connector |
| AI layer | Provider-agnostic adapter (Claude API first), fed *structured computed context*, never raw data |

**Why Tauri + React/TS over Swift/SwiftUI:**

1. **Connector gravity.** This app is 60% integrations (Shopify, Stripe, Plaid, Meta, GA4,
   Klaviyo…). Every one of those has first-class HTTP/OAuth tooling and community SDKs in
   the TS ecosystem; Swift has almost none. Connectors are the long-term maintenance load.
2. **One language for business logic.** Ledger, analytics, forecasting, and recommendation
   engines are pure TS modules with no UI imports — testable with Vitest, reusable later in
   a cloud-sync backend unchanged.
3. **Visualization control.** Bloomberg/Stripe-grade density needs a purpose-built chart
   layer. SVG + React gives pixel-level control; Swift Charts does not.
4. **Native feel is preserved.** Tauri uses the system WKWebView (small binary, low memory),
   native window chrome, native menu bar, Keychain, notifications. With correct typography
   (SF Pro stack), vibrancy-style surfaces, and keyboard-first UX, it is indistinguishable
   from native for a data-dense tool (cf. Linear, Raycast companion apps).
5. **Rust core for the sensitive parts.** SQLite access, credential storage, and future
   background sync daemons live in Rust — memory-safe and fast.

Trade-off accepted: slightly less "free" macOS behavior than SwiftUI (we re-implement some
patterns), in exchange for 10× velocity on integrations, analytics, and charts.

---

## 3. System Architecture

Strict one-way layering. UI never computes money; engines never touch UI.

```
┌─────────────────────────────────────────────┐
│ UI (React pages + chart library)            │  renders ViewModels only
├─────────────────────────────────────────────┤
│ Application / State layer                   │  global date range, filters, palette,
│  (AppContext, router, keyboard, drilldown)  │  selection, drilldown stack
├─────────────────────────────────────────────┤
│ Business logic (selectors / view-models)    │  composes engine output per screen
├─────────────────────────────────────────────┤
│ Financial Ledger / Accounting engine        │  double-entry postings, trial balance,
│                                             │  P&L, balance sheet, available cash
├─────────────────────────────────────────────┤
│ Analytics engine                            │  time series, comparisons, cohorts,
│                                             │  funnels, product/customer/channel stats
├─────────────────────────────────────────────┤
│ Forecasting engine                          │  decomposition forecast + uncertainty bands
├─────────────────────────────────────────────┤
│ Recommendation / Insight engine             │  anomalies, trends, opportunities,
│                                             │  prioritization (impact×confidence×urgency÷difficulty)
├─────────────────────────────────────────────┤
│ Normalized data layer (repositories)        │  entity access, aggregation, caching
├─────────────────────────────────────────────┤
│ Connector layer (modular)                   │  Connector interface: auth → pull →
│                                             │  normalize → upsert → checkpoint
├─────────────────────────────────────────────┤
│ External APIs / CSV / manual input          │
└─────────────────────────────────────────────┘
```

All money is **integer cents**. All derived numbers carry a **provenance tag**:
`imported` (authoritative from a provider), `computed` (deterministic from imported data),
`estimate` (model output), `manual` (user-entered). The UI renders estimates visually
distinct and every figure is drillable to its inputs.

---

## 4. Database Schema (SQLite)

Normalized entities (see `src-tauri/migrations/0001_init.sql` for full DDL). Key tables:

- **financial_accounts** (bank, savings, credit card, processor balance, loan) — balance is
  *derived* from ledger, stored balance is the imported statement value for reconciliation.
- **ledger_entries** / **ledger_lines** — double-entry journal (see §5).
- **accounts_coa** — chart of accounts (type: asset/liability/equity/revenue/contra-revenue/cogs/expense).
- **orders**, **order_items**, **customers**, **products**, **skus**.
- **inventory_lots** (qty, remaining_qty, landed unit cost components), **inventory_movements**.
- **purchase_orders** (+ payments: deposit/balance), **bills** (AP), **recurring_expenses**.
- **tax_liabilities** (jurisdiction, period, collected, remitted, source: imported/estimate/confirmed),
  **tax_payments**.
- **marketing_spend** (daily × channel × campaign), **campaigns**.
- **traffic_daily** (sessions × channel × device, funnel steps), **social_posts** + metrics.
- **launches**, **decisions** (decision journal), **goals**, **alerts_config**, **alert_events**.
- **categorization_rules** (merchant pattern → category, learned from user corrections).
- **sync_state** (connector, cursor, last_sync, status), **audit_log** (every mutation).

Indexes on every (date), (entity_id, date), and foreign key. Precomputed **daily rollup
tables** (`rollup_daily`: revenue, orders, units, sessions, spend, cogs, refunds …) keep
year-scale queries O(365) instead of O(orders).

In this repository the schema also exists as TypeScript domain types (`src/domain/types.ts`);
the in-memory store implements the same repository interface the SQLite adapter uses, so
the demo dataset and a real database are interchangeable behind `DataStore`.

## 5. Financial Ledger Architecture

Proper double-entry, hidden behind a simple UI:

- `LedgerEntry { id, date, memo, sourceType, sourceId, lines[] }`
- `LedgerLine { accountId, debitCents, creditCents }` — every entry balances (∑debit = ∑credit),
  enforced at posting time.
- Chart of accounts follows the spec: Assets (Cash/Checking/Savings/AR/Inventory/Equipment),
  Liabilities (CC/AP/Sales Tax Payable/Income Tax Reserve/Loans), Equity (Contributions/
  Draws/Retained Earnings), Revenue + Contra-revenue, COGS, Expenses (full category list).
- Canonical postings:
  - **Sale**: Dr Processor Clearing (AR) / Cr Product Revenue, Cr Shipping Revenue, Cr Sales Tax Payable; Dr Processing Fees / Cr Clearing; Dr COGS / Cr Inventory (landed cost of units).
  - **Payout**: Dr Checking / Cr Processor Clearing.
  - **Refund**: Dr Refunds (contra) + Dr Sales Tax Payable / Cr Clearing; optional inventory restock reversal.
  - **Inventory purchase**: Dr Inventory / Cr Cash or AP (never an expense).
  - **Expense**: Dr Expense / Cr Cash or Credit Card.
  - **Tax remittance**: Dr Sales Tax Payable / Cr Checking.
- P&L, balance sheet, cash-flow statement, and **Available Cash** are all *queries over the
  ledger* — a single source of financial truth. Available Cash =
  cash asset accounts − sales tax payable − income tax reserve − credit card balances −
  open AP − remaining PO commitments − next-30-day recurring obligations.

## 6. Transactions & Reconciliation

- Every bank/CC transaction is imported raw, then categorized (rules engine → learned
  merchant map → user override; every auto-categorization is `reviewable`).
- Splits, transfers (matched pairs excluded from P&L), owner draws/contributions supported.
- **Reconciliation**: for each payout period, compare `Shopify sales − refunds − fees − tax`
  vs processor payout vs bank deposit. Differences beyond a tolerance are flagged with the
  exact legs that disagree. Account-level: ledger balance vs imported statement balance.

## 7. Inventory Accounting

Cash → Inventory (asset) → Sale → COGS → Gross Profit. FIFO lot tracking:
each PO receipt creates a lot with **landed unit cost** = manufacturing + packaging +
freight + duties + inspection, allocated per-unit / by-weight / by-value / manual.
Selling consumes lots FIFO; COGS is posted at the consumed lots' landed cost. Inventory
valuation = ∑ remaining lot qty × landed cost. Stockout projection uses blended velocity
(weighted 14/30/90-day) adjusted for seasonality and planned launches; reorder
recommendations are **cash-aware** (checked against projected available cash and tax reserves).

## 8. Sales Tax Architecture

Tax data is stratified by trust: `imported` (from Shopify/provider — authoritative),
`estimate` (computed), `confirmed` (user). The app **never invents rates**. Per
jurisdiction × filing period: collected, refund adjustments, remitted, remaining due,
filing/payment dates. Liability feeds Available Cash. Alerts on deadlines, reserve
shortfalls, and collected-vs-expected divergence. Income tax planning is estimate-only,
labeled "ESTIMATES FOR PLANNING — NOT TAX FILING ADVICE", driven by a user-entered
effective rate.

## 9. Connector Architecture

```ts
interface Connector {
  id: string;                    // "shopify", "plaid", "meta-ads", "csv-bank"…
  auth: OAuthSpec | ApiKeySpec | FileSpec;   // credentials -> Keychain
  entities: EntityKind[];        // what it can populate
  sync(ctx: SyncContext): Promise<SyncResult>;  // incremental: uses cursor/checkpoint
}
```

Connectors normalize provider payloads into the canonical entities and **never** feed the
UI directly. Sync is incremental (updated_at cursors / webhook backfill), paginated, rate-limit
aware, and recorded in `sync_state`. Phase order: demo dataset → Shopify → Plaid/CSV bank →
GA4 + ad platforms → tax/accounting → social.

## 10. Analytics Engine

Pure functions over the store: time-series builder (any metric × any grain), period
comparison (vs yesterday/7d/30d/YoY/forecast/target), product & SKU economics (true
contribution margin after fees/shipping/ad allocation), customer cohorts & segments
(RFM-style), channel efficiency (MER, blended/new CAC, contribution ROAS), funnel analysis,
expense composition/growth, "where did my money go" cash-movement decomposition. Daily
rollups are precomputed once per data change and memoized.

## 11. Forecasting

Classical decomposition (no black box): trend (robust linear regression on recent window) ×
weekday seasonality × annual seasonality index, with residual σ producing 80% uncertainty
bands that widen with horizon. Cash forecast = deterministic schedule of knowns (POs, bills,
recurring, tax dates, CC payments) + revenue forecast net of settlement lag. Every forecast
is labeled `estimate` and shows its inputs.

## 12. Recommendation Engine

Detectors (stockout risk, reorder, price test, CAC drift, conversion drop, subscription
waste, tax reserve shortfall, cash threshold, dead stock, bundle affinity…) emit
`Recommendation { action, reason, evidence[], impactCents, confidence, urgency, difficulty }`.
Priority = **impact × confidence × urgency ÷ difficulty**. User can mark Done / Ignore /
Remind / Investigate; state persists and feeds the Decision Journal.

## 13. AI Analysis Architecture

`Database → deterministic engines → structured context builder → LLM adapter`.
The LLM (provider-pluggable; Claude first) receives computed metrics, deltas, detected
anomalies, and evidence — never raw rows, never does arithmetic, never invents tax
figures. Used for: briefing prose, anomaly explanation, Q&A over computed answers,
strategic summarization. Offline/demo mode uses a deterministic template composer so the
app is fully functional without a key (implemented in `src/engines/briefing.ts`).

## 14–15. Sitemap & Screens

27 sections (Command Center; Sales; Finance & Money; Transactions; P&L; Cash Flow; Taxes;
Expenses; Accounts; Payables; Products; Inventory; Customers; Marketing; Website;
Content/Social; Launches; Forecasting; Trends; Opportunities; Alerts; Goals; Reports; Data
Sources; Reconciliation; Decision Journal; Settings) — described inline in
`src/pages/*` and reachable via sidebar or ⌘K palette. Command Center = daily briefing,
KPI grid with comparisons, What Changed / Why / What Next / Where Is My Money / What Should
I Do. Finance = Total Cash → deductions → Available Cash waterfall + 30–365d cash outlook +
"Where did my money go".

## 16–17. MVP vs Later

**MVP (this repo, Phase 1):** full architecture, all 27 screens functional against a rich
simulated dataset; ledger, analytics, forecasting, recommendations, reconciliation,
scenario modeling, command palette, explainability drilldowns, reports.
**Later:** real connectors (Shopify first), Plaid, ad/analytics APIs, LLM API wiring,
cloud sync, multi-entity, notifications daemon, CSV import UI polish, price-elasticity
estimation (needs ≥ several price changes of history).

## 18. API Limitations (known)

- **Plaid**: paid, requires approval; fallback = CSV/OFX import (built into design).
- **GA4**: quota limits; daily aggregates only — no user-level joins.
- **Meta/TikTok**: attribution windows differ from GA/Shopify — never sum "attributed
  revenue" across platforms; use MER as the blended truth.
- **Shopify**: API versioning quarterly; payouts API needs Shopify Payments; costs on
  variants are optional fields merchants often leave empty (hence manual COGS entry).
- **Instagram**: personal profiles limited; business account + FB app review required.
- **Banks without Plaid**: CSV only.

## 19. Financial/Accounting Risks

- Cash-basis vs accrual mismatch → we run an accrual-style ledger with a cash view; both
  visible, never mixed silently.
- Landed cost allocation error compounds into COGS → allocation method stored per PO,
  editable, with audit history.
- Sales tax under-reserve → liability computed only from imported/confirmed data; estimates
  flagged; reserve alerts.
- Refund/chargeback timing crossing periods → posted on event date with link to original.
- Processor clearing balances (money in transit) must not be double-counted as cash → own
  asset account, reconciled against payouts.
- The LLM must never be the accounting engine → enforced by architecture (LLM sees only
  computed context).

## 20. Project Structure

```
src-tauri/            Rust shell: window, menu, SQLite plugin, Keychain commands
  migrations/         SQL schema (source of truth for the persistent store)
src/
  main.tsx, App.tsx   entry + layout shell
  styles/             design tokens, global CSS (dark-first)
  lib/                pure utilities (money, dates, PRNG, stats, format)
  domain/             entity types + chart of accounts
  data/               DataStore interface, in-memory store, demo dataset generator
  engines/            ledger, cash, pnl, cashflow, analytics, inventory, customers,
                      marketing, forecast, anomaly, recommend, health, reconcile,
                      scenario, briefing, launches
  state/              AppContext (date range, filters, drilldown, palette)
  components/         ui/ (KPI, tables, money, badges, explain popover)
                      charts/ (line, area+bands, bars, waterfall, funnel, donut, heatmap)
                      layout/ (sidebar, topbar, command palette)
  pages/              one module per section (27)
```
