// All monetary amounts throughout Meridian are integer cents.
// Formatting is centralized here so every screen renders money identically.

export function fmtUsd(cents: number, opts?: { cents?: boolean; sign?: boolean }): string {
  const sign = cents < 0 ? "−" : opts?.sign && cents > 0 ? "+" : "";
  const abs = Math.abs(cents);
  const dollars = abs / 100;
  const body = opts?.cents
    ? dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(dollars).toLocaleString("en-US");
  return `${sign}$${body}`;
}

/** Compact: $12.4k, $1.2M — for axis labels and dense tables. */
export function fmtUsdCompact(cents: number, sign = false): string {
  const s = cents < 0 ? "−" : sign && cents > 0 ? "+" : "";
  const abs = Math.abs(cents) / 100;
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `${s}$${(abs / 1000).toFixed(1)}k`;
  if (abs >= 1_000) return `${s}$${(abs / 1000).toFixed(2)}k`;
  return `${s}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtNumCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (abs >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return fmtNum(n);
}

export function fmtPct(frac: number, digits = 1, sign = false): string {
  const v = frac * 100;
  const s = sign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(digits)}%`;
}

/** Delta between two values as a signed percent string; em-dash when base is 0. */
export function pctChange(current: number, base: number): number | null {
  if (base === 0) return null;
  return (current - base) / Math.abs(base);
}

export function fmtRatio(n: number, digits = 1): string {
  return `${n.toFixed(digits)}x`;
}
