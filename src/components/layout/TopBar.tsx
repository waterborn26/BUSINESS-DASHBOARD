import React from "react";
import { useApp } from "@/state/AppContext";
import { ROUTES } from "@/state/routes";
import { DATA_SOURCES } from "@/data/store";
import { RANGE_PRESETS } from "@/lib/dates";
import { fmtDateFull } from "@/lib/dates";

export function TopBar() {
  const {
    route, preset, setPreset, compareMode, setCompareMode, setPaletteOpen,
    store, period, dataSource, setDataSource, setNavOpen,
  } = useApp();
  const def = ROUTES.find((r) => r.id === route);
  const src = DATA_SOURCES.find((d) => d.id === dataSource)!;
  return (
    <header className="topbar">
      <button className="nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open navigation">
        <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 4.5h13M2 8.5h13M2 12.5h13" />
          </g>
        </svg>
      </button>
      <h1>
        {def?.label ?? "Meridian"}
        <span className="sub">{fmtDateFull(period.start)} – {fmtDateFull(period.end)}</span>
      </h1>
      <div className="topbar-controls">
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
      </div>
    </header>
  );
}
