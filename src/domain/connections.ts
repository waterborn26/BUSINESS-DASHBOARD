// The connection catalogue.
//
// One honest claim per source: what it would unlock, and what it actually takes to
// wire it up. The distinction that matters is `effort`:
//
//   "ready"   — a token or a file is all it needs. No third-party review, no server.
//   "build"   — real work in this codebase, but nothing outside it blocks it.
//   "gated"   — blocked on someone else: an app review, a paid plan, a backend to
//               hold a redirect URI. Weeks, and not all of them in our hands.
//
// A source is never listed as available when it is gated. That is the difference
// between a roadmap and a lie.

export type ConnectionEffort = "ready" | "build" | "gated";
export type ConnectionState = "connected" | "partial" | "none";

export interface ConnectionSpec {
  id: string;
  name: string;
  group: string;
  state: ConnectionState;
  effort: ConnectionEffort;
  /** What the dashboard can say once this is in. */
  unlocks: string;
  /** What has to happen, in the user's terms — not ours. */
  requires: string;
  /** Capability keys this feeds, for the coverage count. */
  feeds: string[];
}

export const CONNECTIONS: ConnectionSpec[] = [
  // ── Commerce ────────────────────────────────────────────
  {
    id: "shopify-orders", name: "Shopify — orders & revenue", group: "Commerce",
    state: "connected", effort: "ready",
    unlocks: "Revenue, orders, discounts, refunds, shipping, sales tax, products, channels.",
    requires: "Already flowing. Currently refreshed by hand, not on a schedule — see Live sync below.",
    feeds: ["sales"],
  },
  {
    id: "shopify-costs", name: "Shopify — product costs", group: "Commerce",
    state: "partial", effort: "ready",
    unlocks: "COGS, gross profit, margin, contribution, true product ranking.",
    requires: "Cost per item is set on about 75% of sales. The gap is mostly revenue sold under deleted products, which can never carry a cost. Fill in costs on the rest in Shopify.",
    feeds: ["cogs"],
  },
  {
    id: "shopify-live", name: "Shopify — live sync", group: "Commerce",
    state: "none", effort: "build",
    unlocks: "Numbers that are current without anyone pulling them. Removes the staleness that makes totals disagree.",
    requires: "A custom app in your Shopify admin and an Admin API token pasted in once. The token lives in the macOS Keychain. No OAuth round trip, no server.",
    feeds: ["sales", "cogs", "inventory", "units"],
  },
  {
    id: "shopify-inventory", name: "Shopify — stock levels", group: "Commerce",
    state: "none", effort: "build",
    unlocks: "Stock on hand, days of supply, stockout warnings, reorder planning.",
    requires: "Same Admin API token as live sync.",
    feeds: ["inventory", "units"],
  },

  // ── Money ───────────────────────────────────────────────
  {
    id: "bank-csv", name: "Bank & card — CSV import", group: "Money",
    state: "none", effort: "ready",
    unlocks: "Cash on hand, available cash, runway, the cash-flow forecast, operating expenses, real operating profit — and an income-tax estimate that is not just a ceiling.",
    requires: "Export CSV from your bank and drop it in. Nothing to sign up for. This is the single biggest unlock and the cheapest.",
    feeds: ["cash", "expenses"],
  },
  {
    id: "plaid", name: "Bank feed — automatic (Plaid)", group: "Money",
    state: "none", effort: "gated",
    unlocks: "The same as CSV, but refreshing itself daily.",
    requires: "A paid Plaid account and a server to hold the link tokens. A desktop app cannot do this alone.",
    feeds: ["cash", "expenses"],
  },
  {
    id: "fees", name: "Payment processing fees", group: "Money",
    state: "none", effort: "build",
    unlocks: "Contribution profit — gross profit after the cut the processor takes. Until this is in, profit is stated before fees and labelled that way.",
    requires: "The read_shopify_payments scope on the Shopify app. The current connection does not carry it, so fees cannot be read at all today — they are not being assumed as zero.",
    feeds: ["fees"],
  },
  {
    id: "stripe", name: "Stripe / other processors", group: "Money",
    state: "none", effort: "build",
    unlocks: "Processing fees, payout timing, money in transit, settlement reconciliation.",
    requires: "A restricted Stripe API key. Shopify Payments data comes with the Admin token instead.",
    feeds: ["cash"],
  },

  // ── Marketing ───────────────────────────────────────────
  {
    id: "meta-ads", name: "Meta Ads (Business Manager)", group: "Marketing",
    state: "none", effort: "gated",
    unlocks: "Ad spend, CAC, ROAS, MER, profit per ad dollar, and whether a campaign pays for itself after COGS.",
    requires: "A Meta app with ads_read, and App Review before a long-lived token is issued. Meta's timeline, not ours.",
    feeds: ["adSpend"],
  },
  {
    id: "ga4", name: "Google Analytics 4", group: "Marketing",
    state: "none", effort: "build",
    unlocks: "Sessions, conversion rate, the purchase funnel, revenue per session, where traffic actually comes from.",
    requires: "A Google Cloud service account with Analytics read access, and its key file. Fiddly, but nobody has to approve it.",
    feeds: ["sessions"],
  },
  {
    id: "instagram", name: "Instagram (Business)", group: "Marketing",
    state: "none", effort: "gated",
    unlocks: "Reach, engagement, saves, follower growth, and which posts actually moved revenue.",
    requires: "A Business account linked to a Facebook Page, inside a Meta app, through App Review.",
    feeds: [],
  },
  {
    id: "youtube", name: "YouTube", group: "Marketing",
    state: "none", effort: "build",
    unlocks: "Views, watch time, subscriber growth against launch dates.",
    requires: "A Google API key. The easiest of the social platforms by a distance.",
    feeds: [],
  },
  {
    id: "privy", name: "Privy — email & SMS", group: "Marketing",
    state: "none", effort: "build",
    unlocks: "List growth, pop-up and flow conversion, campaign revenue, and email's real share of sales rather than its attributed one.",
    requires: "A Privy API key from Account → Integrations. Privy's reporting API is thinner than Klaviyo's, so campaign-level revenue may need matching against Shopify orders by discount code.",
    feeds: [],
  },

  // ── Intelligence ────────────────────────────────────────
  {
    id: "llm", name: "AI analysis", group: "Intelligence",
    state: "none", effort: "build",
    unlocks: "Written analysis of your own figures in place of the fixed template, and answers to questions the dashboard has no tile for.",
    requires: "An Anthropic API key, kept in the Keychain. The model only ever sees computed figures — never raw customer rows, and never the arithmetic itself.",
    feeds: [],
  },
  {
    id: "market-research", name: "Daily market & competitor research", group: "Intelligence",
    state: "none", effort: "build",
    unlocks: "A daily read on your niche — competitor pricing and launches, category demand, seasonal shifts — set against your own margins and stock, so a suggestion knows what the rest of the market is doing.",
    requires: "The AI key above plus web search, and a list of competitors worth watching. The research is cited and dated; it never becomes a figure in the ledger.",
    feeds: [],
  },
];

export const CONNECTION_GROUPS = [...new Set(CONNECTIONS.map((c) => c.group))];

export const EFFORT_COPY: Record<ConnectionEffort, { label: string; cls: string; note: string }> = {
  ready: { label: "ready now", cls: "good", note: "Needs a token or a file — nothing else." },
  build: { label: "needs building", cls: "warning", note: "Real work here, but nothing outside blocks it." },
  gated: { label: "blocked externally", cls: "", note: "Waiting on app review, a paid plan, or a server." },
};
