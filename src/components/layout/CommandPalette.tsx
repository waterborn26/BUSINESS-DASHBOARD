// Universal command palette (⌘K): navigate, jump to products, run queries.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/state/AppContext";
import { ROUTES } from "@/state/routes";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette() {
  const app = useApp();
  const { paletteOpen, setPaletteOpen, navigate, store } = app;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ(""); setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [paletteOpen]);

  const commands = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = ROUTES.map((r) => ({
      id: `nav-${r.id}`, label: `Open ${r.label}`, hint: r.group,
      run: () => navigate(r.id),
    }));
    const products: Cmd[] = store.products.map((p) => ({
      id: `prod-${p.id}`, label: p.name, hint: "Product",
      run: () => navigate("products"),
    }));
    const queries: Cmd[] = [
      { id: "q-money", label: "Where did my money go this month?", hint: "Ask AI", run: () => navigate("analyst") },
      { id: "q-bills", label: "Show unpaid bills", hint: "Payables", run: () => navigate("payables") },
      { id: "q-tax", label: "Show tax liabilities", hint: "Taxes", run: () => navigate("taxes") },
      { id: "q-risk", label: "Show inventory risks", hint: "Inventory", run: () => navigate("inventory") },
      { id: "q-launch", label: "Compare launches", hint: "Launches", run: () => navigate("launches") },
      { id: "q-ai", label: "Ask the Analyst…", hint: "AI", run: () => navigate("analyst") },
    ];
    return [...nav, ...queries, ...products];
  }, [navigate, store.products]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands.slice(0, 12);
    return commands.filter((c) => c.label.toLowerCase().includes(s)).slice(0, 12);
  }, [q, commands]);

  useEffect(() => setSel(0), [filtered.length, q]);

  if (!paletteOpen) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && filtered[sel]) {
      filtered[sel].run();
      setPaletteOpen(false);
    }
  };

  return (
    <div className="palette-overlay" onClick={() => setPaletteOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search screens, products, or ask a question…"
          aria-label="Command palette"
        />
        <div className="palette-list">
          {filtered.map((c, i) => (
            <button
              key={c.id}
              className={`palette-item ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => { c.run(); setPaletteOpen(false); }}
            >
              {c.label}
              <span className="hint">{c.hint}</span>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 14, color: "var(--ink-3)" }}>No matches.</div>}
        </div>
      </div>
    </div>
  );
}
