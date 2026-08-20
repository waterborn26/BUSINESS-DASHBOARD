// Shared UI primitives: cards, KPIs, deltas, badges, statement rows, tables.

import React from "react";
import { fmtPct, fmtUsd, pctChange } from "@/lib/money";
import type { Provenance } from "@/domain/types";

export function Card({ title, right, children, className, pad0 }: {
  title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; pad0?: boolean;
}) {
  return (
    <div className={`card ${pad0 ? "pad-0" : ""} ${className ?? ""}`}>
      {title && (
        <div className="card-title" style={pad0 ? { padding: "12px 16px 0" } : undefined}>
          {title}
          {right && <span className="right">{right}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Delta({ current, base, invert, digits = 1 }: {
  current: number; base: number; invert?: boolean; digits?: number;
}) {
  const d = pctChange(current, base);
  if (d === null) return <span className="delta flat">—</span>;
  const good = invert ? d < 0 : d > 0;
  const cls = Math.abs(d) < 0.002 ? "flat" : good ? "up" : "down";
  const arrow = Math.abs(d) < 0.002 ? "→" : d > 0 ? "↑" : "↓";
  return <span className={`delta ${cls}`}>{arrow} {fmtPct(Math.abs(d), digits)}</span>;
}

export function ProvenanceBadge({ p }: { p: Provenance }) {
  if (p === "computed") return null;
  const label = p === "estimate" ? "est." : p === "imported" ? "imported" : p === "manual" ? "manual" : "confirmed";
  const cls = p === "estimate" ? "estimate" : p === "imported" || p === "confirmed" ? "imported" : "";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Kpi({ label, value, current, base, invert, sub, onClick, provenance, small }: {
  label: string;
  value: string;
  current?: number;
  base?: number;
  invert?: boolean;
  sub?: React.ReactNode;
  onClick?: () => void;
  provenance?: Provenance;
  small?: boolean;
}) {
  return (
    <div className={`kpi ${onClick ? "clickable" : ""}`} onClick={onClick} title={onClick ? "Click to drill down" : undefined}>
      <div className="kpi-label">
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {provenance && <ProvenanceBadge p={provenance} />}
      </div>
      <div className={`kpi-value ${small ? "small" : ""}`}>{value}</div>
      <div className="kpi-sub">
        {current !== undefined && base !== undefined && <Delta current={current} base={base} invert={invert} />}
        {sub}
      </div>
    </div>
  );
}

export function StmtRow({ label, amount, indent, total, subtotal, neg, badge, onClick }: {
  label: React.ReactNode;
  amount: number;
  indent?: boolean;
  total?: boolean;
  subtotal?: boolean;
  neg?: boolean;             // render as deduction (−$x, red-tinted)
  badge?: Provenance;
  onClick?: () => void;
}) {
  return (
    <div
      className={`stmt-row ${indent ? "indent" : ""} ${total ? "total" : ""} ${subtotal ? "subtotal" : ""}`}
      style={onClick ? { cursor: "pointer" } : undefined}
      onClick={onClick}
    >
      <span className="lbl">{label}{badge && <ProvenanceBadge p={badge} />}</span>
      <span className={neg ? "neg" : amount < 0 ? "neg" : ""}>
        {neg ? `−${fmtUsd(Math.abs(amount))}` : fmtUsd(amount)}
      </span>
    </div>
  );
}

export function SectionHeading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700 }}>{children}</h2>
      {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--ink-3)", fontSize: 12.5, padding: "12px 0" }}>{children}</div>;
}

export function Tone({ v, invert, children }: { v: number; invert?: boolean; children: React.ReactNode }) {
  const good = invert ? v < 0 : v > 0;
  return <span style={{ color: v === 0 ? undefined : good ? "var(--delta-good)" : "var(--delta-bad)" }}>{children}</span>;
}
