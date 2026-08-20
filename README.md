# Meridian

A native-feeling macOS desktop application that acts as the CFO, accountant, analyst,
inventory planner, and growth strategist for a small consumer/e-commerce brand.

Meridian is built around one hierarchy — **data → understanding → insight → prediction →
action** — and is designed to answer five questions the moment you open it:

> What is happening in my business, why is it happening, where is my money,
> what is likely to happen next, and what should I do about it?

---

## The distinction the whole app is built on

Most dashboards show you a bank balance. Meridian never confuses **money that exists**
with **money you can actually spend**:

```
TOTAL CASH                     $100,479
  − Sales tax payable           −$3,042   (imported — collected, not yours)
  − Est. income tax reserve    −$13,220   (estimate, 25% of YTD profit less payments)
  − Credit card balance        −$15,906
  − Vendor bills payable       −$16,969
  − Committed purchase orders  −$13,949
  − Next-30-day obligations    −$12,857
= AVAILABLE OPERATING CASH      $24,537
```

Revenue, gross profit, contribution profit, operating profit, cash, and available cash
are treated as six different numbers, never as synonyms.

## Running it

```bash
npm install
npm run dev          # UI in the browser at localhost:1420
npm run tauri dev    # full macOS desktop app (requires the Rust toolchain)
npm test             # 33 financial-correctness tests
npm run build        # production bundle
```

The app ships with a **deterministic simulated business** — 445 days of a real-feeling
brand — so every screen is fully populated before a single API key is entered.

## Architecture in one screen

Strict one-way layering; the UI never computes money and the LLM is never the accounting
engine. Full detail in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

```
UI (React + custom SVG charts)
  ↓  Application state (date range, filters, drilldown, palette)
  ↓  Business logic / view-models
  ↓  Financial ledger  ← double-entry, the single source of financial truth
  ↓  Analytics · Forecasting · Recommendation engines
  ↓  Normalized data layer
  ↓  Connector layer (Shopify, Plaid, Stripe, GA4, Meta, Klaviyo, …)
```

**Stack:** Tauri 2 (Rust shell) + React 19 + TypeScript + SQLite, with credentials in the
macOS Keychain and a purpose-built SVG chart layer. Chosen because this app is mostly
integrations, financial logic, and dense visualization — see ARCHITECTURE.md §1–2 for the
full rationale against Swift/SwiftUI.

## What is actually built

All 27 sections are functional against the simulated dataset:

| Area | Screens |
|---|---|
| Overview | Command Center, Sales |
| Money | Finance & Money, Transactions, P&L, Cash Flow, Taxes, Expenses, Accounts, Payables |
| Operations | Products, Inventory, Customers |
| Growth | Marketing, Website, Content/Social, Launches |
| Intelligence | Forecasting, What If, Trends, Opportunities, Alerts, Goals, Ask the Analyst, Reports |
| System | Data Sources, Reconciliation, Decision Journal, Settings |

Highlights:

- **Command Center** — daily briefing, 18 KPIs with comparisons, what changed / why /
  what's next / where is my money / **what should I do**, ranked by
  `impact × confidence × urgency ÷ difficulty`.
- **Double-entry ledger** — every sale, fee, refund, payout, PO, bill, tax remittance and
  owner draw is a balanced journal entry. Trial balance is asserted to be exactly zero.
- **Inventory accounting** — FIFO lots with landed cost (manufacturing + packaging +
  freight + duties). Cash → Inventory asset → sale → COGS → gross profit. Buying $10k of
  product is never shown as a $10k loss.
- **Cash-aware reorder planning** — recommends what demand supports *and* what cash
  supports, and reframes an unfundable reorder as a financing problem rather than
  printing "order 0 units".
- **Forecasting** — transparent trend × weekday decomposition with 80% uncertainty bands
  that widen as √variance, never a black box.
- **Explainability** — every headline number has a "Why?" that opens its inputs.
- **Provenance** — every figure is labeled `imported`, computed, or `estimate`, and
  estimates never silently mix with actuals.

## Financial correctness is tested, not asserted

`npm test` runs 33 tests covering ledger integrity, business plausibility, forecast
behavior, scenario modelling, and every demo storyline:

- trial balance is exactly 0; cash-flow statement ties opening + O + I + F = closing
- ledger revenue and COGS reconcile to order rollups; settlements reconcile to payouts
- gross margin 55–75%, operating margin 3–22%, inventory 1.5–5 months of COGS
- buying inventory moves cash but **never** profit
- a price rise lifts revenue by less than the price (units fall) but lifts margin
- the forecast never double-counts commitments into negative available cash
- the briefing never claims "performance is strong" while revenue is falling
- no recommendation ever proposes a zero-quantity action

## Honest limitations

- Connectors are **architected but not wired** — this is Phase 1. The demo dataset
  implements the same `DataStore` interface a live SQLite/Shopify feed would.
- The AI layer runs a deterministic composer in demo mode; the LLM adapter receives the
  same *computed* context (never raw rows, never arithmetic).
- Income tax figures are planning estimates from a user-entered rate, explicitly labeled
  **ESTIMATES FOR PLANNING — NOT TAX FILING ADVICE**. Meridian assists with financial
  decision-making; it does not replace an accountant for filings.
