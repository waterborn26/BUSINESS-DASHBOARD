// Customer intelligence — KPIs, segments, cohorts, channel LTV.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { Heatmap } from "@/components/charts/Heatmap";
import { fmtMonth } from "@/lib/dates";
import { fmtNum, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { customerKpis, cohorts, segments, channelLtv } from "@/engines/customers";

export default function Customers() {
  const { store, period } = useApp();
  const k = useMemo(() => customerKpis(store, period), [store, period]);
  const coh = useMemo(() => cohorts(store).slice(-12), [store]);
  const segs = useMemo(() => segments(store), [store]);
  const chan = useMemo(() => channelLtv(store), [store]);

  const best = [...coh].sort((a, b) => b.value60 - a.value60)[0];
  const paid = chan.find((c) => c.channel === "meta");

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Total customers" value={fmtNum(k.total)} />
        <Kpi label="New (period)" value={fmtNum(k.newInPeriod)} />
        <Kpi label="Returning orders (period)" value={fmtNum(k.returningInPeriod)} />
        <Kpi label="Repeat purchase rate" value={fmtPct(k.repeatRatePct, 1)} />
        <Kpi label="Avg LTV" value={fmtUsd(k.avgLtv)} />
        <Kpi label="Blended CAC" value={fmtUsd(k.blendedCac)} />
        <Kpi label="LTV : CAC" value={fmtRatio(k.ltvToCac)} />
        <Kpi label="Median days between orders" value={k.medianDaysBetweenOrders.toFixed(0)} />
      </div>

      {best && paid && (
        <div className="insight info">
          <div className="insight-title">Cohort insight</div>
          <div className="insight-detail">
            Customers acquired in {fmtMonth(best.cohort)} (top channel: {best.channelTop}) show a 60-day value of{" "}
            {fmtUsd(best.value60)} — {paid.avgLtv > 0 ? `${fmtPct(Math.abs(best.value60 / paid.avgLtv - 1), 0)} ${best.value60 > paid.avgLtv ? "higher" : "lower"} than the average Meta-acquired customer` : ""}.
            Email- and organic-acquired customers repeat at the highest rates.
          </div>
        </div>
      )}

      <div className="grid cols-2">
        <Card title="Cohorts — acquisition month × 60-day behavior">
          <Heatmap
            rows={["Customers", "Repeat ≤60d", "60-day value"]}
            cols={coh.map((c) => fmtMonth(c.cohort).slice(0, 3))}
            cells={[
              coh.map((c) => ({ value: c.customers, label: fmtNum(c.customers) })),
              coh.map((c) => ({ value: c.repeat60Pct, label: fmtPct(c.repeat60Pct, 0) })),
              coh.map((c) => ({ value: c.value60, label: fmtUsdCompact(c.value60) })),
            ]}
          />
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Each row is independently scaled (sequential blue = higher). 60-day value = average net spend
            within 60 days of first order.
          </p>
        </Card>

        <Card title="LTV by acquisition channel">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Channel</th><th className="num">Customers</th><th className="num">Avg LTV</th><th className="num">Repeat rate</th></tr></thead>
              <tbody>
                {chan.map((c) => (
                  <tr key={c.channel}>
                    <td style={{ textTransform: "capitalize" }}>{c.channel}</td>
                    <td className="num">{fmtNum(c.customers)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtUsd(c.avgLtv)}</td>
                    <td className="num">{fmtPct(c.repeatPct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Segments" pad0>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Segment</th><th>Definition</th><th className="num">Customers</th><th className="num">Lifetime value</th><th className="num">Avg value</th></tr></thead>
            <tbody>
              {segs.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.label}</td>
                  <td className="dim">{s.description}</td>
                  <td className="num">{fmtNum(s.count)}</td>
                  <td className="num">{fmtUsdCompact(s.totalValue)}</td>
                  <td className="num dim">{s.count ? fmtUsd(Math.round(s.totalValue / s.count)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
