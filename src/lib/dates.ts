// Date helpers. All entity dates are ISO `yyyy-mm-dd` strings in local business time.

export const DAY_MS = 86_400_000;

export function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseIso(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(s: string, n: number): string {
  return iso(new Date(parseIso(s).getTime() + n * DAY_MS));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

/** Inclusive list of ISO dates from a to b. */
export function dateRange(a: string, b: string): string[] {
  const out: string[] = [];
  for (let t = parseIso(a).getTime(), end = parseIso(b).getTime(); t <= end; t += DAY_MS) {
    out.push(iso(new Date(t)));
  }
  return out;
}

export function dayOfWeek(s: string): number {
  return parseIso(s).getUTCDay(); // 0 = Sunday
}

export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function quarterKey(s: string): string {
  const m = Number(s.slice(5, 7));
  return `${s.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

export function startOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

export function endOfMonth(s: string): string {
  const d = parseIso(startOfMonth(s));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return iso(new Date(d.getTime() - DAY_MS));
}

export function startOfYear(s: string): string {
  return `${s.slice(0, 4)}-01-01`;
}

export function startOfQuarter(s: string): string {
  const m = Number(s.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${s.slice(0, 4)}-${String(qm).padStart(2, "0")}-01`;
}

export function dayOfYear(s: string): number {
  return daysBetween(startOfYear(s), s);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(s: string): string {
  const d = parseIso(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function fmtDateFull(s: string): string {
  const d = parseIso(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function fmtMonth(mk: string): string {
  return `${MONTHS[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;
}

export interface Period {
  start: string; // inclusive
  end: string;   // inclusive
}

export function periodDays(p: Period): number {
  return daysBetween(p.start, p.end) + 1;
}

/** The immediately preceding period of equal length. */
export function previousPeriod(p: Period): Period {
  const len = periodDays(p);
  return { start: addDays(p.start, -len), end: addDays(p.start, -1) };
}

/** Same period one year earlier. */
export function yearAgoPeriod(p: Period): Period {
  return { start: addDays(p.start, -365), end: addDays(p.end, -365) };
}

export type RangePreset =
  | "today" | "yesterday" | "7d" | "14d" | "30d" | "90d"
  | "mtd" | "qtd" | "ytd" | "prev_year" | "12m";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 days" },
  { id: "14d", label: "14 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "mtd", label: "MTD" },
  { id: "qtd", label: "QTD" },
  { id: "ytd", label: "YTD" },
  { id: "12m", label: "12 months" },
  { id: "prev_year", label: "Prev. year" },
];

export function resolvePreset(preset: RangePreset, today: string): Period {
  switch (preset) {
    case "today": return { start: today, end: today };
    case "yesterday": return { start: addDays(today, -1), end: addDays(today, -1) };
    case "7d": return { start: addDays(today, -6), end: today };
    case "14d": return { start: addDays(today, -13), end: today };
    case "30d": return { start: addDays(today, -29), end: today };
    case "90d": return { start: addDays(today, -89), end: today };
    case "mtd": return { start: startOfMonth(today), end: today };
    case "qtd": return { start: startOfQuarter(today), end: today };
    case "ytd": return { start: startOfYear(today), end: today };
    case "12m": return { start: addDays(today, -364), end: today };
    case "prev_year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
  }
}
