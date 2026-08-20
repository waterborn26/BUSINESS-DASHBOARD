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

## Getting it on your Mac

The code lives on the branch `claude/ecommerce-bi-dashboard-zyabvf`. Nothing is running
anywhere you can reach yet — you run it locally.

```bash
git clone https://github.com/waterborn26/BUSINESS-DASHBOARD.git
cd BUSINESS-DASHBOARD
git checkout claude/ecommerce-bi-dashboard-zyabvf
npm install
```

### Fastest look — in a browser (no Rust needed)

```bash
npm run dev          # → http://localhost:1420
```

Everything works here: all 27 screens, the demo dataset, ⌘K, drilldowns, both themes.
This is the quickest way to see it.

### The actual macOS desktop app

Needs the Rust toolchain once:

```bash
xcode-select --install                                   # Apple build tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust
```

Then:

```bash
npm run tauri dev     # live desktop app with hot reload
npm run tauri build   # produces a real .app + .dmg
```

The built app lands in `src-tauri/target/release/bundle/` — `macos/Meridian.app`
(drag to Applications) and `dmg/Meridian_0.1.0_aarch64.dmg`.

The first `tauri build` compiles the whole Rust dependency tree and takes several
minutes; later builds are fast. The app is unsigned, so the first launch needs
right-click → Open (or System Settings → Privacy & Security → Open Anyway).

### Other commands

```bash
npm test         # 39 financial-correctness tests
npm run typecheck
npm run build    # production web bundle
```

## Two datasets

The top-bar selector switches between:

- **WaterBorn Workshop** — your real Shopify history. 811 orders and $51,838 gross since
  Aug 2023, reconciled to Shopify's own reported totals. This is the default.
- **Demo dataset** — a fully-connected simulated brand, useful for seeing every feature
  populated.

### Absence of data is not zero

Shopify reports what you sold. It does not report bank balances, product costs, web
sessions or ad spend — so on the real dataset those are **unknown**, and Meridian says so
rather than computing a confident number from nothing. Each dataset declares its
`Capabilities`, and every metric downstream respects them:

| Missing input | What Meridian refuses to state |
|---|---|
| Bank / card | Cash, available cash, runway, cash-flow forecast |
| Product costs | Gross profit, margin, contribution, true product ranking |
| Web analytics | Sessions, conversion rate, funnel |
| Ad platforms | CAC, ROAS, MER |
| Line quantities | Units sold, items per order |

The business-health gauge scores only measurable components, renormalises, and reports
its coverage — reading **PARTIAL**, not **HEALTH**, when the picture is incomplete.

This exists because an earlier build, pointed at a store with no bank feed, cheerfully
reported *"available cash −$13,096"* and *"contribution margin 100%"*. Both were
arithmetic on nothing. Tests now pin every one of those cases.

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

- **Command Center** — a health gauge and briefing, one hero figure (available cash) with
  its composition meter, stat tiles carrying 30-day trend, what changed / why / what's
  next / where is my money / **what should I do** ranked by
  `impact × confidence × urgency ÷ difficulty`, and all 28 KPIs grouped below.
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

`npm test` runs 60 tests covering ledger integrity, business plausibility, forecast
behavior, scenario modelling, and every demo storyline:

- trial balance is exactly 0; cash-flow statement ties opening + O + I + F = closing
- ledger revenue and COGS reconcile to order rollups; settlements reconcile to payouts
- gross margin 55–75%, operating margin 3–22%, inventory 1.5–5 months of COGS
- buying inventory moves cash but **never** profit
- a price rise lifts revenue by less than the price (units fall) but lifts margin
- the forecast never double-counts commitments into negative available cash
- the briefing never claims "performance is strong" while revenue is falling
- no recommendation ever proposes a zero-quantity action
- an inverted metric (ad spend, CAC, refunds) is never praised for moving the wrong way
- on the real dataset: no NaN or Infinity anywhere, available cash is never a fabricated
  deficit, the briefing never claims a margin without costs, the analyst declines the
  cash question rather than answering it wrongly, order count is never passed off as a
  unit count — and the complete demo dataset still answers all of them

The Rust shell compiles clean and the SQLite migration applies (32 tables, 15 indexes);
both were verified on Linux, where Tauri needs GTK/WebKit. The macOS `.app`/`.dmg`
bundling step itself can only be exercised on a Mac.

## Honest limitations

- Connectors are **architected but not wired** — this is Phase 1. The demo dataset
  implements the same `DataStore` interface a live SQLite/Shopify feed would.
- The AI layer runs a deterministic composer in demo mode; the LLM adapter receives the
  same *computed* context (never raw rows, never arithmetic).
- Income tax figures are planning estimates from a user-entered rate, explicitly labeled
  **ESTIMATES FOR PLANNING — NOT TAX FILING ADVICE**. Meridian assists with financial
  decision-making; it does not replace an accountant for filings.
