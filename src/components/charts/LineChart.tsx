// Multi-series line/area chart with optional uncertainty band and forecast
// (dashed) segments. Crosshair + tooltip hover layer per the viz spec.

import React, { useMemo, useRef, useState } from "react";
import { CHART_M, extent, niceTicks } from "./common";
import { fmtDate } from "@/lib/dates";

export interface LineSeries {
  name: string;
  color: string;
  values: (number | null)[];  // aligned to labels
  dashed?: boolean;
  area?: boolean;
}

export interface BandSeries { lo: number[]; hi: number[]; color: string; startIndex?: number; }

interface Props {
  labels: string[];             // ISO dates or category labels
  series: LineSeries[];
  band?: BandSeries;
  height?: number;
  yFmt?: (v: number) => string;
  xFmt?: (label: string) => string;
  markerIndex?: number;         // vertical annotation (e.g. site update)
  markerLabel?: string;
  showLegend?: boolean;
}

export function LineChart({
  labels, series, band, height = 220,
  yFmt = (v) => v.toLocaleString(), xFmt,
  markerIndex, markerLabel, showLegend,
}: Props) {
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

  const fmtX = xFmt ?? ((l: string) => (l.length === 10 ? fmtDate(l) : l));
  const M = CHART_M;
  const iw = Math.max(50, w - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const n = labels.length;

  const allVals: number[] = [];
  for (const s of series) for (const v of s.values) if (v != null) allVals.push(v);
  if (band) { allVals.push(...band.lo, ...band.hi); }
  const [lo, hi] = extent(allVals);
  const ticks = niceTicks(lo, hi, 4);
  const yMax = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const yMin = Math.min(lo, ticks[0] ?? lo);

  const x = (i: number) => M.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;

  const paths = useMemo(() => series.map((s) => {
    let d = "";
    let started = false;
    for (let i = 0; i < n; i++) {
      const v = s.values[i];
      if (v == null) { started = false; continue; }
      d += `${started ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      started = true;
    }
    let areaD = "";
    if (s.area && d) {
      const firstIdx = s.values.findIndex((v) => v != null);
      const lastIdx = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v != null);
      areaD = d + `L${x(lastIdx).toFixed(1)},${y(Math.max(0, yMin)).toFixed(1)}L${x(firstIdx).toFixed(1)},${y(Math.max(0, yMin)).toFixed(1)}Z`;
    }
    return { d, areaD };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [series, n, w, yMin, yMax, height]);

  const bandPath = useMemo(() => {
    if (!band) return "";
    const s0 = band.startIndex ?? 0;
    let d = "";
    for (let i = 0; i < band.hi.length; i++) d += `${i === 0 ? "M" : "L"}${x(s0 + i).toFixed(1)},${y(band.hi[i]).toFixed(1)}`;
    for (let i = band.lo.length - 1; i >= 0; i--) d += `L${x(s0 + i).toFixed(1)},${y(band.lo[i]).toFixed(1)}`;
    return d + "Z";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band, n, w, yMin, yMax, height]);

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - M.left) / iw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  // x labels: ~6 evenly spaced
  const labelStep = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="chart" ref={wrapRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg height={height} width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={M.left} x2={w - M.right} y1={y(t)} y2={y(t)} strokeWidth={1} />
            <text x={M.left - 6} y={y(t) + 3} textAnchor="end">{yFmt(t)}</text>
          </g>
        ))}
        <line className="axisline" x1={M.left} x2={w - M.right} y1={M.top + ih} y2={M.top + ih} strokeWidth={1} />
        {labels.map((l, i) => (i % labelStep === 0 ? (
          <text key={i} x={x(i)} y={height - 4} textAnchor="middle">{fmtX(l)}</text>
        ) : null))}

        {band && <path d={bandPath} fill={band.color} opacity={0.14} />}

        {markerIndex != null && markerIndex >= 0 && markerIndex < n && (
          <g>
            <line x1={x(markerIndex)} x2={x(markerIndex)} y1={M.top} y2={M.top + ih} stroke="var(--serious)" strokeDasharray="3 3" strokeWidth={1} />
            {markerLabel && <text x={x(markerIndex) + 4} y={M.top + 10} fill="var(--serious)" style={{ fill: "var(--serious)" }}>{markerLabel}</text>}
          </g>
        )}

        {paths.map((p, si) => (
          <g key={si}>
            {p.areaD && <path d={p.areaD} fill={series[si].color} opacity={0.10} />}
            <path d={p.d} fill="none" stroke={series[si].color} strokeWidth={2}
              strokeDasharray={series[si].dashed ? "4 4" : undefined}
              strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}

        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} stroke="var(--baseline)" strokeWidth={1} />
            {series.map((s, si) => {
              const v = s.values[hover];
              return v == null ? null : (
                <circle key={si} cx={x(hover)} cy={y(v)} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              );
            })}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="chart-tip" style={{
          left: Math.min(x(hover) + 10, w - 150),
          top: 6,
        }}>
          <div className="t">{fmtX(labels[hover])}</div>
          {series.map((s, si) => {
            const v = s.values[hover];
            return v == null ? null : (
              <div className="row" key={si}>
                <span className="sw" style={{ background: s.color }} />
                <span>{s.name}</span>
                <strong style={{ marginLeft: "auto", paddingLeft: 10 }}>{yFmt(v)}</strong>
              </div>
            );
          })}
        </div>
      )}
      {(showLegend ?? series.length > 1) && (
        <div className="legend">
          {series.map((s) => (
            <span className="item" key={s.name}>
              <span className="sw" style={{ background: s.color }} />{s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
