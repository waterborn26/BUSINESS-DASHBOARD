// Forecasting engine — transparent classical decomposition, no black box.
// trend (robust linear fit on a recent window) × weekday seasonality, with
// residual σ producing ~80% uncertainty bands that widen with horizon.
// Every output is provenance "estimate".

import { linearRegression, mean, stddev, clamp } from "@/lib/stats";

export interface DailyForecast {
  mean: number[];
  lo: number[];   // ~80% band
  hi: number[];
  method: string;
  trendPerDay: number;
  weekdayIndex: number[]; // multiplier per JS weekday of first forecast day offset
}

/**
 * Forecast the next `horizon` daily values given a trailing daily history
 * (most recent last). History should be at least ~28 days; 90–120 preferred.
 */
export function forecastDaily(history: number[], horizon: number): DailyForecast {
  const n = history.length;
  if (n < 14) {
    const m = mean(history);
    return {
      mean: Array(horizon).fill(m), lo: Array(horizon).fill(m * 0.7), hi: Array(horizon).fill(m * 1.3),
      method: "naive-mean (insufficient history)", trendPerDay: 0, weekdayIndex: Array(7).fill(1),
    };
  }
  // Weekday index from the full history
  const byWd: number[][] = [[], [], [], [], [], [], []];
  for (let i = 0; i < n; i++) byWd[i % 7].push(history[i]);
  const overall = mean(history.filter((x) => x > 0)) || 1;
  // Weekday position: history[n-1] is "yesterday"; wd cycle aligned by index mod 7.
  const wdIdx = byWd.map((xs) => (xs.length ? clamp(mean(xs) / overall, 0.5, 1.6) : 1));

  // De-seasonalize, then fit trend on the last 56 days (robust to old regime changes)
  const window = Math.min(56, n);
  const recent = history.slice(n - window);
  const deseason = recent.map((v, i) => {
    const wd = (n - window + i) % 7;
    return wdIdx[wd] > 0 ? v / wdIdx[wd] : v;
  });
  const { slope, intercept } = linearRegression(deseason);
  // Residual σ for bands
  const resid = deseason.map((v, i) => v - (intercept + slope * i));
  const sigma = stddev(resid);

  const out: DailyForecast = { mean: [], lo: [], hi: [], method: "trend × weekday decomposition", trendPerDay: slope, weekdayIndex: wdIdx };
  for (let h = 1; h <= horizon; h++) {
    const base = intercept + slope * (window - 1 + h);
    const wd = (n + h - 1) % 7;
    const m = Math.max(0, base * wdIdx[wd]);
    // Band widens with sqrt of horizon
    const band = 1.28 * sigma * Math.sqrt(1 + h / 14) * wdIdx[wd];
    out.mean.push(m);
    out.lo.push(Math.max(0, m - band));
    out.hi.push(m + band);
  }
  return out;
}

/** Sum a forecast over the first `days` days. */
export function forecastSum(f: DailyForecast, days: number): { mean: number; lo: number; hi: number } {
  const k = Math.min(days, f.mean.length);
  let m = 0, lo = 0, hi = 0;
  for (let i = 0; i < k; i++) { m += f.mean[i]; lo += f.lo[i]; hi += f.hi[i]; }
  return { mean: m, lo, hi };
}
