// Transactions — search, filter, categorize, review. Auto-categorization is
// always reviewable; rules learn from user corrections.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fmtUsd } from "@/lib/money";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES } from "@/domain/coa";

const SPECIAL_CATS = ["revenue_deposit", "inventory_purchase", "transfer", "owner_draw", "owner_contribution", "tax_payment", "cc_payment", "loan_payment"];

export default function Transactions() {
  const { store } = useApp();
  const [q, setQ] = useState("");
  const [account, setAccount] = useState("all");
  const [cat, setCat] = useState("all");
  const [onlyUncat, setOnlyUncat] = useState(false);
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());
  const [learned, setLearned] = useState<string[]>([]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...store.bankTx]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((t) => {
        if (account !== "all" && t.accountId !== account) return false;
        const effCat = overrides.get(t.id) ?? t.category;
        if (onlyUncat && effCat) return false;
        if (cat !== "all" && effCat !== cat) return false;
        if (s && !(`${t.merchant} ${t.description}`.toLowerCase().includes(s))) return false;
        return true;
      })
      .slice(0, 200);
  }, [store, q, account, cat, onlyUncat, overrides]);

  const uncatCount = useMemo(
    () => store.bankTx.filter((t) => !(overrides.get(t.id) ?? t.category) && !t.isTransfer).length,
    [store, overrides],
  );

  const categorize = (id: string, merchant: string, newCat: string) => {
    setOverrides((m) => new Map(m).set(id, newCat));
    // "learn" a rule for this merchant (session-local in demo mode; persisted in Tauri build)
    if (!learned.includes(merchant)) setLearned((l) => [...l, merchant]);
  };

  const allCats = [...SPECIAL_CATS, ...EXPENSE_CATEGORIES, "cogs_freight", "cogs_packaging"];

  return (
    <>
      <Card title={<>Transaction review <span className="badge warning">{uncatCount} uncategorized</span></>}
        right={
          <>
            <input type="text" placeholder="Search merchant or memo…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} />
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="all">All accounts</option>
              {store.finAccounts.filter((a) => a.kind !== "loan" && a.kind !== "processor").map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {allCats.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink-2)" }}>
              <input type="checkbox" checked={onlyUncat} onChange={(e) => setOnlyUncat(e.target.checked)} /> needs review
            </label>
          </>
        }
        pad0
      >
        <div className="tbl-wrap" style={{ maxHeight: 560, overflowY: "auto" }}>
          <table className="tbl">
            <thead>
              <tr><th>Date</th><th>Account</th><th>Merchant</th><th>Description</th><th>Category</th><th className="num">Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const effCat = overrides.get(t.id) ?? t.category;
                const acct = store.finAccounts.find((a) => a.id === t.accountId);
                return (
                  <tr key={t.id}>
                    <td className="dim">{fmtDate(t.date)}</td>
                    <td className="dim">{acct?.name.split(" ")[0]}</td>
                    <td>{t.merchant}</td>
                    <td className="dim" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{t.description}</td>
                    <td>
                      <select
                        value={effCat ?? ""}
                        onChange={(e) => categorize(t.id, t.merchant, e.target.value)}
                        style={{ fontSize: 11.5, padding: "2px 6px", borderColor: effCat ? "var(--border)" : "var(--warning)" }}
                      >
                        <option value="" disabled>Choose…</option>
                        {allCats.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
                      </select>
                    </td>
                    <td className="num" style={{ color: t.amount < 0 ? undefined : "var(--delta-good)" }}>{fmtUsd(t.amount)}</td>
                    <td>
                      {t.isTransfer ? <span className="badge">transfer</span>
                        : overrides.has(t.id) ? <span className="badge imported">user</span>
                        : effCat ? <span className="badge">{t.categorizedBy}</span>
                        : <span className="badge warning">review</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Categorization rules (learned)">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Merchant pattern</th><th>Category</th><th className="num">Applied</th><th>Source</th></tr></thead>
              <tbody>
                {store.rules.map((r) => (
                  <tr key={r.pattern}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{r.pattern}</td>
                    <td>{CATEGORY_LABELS[r.category] ?? r.category}</td>
                    <td className="num">{r.hits}</td>
                    <td className="dim">{r.createdBy}</td>
                  </tr>
                ))}
                {learned.map((m) => (
                  <tr key={m}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{m}</td>
                    <td className="dim">learned this session</td>
                    <td className="num">1</td>
                    <td><span className="badge imported">new</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Rules are applied automatically to future imports, but every auto-categorization
            stays reviewable — corrections here create or refine rules.
          </p>
        </Card>
        <Card title="How transactions flow into the books">
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            Every bank/credit-card line maps to a double-entry posting: expenses debit their category
            and credit the account; transfers net to zero and never touch the P&L; owner draws and
            estimated tax payments post to equity; inventory purchases become assets (not expenses)
            until units sell through COGS. Splits, refund matching, and reimbursement flags follow the
            same postings — the Transactions screen is a review surface over the ledger, not a separate
            book.
          </p>
        </Card>
      </div>
    </>
  );
}
