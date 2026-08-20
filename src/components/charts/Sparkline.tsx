// Compact trend marks for stat tiles and table rows.
//
// Follows the stat-tile contract: the history reads in a de-emphasis hue and the most
// recent stretch carries the accent, so the eye lands on "now" without a legend. The
// end dot wears a surface ring so it stays legible where it crosses the line.

import React from "react";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  /** Accent for the recent stretch and the end dot. */
  color?: string;
  /** Hue for the earlier, de-emphasized stretch. */
  muted?: string;
  /** How many trailing points carry the accent. */
  recent?: number;
  area?: boolean;
  endDot?: boolean;
}

export function Sparkline({
  values,
  width = 96,
  height = 28,
  color = "var(--s1)",
  muted = "var(--spark-muted)",
  recent = 8,
  area = true,
  endDot = true,
}: Props) {
  if (values.length < 2) return null;

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const n = values.length;
  const pad = 3;

  const px = (i: number) => (i / (n - 1)) * (width - pad * 2) + pad;
  const py = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);

  const pt = (i: number) => `${px(i).toFixed(1)},${py(values[i]).toFixed(1)}`;

  // Split the path so the trailing window reads in the accent hue.
  const cut = Math.max(0, n - 1 - Math.max(1, recent));
  const historyPts: string[] = [];
  for (let i = 0; i <= cut; i++) historyPts.push(pt(i));
  const recentPts: string[] = [];
  for (let i = cut; i < n; i++) recentPts.push(pt(i));

  const areaD =
    `M${px(0).toFixed(1)},${(height - pad).toFixed(1)}` +
    values.map((_, i) => `L${pt(i)}`).join("") +
    `L${px(n - 1).toFixed(1)},${(height - pad).toFixed(1)}Z`;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      {area && <path d={areaD} fill={color} opacity={0.10} />}
      {historyPts.length > 1 && (
        <polyline points={historyPts.join(" ")} fill="none" stroke={muted} strokeWidth={1.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      <polyline points={recentPts.join(" ")} fill="none" stroke={color} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
      {endDot && (
        <circle cx={px(n - 1)} cy={py(values[n - 1])} r={2.6}
          fill={color} stroke="var(--surface)" strokeWidth={2} />
      )}
    </svg>
  );
}
