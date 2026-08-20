import type { CoaAccount } from "./types";

// Chart of accounts. IDs are stable strings referenced by ledger lines and engines.
export const COA: CoaAccount[] = [
  // Assets
  { id: "cash_checking", name: "Business Checking", type: "asset", subtype: "cash", isCash: true },
  { id: "cash_savings", name: "Business Savings (HYSA)", type: "asset", subtype: "cash", isCash: true },
  { id: "cash_paypal", name: "PayPal Balance", type: "asset", subtype: "cash", isCash: true },
  { id: "processor_clearing", name: "Processor Clearing (Shopify Payments)", type: "asset", subtype: "clearing" },
  { id: "inventory", name: "Inventory", type: "asset", subtype: "inventory" },
  { id: "vendor_deposits", name: "Vendor Deposits", type: "asset", subtype: "prepaid" },
  { id: "equipment", name: "Equipment", type: "asset", subtype: "fixed" },

  // Liabilities
  { id: "cc_amex", name: "Amex Business Card", type: "liability", subtype: "credit_card" },
  { id: "accounts_payable", name: "Accounts Payable", type: "liability", subtype: "ap" },
  { id: "sales_tax_payable", name: "Sales Tax Payable", type: "liability", subtype: "sales_tax" },
  { id: "loan_sba", name: "SBA Loan", type: "liability", subtype: "loan" },

  // Equity
  { id: "owner_contributions", name: "Owner Contributions", type: "equity" },
  { id: "owner_draws", name: "Owner Draws / Distributions", type: "equity" },
  { id: "retained_earnings", name: "Retained Earnings", type: "equity" },

  // Revenue
  { id: "rev_product", name: "Product Revenue", type: "revenue" },
  { id: "rev_shipping", name: "Shipping Revenue", type: "revenue" },
  { id: "rev_other", name: "Other Revenue", type: "revenue" },

  // Contra-revenue
  { id: "contra_discounts", name: "Discounts", type: "contra_revenue" },
  { id: "contra_refunds", name: "Refunds & Returns", type: "contra_revenue" },

  // COGS
  { id: "cogs_product", name: "Product Manufacturing (COGS)", type: "cogs" },
  { id: "cogs_freight", name: "Inbound Freight Allocation", type: "cogs" },
  { id: "cogs_duties", name: "Duties & Customs", type: "cogs" },
  { id: "cogs_packaging", name: "Packaging", type: "cogs" },

  // Expenses
  { id: "exp_advertising", name: "Advertising", type: "expense" },
  { id: "exp_software", name: "Software & Subscriptions", type: "expense" },
  { id: "exp_contractors", name: "Contractors", type: "expense" },
  { id: "exp_payroll", name: "Payroll", type: "expense" },
  { id: "exp_shipping", name: "Shipping & Fulfillment", type: "expense" },
  { id: "exp_professional", name: "Professional Services", type: "expense" },
  { id: "exp_insurance", name: "Insurance", type: "expense" },
  { id: "exp_rent", name: "Rent & Storage", type: "expense" },
  { id: "exp_travel", name: "Travel", type: "expense" },
  { id: "exp_equipment", name: "Small Equipment", type: "expense" },
  { id: "exp_bank_fees", name: "Bank Fees", type: "expense" },
  { id: "exp_processing", name: "Payment Processing Fees", type: "expense" },
  { id: "exp_interest", name: "Loan Interest", type: "expense" },
  { id: "exp_other", name: "Other Expenses", type: "expense" },
];

export const COA_BY_ID: Map<string, CoaAccount> = new Map(COA.map((a) => [a.id, a]));

/** Expense category ids used by the transaction categorizer (subset of COA expense accounts). */
export const EXPENSE_CATEGORIES = COA.filter((a) => a.type === "expense").map((a) => a.id);

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  COA.map((a) => [a.id, a.name]),
);
// Special transaction categories that are not P&L expenses:
CATEGORY_LABELS["transfer"] = "Transfer";
CATEGORY_LABELS["owner_draw"] = "Owner Draw";
CATEGORY_LABELS["owner_contribution"] = "Owner Contribution";
CATEGORY_LABELS["revenue_deposit"] = "Revenue Deposit";
CATEGORY_LABELS["inventory_purchase"] = "Inventory Purchase";
CATEGORY_LABELS["tax_payment"] = "Tax Payment";
CATEGORY_LABELS["cc_payment"] = "Credit Card Payment";
CATEGORY_LABELS["loan_payment"] = "Loan Payment";
