// Application state: route, global date range, comparison mode, theme,
// command palette, drilldown drawer, keyboard shortcuts.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getStore, getDataSourceId, setDataSourceId, type DataSourceId, type Store } from "@/data/store";
import { resolvePreset, type Period, type RangePreset } from "@/lib/dates";

export type CompareMode = "previous" | "year";

export interface DrillContent {
  title: string;
  subtitle?: string;
  body: React.ReactNode;
}

interface AppState {
  store: Store;
  dataSource: DataSourceId;
  setDataSource: (id: DataSourceId) => void;
  route: string;
  navigate: (r: string) => void;
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  period: Period;
  compareMode: CompareMode;
  setCompareMode: (m: CompareMode) => void;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
  drill: DrillContent | null;
  openDrill: (d: DrillContent) => void;
  closeDrill: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

const LS = {
  get(key: string, fallback: string): string {
    try { return localStorage.getItem(`meridian.${key}`) ?? fallback; } catch { return fallback; }
  },
  set(key: string, value: string) {
    try { localStorage.setItem(`meridian.${key}`, value); } catch { /* private mode */ }
  },
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dataSource, setDataSourceState] = useState<DataSourceId>(() => getDataSourceId());
  const store = useMemo(() => getStore(dataSource), [dataSource]);
  const [route, setRoute] = useState<string>(LS.get("route", "command"));
  // A 30-day default suits a business trading every day. A store with sparse recent
  // months would open on an empty screen, so real datasets default to 12 months.
  const [preset, setPresetState] = useState<RangePreset>(
    () => (LS.get("preset", "") || (dataSource === "demo" ? "30d" : "12m")) as RangePreset,
  );
  const [compareMode, setCompareModeState] = useState<CompareMode>(LS.get("compare", "previous") as CompareMode);
  const [theme, setThemeState] = useState<"dark" | "light">(LS.get("theme", "dark") as "dark" | "light");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drill, setDrill] = useState<DrillContent | null>(null);

  const navigate = useCallback((r: string) => {
    setRoute(r);
    LS.set("route", r);
    setDrill(null);
  }, []);
  const setPreset = useCallback((p: RangePreset) => { setPresetState(p); LS.set("preset", p); }, []);
  const setDataSource = useCallback((id: DataSourceId) => {
    setDataSourceId(id);
    setDataSourceState(id);
    setDrill(null);
    // Each dataset has its own natural window; don't carry one over to the other.
    const next: RangePreset = id === "demo" ? "30d" : "12m";
    setPresetState(next);
    LS.set("preset", next);
  }, []);
  const setCompareMode = useCallback((m: CompareMode) => { setCompareModeState(m); LS.set("compare", m); }, []);
  const setTheme = useCallback((t: "dark" | "light") => { setThemeState(t); LS.set("theme", t); }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Keyboard shortcuts: ⌘K palette, ⌘1..9 nav, Esc closes overlays, g+key sequences.
  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const gMap: Record<string, string> = {
      c: "command", s: "sales", f: "finance", t: "transactions", p: "pnl",
      x: "cashflow", i: "inventory", m: "marketing", a: "analyst", r: "reports",
    };
    const quick = ["command", "sales", "finance", "transactions", "pnl", "cashflow", "products", "inventory", "marketing"];
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA";
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") { setPaletteOpen(false); setDrill(null); return; }
      if (inField) return;
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const r = quick[Number(e.key) - 1];
        if (r) navigate(r);
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "g") {
          gPending = true;
          clearTimeout(gTimer);
          gTimer = setTimeout(() => { gPending = false; }, 900);
          return;
        }
        if (gPending && gMap[e.key]) {
          navigate(gMap[e.key]);
          gPending = false;
        }
        if (e.key === "/") {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const period = useMemo(() => resolvePreset(preset, store.today), [preset, store.today]);

  const value: AppState = {
    store, dataSource, setDataSource,
    route, navigate, preset, setPreset, period,
    compareMode, setCompareMode, theme, setTheme,
    paletteOpen, setPaletteOpen,
    drill, openDrill: setDrill, closeDrill: () => setDrill(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
