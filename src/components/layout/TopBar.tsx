import React from "react";
import { useApp } from "@/state/AppContext";
import { ROUTES } from "@/state/routes";
import { DATA_SOURCES } from "@/data/store";
import { RANGE_PRESETS } from "@/lib/dates";
import { fmtDateFull } from "@/lib/dates";

export function TopBar() {
  const {
    route, preset, setPreset, compareMode, setCompareMode, setPaletteOpen,
    store, period, dataSource, setDataSource,
  } = useApp();
  const def = ROUTES.find((r) => r.id === route);
  const src = DATA_SOURCES.find((d) => d.id === dataSource)!;
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
      <select
        value={dataSource}
        onChange={(e) => setDataSource(e.target.value as typeof dataSource)}
        title="Which dataset the app is reading"
        style={{ fontSize: 11.5, padding: "3px 6px", maxWidth: 190 }}
      >
        {DATA_SOURCES.map((d) => (
          <option key={d.id} value={d.id}>{d.label}</option>
        ))}
      </select>
      {src.real
        ? <span className="badge imported" title={`Shopify snapshot · ${store.today}`}>● live data</span>
        : <span className="badge estimate" title="Simulated brand — not your business">● simulated</span>}
    </header>
  );
}
