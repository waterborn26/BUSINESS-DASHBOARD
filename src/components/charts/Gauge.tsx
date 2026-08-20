// Business-health gauge — a 270° arc meter.
//
// The fill carries severity (good → warning → critical); the unfilled track is a
// recessive step of the surface so state reads across the whole arc at a glance.

import React from "react";

interface Props {
  value: number;      // 0–100
  size?: number;
  label?: string;
}

export function Gauge({ value, size = 132, label }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const stroke = 9;
  const r = size / 2 - stroke;
  const cx = size / 2;
  const cy = size / 2;

  // 270° sweep starting bottom-left (135°) going clockwise.
  const START = 135;
  const SWEEP = 270;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const point = (deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];

  const arc = (fromDeg: number, toDeg: number) => {
    const [x0, y0] = point(fromDeg);
    const [x1, y1] = point(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };

  const color = v >= 70 ? "var(--good)" : v >= 50 ? "var(--warning)" : "var(--critical)";
  const endDeg = START + (v / 100) * SWEEP;

  return (
    <svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`} style={{ flexShrink: 0 }}>
      <path d={arc(START, START + SWEEP)} fill="none" stroke="var(--surface-3)"
        strokeWidth={stroke} strokeLinecap="round" />
      <path d={arc(START, Math.max(START + 0.5, endDeg))} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round" />
      <text x={cx} y={cy + 4} textAnchor="middle"
        style={{ fill: "var(--ink)", fontSize: size * 0.30, fontWeight: 700 }}>
        {Math.round(v)}
      </text>
      {label && (
        <text x={cx} y={cy + size * 0.20} textAnchor="middle"
          style={{ fill: "var(--ink-3)", fontSize: 10.5, letterSpacing: 0.4 }}>
          {label}
        </text>
      )}
    </svg>
  );
}

/** Horizontal component bars used to explain a composite score. */
export function ScoreBars({ items }: {
  items: { label: string; score: number; weight: number }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {items.map((c) => {
        const color = c.score >= 70 ? "var(--good)" : c.score >= 50 ? "var(--warning)" : "var(--critical)";
        return (
          <div key={c.label} style={{ display: "grid", gridTemplateColumns: "132px 1fr 34px", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.label}
            </span>
            <div style={{ background: "var(--surface-3)", borderRadius: 3, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(2, c.score)}%`, height: "100%", background: color, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(c.score)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
