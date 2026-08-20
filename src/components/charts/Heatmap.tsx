// Cohort heatmap — sequential single-hue ramp (blue), per-cell hover.

import React, { useState } from "react";

export interface HeatCell { value: number; label: string; }

interface Props {
  rows: string[];
  cols: string[];
  cells: (HeatCell | null)[][]; // rows × cols
  min?: number;
  max?: number;
}

const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#104281"];

export function Heatmap({ rows, cols, cells, min, max }: Props) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  let lo = min ?? Infinity, hi = max ?? -Infinity;
  if (min == null || max == null) {
    for (const row of cells) for (const cell of row) if (cell) { lo = Math.min(lo, cell.value); hi = Math.max(hi, cell.value); }
  }
  const color = (v: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo || 1)) * RAMP.length)))];

  return (
    <div className="tbl-wrap">
      <table style={{ borderCollapse: "separate", borderSpacing: 2, fontSize: 11 }}>
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c} style={{ color: "var(--ink-3)", fontWeight: 500, padding: "2px 4px", textAlign: "center" }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <td style={{ color: "var(--ink-3)", paddingRight: 8, whiteSpace: "nowrap" }}>{r}</td>
              {cols.map((_, ci) => {
                const cell = cells[ri]?.[ci];
                const isHover = hover?.r === ri && hover?.c === ci;
                return (
                  <td key={ci}
                    onMouseEnter={() => setHover({ r: ri, c: ci })}
                    onMouseLeave={() => setHover(null)}
                    style={{
                      width: 52, height: 26, textAlign: "center", borderRadius: 3,
                      background: cell ? color(cell.value) : "var(--surface-2)",
                      color: cell && (cell.value - lo) / (hi - lo || 1) > 0.45 ? "#fff" : "var(--ink)",
                      outline: isHover ? "2px solid var(--ink)" : "none",
                      fontVariantNumeric: "tabular-nums",
                      cursor: "default",
                    }}
                    title={cell ? `${r} × ${cols[ci]}: ${cell.label}` : undefined}
                  >
                    {cell ? cell.label : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
