// Website analytics — funnel, conversion trends, segment drilldowns.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { Funnel } from "@/components/charts/Funnel";
import { LineChart } from "@/components/charts/LineChart";
import { addDays, dateRange } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/money";
import { funnel, periodTotals } from "@/engines/analytics";

export default function Website() {
  const { store, period } = useApp();
  const [device, setDevice] = useState<"all" | "desktop" | "mobile">("all");
  const [source, setSource] = useState("all");

  const filter = useMemo(() => ({
    device: device === "all" ? undefined : device,
    source: source === "all" ? undefined : source,
  }), [device, source]);

  const f = useMemo(() => funnel(store, period, filter), [store, period, filter]);
  const t = useMemo(() => periodTotals(store, period), [store, period]);

  // conversion by device over last 60 days (site-update storyline)
  const crTrend = useMemo(() => {
    const days = dateRange(addDays(store.today, -59), store.today);
    const calc = (dev: "desktop" | "mobile") => days.map((d) => {
      let s = 0, p = 0;
      for (const row of store.trafficDaily) {
        if (row.date !== d || row.device !== dev) continue;
        s += row.sessions; p += row.purchases;
      }
      return s ? (p / s) * 100 : 0;
    });
    return { days, desktop: calc("desktop"), mobile: calc("mobile") };
  }, [store]);

  const sources = useMemo(() => [...new Set(store.trafficDaily.map((r) => r.source))], [store]);

  // biggest drop-off step
  const dropIdx = useMemo(() => {
    let worst = 1, idx = 1;
    for (let i = 1; i < f.length; i++) {
      const rate = f[i - 1].value ? f[i].value / f[i - 1].value : 1;
      if (rate < worst) { worst = rate; idx = i; }
    }
    return idx;
  }, [f]);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Sessions" value={fmtNum(t.sessions)} />
        <Kpi label="Conversion rate" value={fmtPct(t.conversion, 2)} />
        <Kpi label="Revenue / session" value={fmtUsd(t.revenuePerSession)} />
        <Kpi label="Orders" value={fmtNum(t.orders)} />
        <Kpi label="AOV" value={fmtUsd(t.aov)} />
      </div>

      <div className="grid cols-2">
        <Card
          title="Purchase funnel"
          right={
            <>
              <span className="seg">
                {(["all", "desktop", "mobile"] as const).map((d) => (
                  <button key={d} className={device === d ? "on" : ""} onClick={() => setDevice(d)}>{d}</button>
                ))}
              </span>
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">All sources</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          }
        >
          <Funnel steps={f} />
          <div className="insight warning" style={{ marginTop: 12 }}>
            <div className="insight-detail">
              Largest drop-off: <strong>{f[dropIdx - 1].label} → {f[dropIdx].label}</strong>
              {" "}({fmtPct(f[dropIdx - 1].value ? f[dropIdx].value / f[dropIdx - 1].value : 0, 1)} continue).
              {device !== "desktop" && " Mobile add-to-cart deteriorated after the site update — compare devices with the toggle."}
            </div>
          </div>
        </Card>

        <Card title="Conversion by device — 60 days">
          <LineChart
            labels={crTrend.days}
            series={[
              { name: "Desktop", color: "var(--s1)", values: crTrend.desktop },
              { name: "Mobile", color: "var(--s2)", values: crTrend.mobile },
            ]}
            yFmt={(v) => `${v.toFixed(1)}%`}
            markerIndex={crTrend.days.indexOf(store.siteUpdateDay)}
            markerLabel="site update"
            height={230}
          />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            Mobile conversion broke from desktop at the site update — the divergence, not the absolute
            level, is the signal. Desktop is the control group.
          </p>
        </Card>
      </div>
    </>
  );
}
