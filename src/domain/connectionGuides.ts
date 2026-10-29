// What a person actually has to do, in their words, to turn a source on.
//
// Every step here is a real step in a real product's UI. Where a scope or a field
// name is given it is the exact string to look for, because "find the API settings"
// is the part that wastes an afternoon.

export interface GuideStep {
  /** Do this. */
  text: string;
  /** Where to do it, if it is a page rather than a decision. */
  link?: { label: string; url: string };
}

export interface ConnectionGuide {
  /** How long this honestly takes, for someone who has not done it before. */
  minutes: number;
  steps: GuideStep[];
  /** What is pasted back in at the end, if anything. */
  secret?: {
    key: string;              // Keychain key
    label: string;            // field label
    placeholder: string;
    /** A cheap shape check, so an obviously wrong paste is caught before saving. */
    looksValid: (v: string) => boolean;
    hint: string;
  };
  /** A file is supplied instead of a secret. */
  file?: { label: string; accept: string; hint: string };
}

const nonEmpty = (v: string) => v.trim().length > 0;

export const GUIDES: Record<string, ConnectionGuide> = {
  "bank-csv": {
    minutes: 5,
    steps: [
      { text: "Sign in to your business bank and open the account you run the business from." },
      { text: "Find the transactions or statements view and set the date range as far back as it will go — a year is ideal, since it lets Meridian see your real seasonality." },
      { text: "Export as CSV. Most banks label this Download, Export or Statements. If it offers OFX or QFX, CSV is the one to take." },
      { text: "Do the same for each business card. Card statements matter as much as the bank — they carry most of the spend." },
      { text: "Drop the files in below. Nothing is uploaded anywhere; the file is read on this machine." },
    ],
    file: {
      label: "Bank or card CSV",
      accept: ".csv,text/csv",
      hint: "Any column layout. Meridian reads the header row and asks you to confirm which column is the date, the amount and the description.",
    },
  },

  "shopify-live": {
    minutes: 10,
    steps: [
      { text: "In Shopify admin, open Settings, then Apps and sales channels.", link: { label: "Shopify apps settings", url: "https://admin.shopify.com/settings/apps" } },
      { text: "Click Develop apps, then Allow custom app development if you have not before. Shopify asks you to confirm — this is a one-time account setting." },
      { text: "Click Create an app. Name it Meridian. The app is private to your store and is never submitted to Shopify for review." },
      { text: "Open Configuration, then Admin API integration, and tick these scopes: read_orders, read_products, read_inventory, read_analytics, read_shopify_payments. The last one is what makes real profit-after-fees possible." },
      { text: "Save, go to the API credentials tab, and click Install app." },
      { text: "Reveal the Admin API access token and copy it. Shopify shows it once — if you lose it you create another." },
    ],
    secret: {
      key: "shopify.admin_token",
      label: "Admin API access token",
      placeholder: "shpat_…",
      looksValid: (v) => /^shpat_[a-f0-9]{32,}$/i.test(v.trim()),
      hint: "Starts with shpat_ followed by a long hex string. Stored in the macOS Keychain, never in the database.",
    },
  },

  ga4: {
    minutes: 20,
    steps: [
      { text: "Open Google Cloud Console and create a project, or pick one you already have.", link: { label: "Google Cloud Console", url: "https://console.cloud.google.com/" } },
      { text: "Enable the Google Analytics Data API for that project.", link: { label: "Analytics Data API", url: "https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" } },
      { text: "Under IAM & Admin, Service Accounts, create a service account. No roles are needed at the project level." },
      { text: "Open the service account, go to Keys, Add key, Create new key, and choose JSON. The file downloads once." },
      { text: "Copy the service account's email address — it ends in .iam.gserviceaccount.com." },
      { text: "In Google Analytics, open Admin, Property access management, and add that email as a Viewer on the property for waterbornworkshop.com.", link: { label: "Google Analytics admin", url: "https://analytics.google.com/" } },
      { text: "Supply the JSON key file below." },
    ],
    file: {
      label: "Service account JSON key",
      accept: ".json,application/json",
      hint: "The file Google downloaded. It contains a private key, so it is stored in the Keychain and never written to disk by Meridian.",
    },
  },

  youtube: {
    minutes: 5,
    steps: [
      { text: "In Google Cloud Console, open APIs & Services, Credentials.", link: { label: "Google Cloud credentials", url: "https://console.cloud.google.com/apis/credentials" } },
      { text: "Enable the YouTube Data API v3 for the project.", link: { label: "YouTube Data API", url: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" } },
      { text: "Click Create credentials, then API key, and copy it." },
      { text: "Click Restrict key and limit it to the YouTube Data API. An unrestricted key works but can be abused if it leaks." },
    ],
    secret: {
      key: "youtube.api_key",
      label: "YouTube Data API key",
      placeholder: "AIza…",
      looksValid: (v) => /^AIza[\w-]{30,}$/.test(v.trim()),
      hint: "Starts with AIza. Read-only — it can see public channel statistics and nothing else.",
    },
  },

  privy: {
    minutes: 5,
    steps: [
      { text: "Sign in to Privy and open Account, then Integrations.", link: { label: "Privy account", url: "https://www.privy.com/" } },
      { text: "Find the API section and generate a key if there is not one already." },
      { text: "Copy both the API key and the store ID shown beside it — Privy's endpoints need the store ID as well." },
      { text: "Paste the key below. Meridian asks for the store ID the first time it syncs." },
    ],
    secret: {
      key: "privy.api_key",
      label: "Privy API key",
      placeholder: "Your Privy API key",
      looksValid: nonEmpty,
      hint: "Privy's reporting API is thinner than Klaviyo's: list growth and pop-up conversion come through cleanly, campaign revenue is matched against Shopify orders by discount code.",
    },
  },

  llm: {
    minutes: 3,
    steps: [
      { text: "Open the Anthropic Console and sign in.", link: { label: "Anthropic Console", url: "https://console.anthropic.com/settings/keys" } },
      { text: "Click Create key, name it Meridian, and copy it. It is shown once." },
      { text: "Add a little credit under Billing if the account is new. Written analysis of a day's figures costs a fraction of a cent." },
    ],
    secret: {
      key: "anthropic.api_key",
      label: "Anthropic API key",
      placeholder: "sk-ant-…",
      looksValid: (v) => /^sk-ant-[\w-]{20,}$/.test(v.trim()),
      hint: "The model is sent computed figures only — never customer rows, and never the arithmetic itself. It writes about the numbers; it does not produce them.",
    },
  },

  "market-research": {
    minutes: 5,
    steps: [
      { text: "Connect AI analysis first — the research uses the same key." },
      { text: "List the competitors worth watching. Store URLs are enough; Meridian reads public pages only." },
      { text: "Say which categories matter: belts, tees, hats, patches. Research is scoped to those rather than the whole apparel market." },
      { text: "Pick a time. The research runs once a day and is dated and cited, so you can see where a claim came from." },
    ],
  },

  stripe: {
    minutes: 5,
    steps: [
      { text: "Open the Stripe Dashboard, Developers, API keys.", link: { label: "Stripe API keys", url: "https://dashboard.stripe.com/apikeys" } },
      { text: "Click Create restricted key." },
      { text: "Grant read on Balance transactions, Charges and Payouts. Nothing else, and no write anywhere." },
      { text: "Copy the key." },
    ],
    secret: {
      key: "stripe.restricted_key",
      label: "Stripe restricted key",
      placeholder: "rk_live_…",
      looksValid: (v) => /^rk_(live|test)_[\w]{20,}$/.test(v.trim()),
      hint: "Must start with rk_ — a restricted key. A secret key (sk_) can move money and should never be pasted into anything.",
    },
  },
};

GUIDES["shopify-inventory"] = GUIDES["shopify-live"];
GUIDES["fees"] = GUIDES["shopify-live"];
