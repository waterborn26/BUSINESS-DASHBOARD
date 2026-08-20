// Route registry — primary navigation. Grouped for the sidebar.

export interface RouteDef {
  id: string;
  label: string;
  group: string;
}

export const ROUTES: RouteDef[] = [
  { id: "command", label: "Command Center", group: "Overview" },
  { id: "sales", label: "Sales", group: "Overview" },

  { id: "finance", label: "Finance & Money", group: "Money" },
  { id: "transactions", label: "Transactions", group: "Money" },
  { id: "pnl", label: "Profit & Loss", group: "Money" },
  { id: "cashflow", label: "Cash Flow", group: "Money" },
  { id: "taxes", label: "Taxes", group: "Money" },
  { id: "expenses", label: "Expenses", group: "Money" },
  { id: "accounts", label: "Accounts", group: "Money" },
  { id: "payables", label: "Payables & Commitments", group: "Money" },

  { id: "products", label: "Products", group: "Operations" },
  { id: "inventory", label: "Inventory", group: "Operations" },
  { id: "customers", label: "Customers", group: "Operations" },

  { id: "marketing", label: "Marketing", group: "Growth" },
  { id: "website", label: "Website", group: "Growth" },
  { id: "social", label: "Content / Social", group: "Growth" },
  { id: "launches", label: "Launches", group: "Growth" },

  { id: "forecasting", label: "Forecasting", group: "Intelligence" },
  { id: "scenarios", label: "What If?", group: "Intelligence" },
  { id: "trends", label: "Trends", group: "Intelligence" },
  { id: "opportunities", label: "Opportunities", group: "Intelligence" },
  { id: "alerts", label: "Alerts", group: "Intelligence" },
  { id: "goals", label: "Goals", group: "Intelligence" },
  { id: "analyst", label: "Ask the Analyst", group: "Intelligence" },
  { id: "reports", label: "Reports", group: "Intelligence" },

  { id: "datasources", label: "Data Sources", group: "System" },
  { id: "reconciliation", label: "Reconciliation", group: "System" },
  { id: "decisions", label: "Decision Journal", group: "System" },
  { id: "settings", label: "Settings", group: "System" },
];

export const ROUTE_GROUPS = ["Overview", "Money", "Operations", "Growth", "Intelligence", "System"];
