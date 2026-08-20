// Forecasting engine — any metric, any horizon, with uncertainty bands and
// clear actual/forecast distinction.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { addDays, dateRange } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { series, type MetricId } from "@/engines/analytics";
import { forecastDaily, forecastSum } from "@/engines/forecast";

const METRICS: { id: MetricId; label: string; money: boolean; ratio?: boolean }[] = [
  { id: "net_revenue", label: "Net revenue", money: true },
  { id: "orders", label: "Orders", money: false },
  { id: "contribution_profit", label: "Contribution profit", money: true },
  { id: "sessions", label: "Traffic (sessions)", money: false },
  { id: "conversion", label: "Conversion rate", money: false, ratio: true },
  { id: "aov", label: "AOV", money: true },
  { id: "ad_spend", label: "Ad spend", money: true },
  { id: "cac", label: "CAC", money: true },
  { id: "new_customers", label: "New customers", money: false },
];
const HORIZONS = [7, 30, 90, 180, 365] as const;

export default function Forecasting() {
  const { store } = useApp();
  const [metricId, setMetricId] = useState<MetricId>("net_revenue");
  const [horizon, setHorizon] = useState<number>(30);
  const metric = METRICS.find((m) => m.id === metricId)!;

  const data = useMemo(() => {
    const histDays = 120;
    const hist = series(store, metricId, { start: addDays(store.today, -(histDays - 1)), end: store.today });
    const f = forecastDaily(hist.map((p) => p.value), horizon);
    const shownHist = hist.slice(-60);
    const futureDates = Array.from({ length: horizon }, (_, i) => addDays(store.today, i + 1));
    return {
      labels: [...shownHist.map((p) => p.date), ...futureDates],
      actual: [...shownHist.map((p) => p.value), ...Array(horizon).fill(null)],
      forecast: [...Array(shownHist.length - 1).fill(null), shownHist[shownHist.length - 1]?.value ?? null, ...f.mean],
      band: { lo: f.lo, hi: f.hi, startIndex: shownHist.length },
      f,
      sum: forecastSum(f, horizon),
      histSum: hist.slice(-horizon).reduce((t, p) => t + p.value, 0),
    };
  }, [store, metricId, horizon]);

  const fmt = metric.ratio ? (v: number) => fmtPct(v, 2) : metric.money ? (v: number) => fmtUsdCompact(v) : (v: number) => fmtNum(Math.round(v));
  const isSummable = !metric.ratio && metricId !== "aov" && metricId !== "cac";

  return (
    <>
      <Card
        title={`${metric.label} — 60 days actual + ${horizon} days forecast`}
        right={
          <>
            <select value={metricId} onChange={(e) => setMetricId(e.target.value as MetricId)}>
              {METRICS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <span className="seg">
              {HORIZONS.map((h) => <button key={h} className={horizon === h ? "on" : ""} onClick={() => setHorizon(h)}>{h}d</button>)}
            </span>
          </>
        }
      >
        <LineChart
          labels={data.labels}
          series={[
            { name: "Actual", color: "var(--s1)", values: data.actual, area: true },
            { name: "Forecast (est.)", color: "var(--s1)", values: data.forecast, dashed: true },
          ]}
          band={{ ...data.band, color: "var(--s1)" }}
          yFmt={fmt}
          height={280}
        />
      </Card>

      <div className="kpi-row">
        {isSummable ? (
          <>
            <Kpi label={`Forecast total (${horizon}d)`} value={fmt(data.sum.mean)} provenance="estimate" />
            <Kpi label="80% band low" value={fmt(data.sum.lo)} provenance="estimate" />
            <Kpi label="80% band high" value={fmt(data.sum.hi)} provenance="estimate" />
            <Kpi label={`Actual (last ${horizon}d)`} value={fmt(data.histSum)} />
            <Kpi label="Implied change" value={data.histSum ? fmtPct(data.sum.mean / data.histSum - 1, 1, true) : "—"} provenance="estimate" />
          </>
        ) : (
          <>
            <Kpi label={`Forecast avg (${horizon}d)`} value={fmt(data.sum.mean / horizon)} provenance="estimate" />
            <Kpi label="Band low (avg)" value={fmt(data.sum.lo / horizon)} provenance="estimate" />
            <Kpi label="Band high (avg)" value={fmt(data.sum.hi / horizon)} provenance="estimate" />
          </>
        )}
        <Kpi label="Trend / day" value={metric.money ? fmtUsd(Math.round(data.f.trendPerDay)) : data.f.trendPerDay.toFixed(2)} provenance="estimate" />
      </div>

      <Card title="How this forecast works">
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.65, maxWidth: 760 }}>
          Method: <strong>{data.f.method}</strong>. The last 120 days are de-seasonalized by weekday index
          (Sun–Sat multipliers {data.f.weekdayIndex.map((x) => x.toFixed(2)).join(" / ")}), a robust linear
          trend is fit to the last 56 days, and the band is ±1.28σ of residuals widening with horizon (~80%
          interval). No black-box model: every forecast is reproducible from the inputs shown. Forecasts are
          always labeled <span className="badge estimate">est.</span> and never mixed with actuals in reports.
        </p>
      </Card>
    </>
  );
}
