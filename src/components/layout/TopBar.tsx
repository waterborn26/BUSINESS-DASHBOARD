import React from "react";
import { useApp } from "@/state/AppContext";
import { ROUTES } from "@/state/routes";
import { RANGE_PRESETS } from "@/lib/dates";
import { fmtDateFull } from "@/lib/dates";

export function TopBar() {
  const { route, preset, setPreset, compareMode, setCompareMode, setPaletteOpen, store, period } = useApp();
  const def = ROUTES.find((r) => r.id === route);
  return (
    <header className="topbar">
      <h1>
        {def?.label ?? "Meridian"}
        <span className="sub">{fmtDateFull(period.start)} – {fmtDateFull(period.end)}</span>
      </h1>
      <div className="seg" role="group" aria-label="Date range">
        {RANGE_PRESETS.filter((p) => !["yesterday", "14d", "qtd"].includes(p.id)).map((p) => (
          <button key={p.id} className={preset === p.id ? "on" : ""} onClick={() => setPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Compare against">
        <button className={compareMode === "previous" ? "on" : ""} onClick={() => setCompareMode("previous")}>vs prev.</button>
        <button className={compareMode === "year" ? "on" : ""} onClick={() => setCompareMode("year")}>vs YoY</button>
      </div>
      <button className="btn" onClick={() => setPaletteOpen(true)}>
        Search <span className="kbd">⌘K</span>
      </button>
      <span className="badge imported" title={`Demo dataset synced ${store.today}`}>● synced</span>
    </header>
  );
}
