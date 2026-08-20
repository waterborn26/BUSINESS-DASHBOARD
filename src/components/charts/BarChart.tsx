// Stacked / grouped bar chart with 2px surface gaps between segments,
// rounded data-ends anchored to the baseline, per-mark hover tooltip.

import React, { useRef, useState } from "react";
import { CHART_M, niceTicks } from "./common";
import { fmtDate } from "@/lib/dates";

export interface BarSeries { name: string; color: string; values: number[]; }

interface Props {
  labels: string[];
  series: BarSeries[];
  stacked?: boolean;
  height?: number;
  yFmt?: (v: number) => string;
  xFmt?: (l: string) => string;
  showLegend?: boolean;
}

export function BarChart({ labels, series, stacked = true, height = 220, yFmt = (v) => v.toLocaleString(), xFmt, showLegend }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<{ i: number; si: number } | null>(null);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 640));
    ro.observe(el);
    setW(el.clientWidth || 640);
    return () => ro.disconnect();
  }, []);

  const fmtX = xFmt ?? ((l: string) => (l.length === 10 ? fmtDate(l) : l.length === 7 ? l : l));
  const M = CHART_M;
  const iw = Math.max(50, w - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const n = labels.length;

  let maxV = 1;
  if (stacked) {
    for (let i = 0; i < n; i++) {
      let t = 0;
      for (const s of series) t += Math.max(0, s.values[i] ?? 0);
      maxV = Math.max(maxV, t);
    }
  } else {
    for (const s of series) for (const v of s.values) maxV = Math.max(maxV, v);
  }
  const ticks = niceTicks(0, maxV, 4);
  const yMax = Math.max(maxV, ticks[ticks.length - 1] ?? maxV);
  const y = (v: number) => M.top + ih - (v / yMax) * ih;
  const slot = iw / n;
  const barW = Math.max(2, Math.min(26, slot * 0.62));
  const labelStep = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="chart" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg height={height} width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} strokeWidth={1} />
            <text x={M.left - 6} y={y(t) + 3} textAnchor="end">{yFmt(t)}</text>
          </g>
        ))}
        <line className="axisline" x1={M.left} x2={w - M.right} y1={M.top + ih} y2={M.top + ih} strokeWidth={1} />
        {labels.map((l, i) => (i % labelStep === 0 ? (
          <text key={i} x={M.left + slot * i + slot / 2} y={height - 4} textAnchor="middle">{fmtX(l)}</text>
        ) : null))}
        {labels.map((_, i) => {
          const cx = M.left + slot * i + slot / 2;
          if (stacked) {
            let acc = 0;
            return (
              <g key={i}>
                {series.map((s, si) => {
                  const v = Math.max(0, s.values[i] ?? 0);
                  if (v === 0) return null;
                  const y1 = y(acc + v);
                  const h = y(acc) - y1;
                  acc += v;
                  const isTop = si === lastNonZero(series, i);
                  return (
                    <rect key={si}
                      x={cx - barW / 2} y={y1}
                      width={barW} height={Math.max(1, h - (isTop ? 0 : 2))}
                      rx={isTop ? 3 : 0}
                      fill={s.color}
                      opacity={hover && (hover.i !== i) ? 0.55 : 1}
                      onMouseEnter={() => setHover({ i, si })}
                    />
                  );
                })}
              </g>
            );
          }
          const gw = barW / series.length;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = Math.max(0, s.values[i] ?? 0);
                const y1 = y(v);
                return (
                  <rect key={si}
                    x={cx - barW / 2 + si * gw + 1} y={y1}
                    width={Math.max(1, gw - 2)} height={M.top + ih - y1}
                    rx={2} fill={s.color}
                    opacity={hover && hover.i !== i ? 0.55 : 1}
                    onMouseEnter={() => setHover({ i, si })}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(M.left + slot * hover.i + slot, w - 160), top: 6 }}>
          <div className="t">{fmtX(labels[hover.i])}</div>
          {series.map((s, si) => (
            <div className="row" key={si}>
              <span className="sw" style={{ background: s.color }} />
              <span>{s.name}</span>
              <strong style={{ marginLeft: "auto", paddingLeft: 10 }}>{yFmt(s.values[hover.i] ?? 0)}</strong>
            </div>
          ))}
        </div>
      )}
      {(showLegend ?? series.length > 1) && (
        <div className="legend">
          {series.map((s) => (
            <span className="item" key={s.name}><span className="sw" style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function lastNonZero(series: BarSeries[], i: number): number {
  for (let si = series.length - 1; si >= 0; si--) {
    if ((series[si].values[i] ?? 0) > 0) return si;
  }
  return series.length - 1;
}
