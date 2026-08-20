// Waterfall chart — cash and P&L bridges. Positive steps in the sequential blue,
// negative in the diverging red pole, totals in neutral ink.

import React, { useRef, useState } from "react";
import { CHART_M, niceTicks } from "./common";
import { fmtUsdCompact } from "@/lib/money";

export interface WaterfallStep {
  label: string;
  value: number;        // signed delta, or absolute for totals
  isTotal?: boolean;
}

interface Props {
  steps: WaterfallStep[];
  height?: number;
}

export function Waterfall({ steps, height = 240 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 640));
    ro.observe(el);
    setW(el.clientWidth || 640);
    return () => ro.disconnect();
  }, []);

  const M = { ...CHART_M, bottom: 46, left: 56 };
  const iw = Math.max(50, w - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const n = steps.length;

  // Compute running positions
  let run = 0;
  const bars = steps.map((s) => {
    if (s.isTotal) {
      const bar = { from: 0, to: s.value, ...s };
      run = s.value;
      return bar;
    }
    const bar = { from: run, to: run + s.value, ...s };
    run += s.value;
    return bar;
  });
  let lo = 0, hi = 1;
  for (const b of bars) { lo = Math.min(lo, b.from, b.to); hi = Math.max(hi, b.from, b.to); }
  const ticks = niceTicks(lo, hi, 4);
  const yMin = Math.min(lo, ticks[0] ?? lo);
  const yMax = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const y = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const slot = iw / n;
  const barW = Math.max(8, Math.min(44, slot * 0.6));

  return (
    <div className="chart" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg height={height} width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} strokeWidth={1} />
            <text x={M.left - 6} y={y(t) + 3} textAnchor="end">{fmtUsdCompact(t)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = M.left + slot * i + slot / 2;
          const top = Math.min(y(b.from), y(b.to));
          const h = Math.abs(y(b.from) - y(b.to));
          const fill = b.isTotal ? "var(--ink-3)" : b.value >= 0 ? "var(--s1)" : "var(--s8)";
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              {i > 0 && (
                <line x1={M.left + slot * (i - 1) + slot / 2 + barW / 2} x2={cx - barW / 2}
                  y1={y(b.from)} y2={y(b.from)} stroke="var(--baseline)" strokeDasharray="2 3" strokeWidth={1} />
              )}
              <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(1.5, h)} rx={3}
                fill={fill} opacity={hover != null && hover !== i ? 0.55 : b.isTotal ? 0.75 : 1} />
              <text x={cx} y={top - 4} textAnchor="middle" style={{ fontWeight: 600, fill: "var(--ink-2)" }}>
                {fmtUsdCompact(b.isTotal ? b.to : b.value, !b.isTotal)}
              </text>
              <text x={cx} y={height - 30} textAnchor="middle">
                {splitLabel(b.label)[0]}
              </text>
              <text x={cx} y={height - 19} textAnchor="middle">
                {splitLabel(b.label)[1] ?? ""}
              </text>
            </g>
          );
        })}
        <line className="axisline" x1={M.left} x2={w - M.right} y1={y(Math.max(0, yMin))} y2={y(Math.max(0, yMin))} strokeWidth={1} />
      </svg>
    </div>
  );
}

function splitLabel(l: string): string[] {
  if (l.length <= 13) return [l];
  const words = l.split(" ");
  if (words.length === 1) return [l];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}
