// Horizontal composition meter — one whole split into ordered parts.
//
// Used for "total cash → available cash": the committed portions read as an ordinal
// blue ramp (they are one idea, "spoken for"), and the part that is actually yours
// carries a distinct hue. Segments are separated by a 2px surface gap, never a stroke.

import React, { useState } from "react";

export interface MeterSegment {
  label: string;
  value: number;
  detail?: string;
  /** Marks the "what's left / yours" segment, which gets its own hue. */
  highlight?: boolean;
}

// Ordinal ramp steps valid on BOTH surfaces (blue 250→600): light enough to clear the
// dark surface, dark enough to clear the light one.
const ORDINAL = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#256abf", "#184f95"];
const HIGHLIGHT = "var(--s3)";

interface Props {
  segments: MeterSegment[];
  height?: number;
  fmt: (v: number) => string;
  onSegmentClick?: (s: MeterSegment) => void;
}

export function SplitMeter({ segments, height = 30, fmt, onSegmentClick }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((t, s) => t + s.value, 0) || 1;
  // Assign colors once so the bar and its legend can never drift apart.
  let rampIdx = 0;
  const colorOf = shown.map((s) =>
    s.highlight ? HIGHLIGHT : ORDINAL[Math.min(rampIdx++, ORDINAL.length - 1)],
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 2, height, width: "100%" }}>
        {shown.map((s, i) => {
          const color = colorOf[i];
          const pct = (s.value / total) * 100;
          const isFirst = i === 0;
          const isLast = i === shown.length - 1;
          return (
            <div
              key={s.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSegmentClick?.(s)}
              title={`${s.label}: ${fmt(s.value)}`}
              style={{
                width: `${pct}%`,
                minWidth: 3,
                background: color,
                borderRadius: `${isFirst ? 4 : 0}px ${isLast ? 4 : 0}px ${isLast ? 4 : 0}px ${isFirst ? 4 : 0}px`,
                opacity: hover !== null && hover !== i ? 0.5 : 1,
                transition: "opacity 120ms",
                cursor: onSegmentClick ? "pointer" : "default",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 10 }}>
        {shown.map((s, i) => {
          const color = colorOf[i];
          return (
            <div
              key={s.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSegmentClick?.(s)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5,
                opacity: hover !== null && hover !== i ? 0.55 : 1,
                cursor: onSegmentClick ? "pointer" : "default",
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(s.value)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}
