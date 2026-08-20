// Donut for composition (expenses). ≤ 8 slices, fixed categorical order,
// direct labels in the legend with values (text in ink, never series color).

import React, { useState } from "react";
import { SERIES_VARS } from "./common";

export interface DonutSlice { label: string; value: number; }

interface Props {
  slices: DonutSlice[];
  fmt: (v: number) => string;
  size?: number;
}

export function Donut({ slices, fmt, size = 168 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = slices.slice(0, 7);
  const other = slices.slice(7).reduce((t, s) => t + s.value, 0);
  const all = other > 0 ? [...shown, { label: "Other", value: other }] : shown;
  const total = Math.max(1, all.reduce((t, s) => t + s.value, 0));
  const r = size / 2 - 4;
  const ir = r * 0.62;
  const cx = size / 2, cy = size / 2;
  let angle = -Math.PI / 2;

  const arcs = all.map((s, i) => {
    const frac = s.value / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const gap = 0.012; // ~2px surface gap between fills
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = [cx + r * Math.cos(a0 + gap), cy + r * Math.sin(a0 + gap)];
    const p1 = [cx + r * Math.cos(a1 - gap), cy + r * Math.sin(a1 - gap)];
    const p2 = [cx + ir * Math.cos(a1 - gap), cy + ir * Math.sin(a1 - gap)];
    const p3 = [cx + ir * Math.cos(a0 + gap), cy + ir * Math.sin(a0 + gap)];
    const d = `M${p0[0]},${p0[1]} A${r},${r} 0 ${large} 1 ${p1[0]},${p1[1]} L${p2[0]},${p2[1]} A${ir},${ir} 0 ${large} 0 ${p3[0]},${p3[1]}Z`;
    return { d, color: SERIES_VARS[i % SERIES_VARS.length], ...s, frac };
  });

  const active = hover != null ? arcs[hover] : null;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color}
            opacity={hover != null && hover !== i ? 0.45 : 1}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 15, fontWeight: 700 }}>
          {active ? fmt(active.value) : fmt(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 10 }}>
          {active ? active.label : "Total"}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        {arcs.map((a, i) => (
          <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, cursor: "default" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: a.color, flexShrink: 0 }} />
            <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontWeight: 600, paddingLeft: 10 }}>
              {fmt(a.value)}
            </span>
            <span className="muted" style={{ fontVariantNumeric: "tabular-nums", width: 34, textAlign: "right" }}>
              {(a.frac * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
