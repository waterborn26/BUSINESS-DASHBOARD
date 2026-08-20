// Tiny inline sparkline for KPI tiles and table rows.

import React from "react";

export function Sparkline({ values, width = 84, height = 24, color = "var(--s1)" }: {
  values: number[]; width?: number; height?: number; color?: string;
}) {
  if (!values.length) return null;
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi === lo) { hi = lo + 1; }
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1 || 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - lo) / (hi - lo)) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
