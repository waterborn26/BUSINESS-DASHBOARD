// Sales analytics — revenue anatomy, trends, channels, hourly detail.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi, StmtRow, Delta } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { addDays, yearAgoPeriod } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import {
  bucketSeries, compare, hourlyRevenue, periodTotals, series, trafficSourceStats,
} from "@/engines/analytics";

export default function Sales() {
  const { store, period, compareMode } = useApp();
  const cmp = useMemo(() => compare(store, period), [store, period]);
  const c = cmp.current;
  const base = compareMode === "year" ? cmp.yearAgo : cmp.previous;

  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const rev = useMemo(() => {
    const pts = series(store, "net_revenue", period);
    return bucketSeries(pts, grain);
  }, [store, period, grain]);
  const revYoY = useMemo(() => {
    const pts = series(store, "net_revenue", yearAgoPeriod(period));
    return bucketSeries(pts, grain);
  }, [store, period, grain]);

  const sources = useMemo(() => trafficSourceStats(store, period), [store, period]);
  const hourly = useMemo(() => hourlyRevenue(store, addDays(store.today, -1)), [store]);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Gross sales" value={fmtUsdCompact(c.gross)} current={c.gross} base={base.gross} />
        <Kpi label="Discounts" value={fmtUsdCompact(c.discounts)} current={c.discounts} base={base.discounts} invert sub={<span>{fmtPct(c.discountRatePct, 1)}</span>} />
        <Kpi label="Refunds" value={fmtUsdCompact(c.refunds)} current={c.refunds} base={base.refunds} invert sub={<span>{fmtPct(c.refundRatePct, 1)}</span>} />
        <Kpi label="Shipping revenue" value={fmtUsdCompact(c.shippingRev)} current={c.shippingRev} base={base.shippingRev} />
        <Kpi label="Net sales" value={fmtUsdCompact(c.netRevenue)} current={c.netRevenue} base={base.netRevenue} />
        <Kpi label="Taxes collected" value={fmtUsdCompact(c.taxCollected)} provenance="imported" />
        <Kpi label="Orders" value={fmtNum(c.orders)} current={c.orders} base={base.orders} />
        <Kpi label="Units sold" value={fmtNum(c.units)} current={c.units} base={base.units} />
        <Kpi label="AOV" value={fmtUsd(c.aov)} current={c.aov} base={base.aov} />
        <Kpi label="Items / order" value={c.itemsPerOrder.toFixed(2)} current={c.itemsPerOrder} base={base.itemsPerOrder} />
      </div>

      <Card
        title={`Net revenue by ${grain}`}
        right={
          <span className="seg">
            {(["day", "week", "month"] as const).map((g) => (
              <button key={g} className={grain === g ? "on" : ""} onClick={() => setGrain(g)}>{g}</button>
            ))}
          </span>
        }
      >
        <LineChart
          labels={rev.map((p) => p.date)}
          series={[
            { name: "This period", color: "var(--s1)", values: rev.map((p) => p.value), area: true },
            { name: "Year ago", color: "var(--s4)", values: revYoY.slice(0, rev.length).map((p) => p.value) },
          ]}
          yFmt={fmtUsdCompact}
          height={240}
        />
      </Card>

      <div className="grid cols-2">
        <Card title="Revenue by traffic source">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Source</th><th className="num">Orders</th><th className="num">Revenue</th><th className="num">Conv.</th><th className="num">Share</th></tr></thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source}>
                    <td style={{ textTransform: "capitalize" }}>{s.source}</td>
                    <td className="num">{fmtNum(s.orders)}</td>
                    <td className="num">{fmtUsdCompact(s.revenue)}</td>
                    <td className="num">{fmtPct(s.conversion, 2)}</td>
                    <td className="num dim">{c.netRevenue ? fmtPct(s.revenue / c.netRevenue, 0) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Hourly revenue — yesterday">
          <BarChart
            labels={hourly.map((h) => `${h.hour}:00`)}
            series={[{ name: "Revenue", color: "var(--s1)", values: hourly.map((h) => h.revenue) }]}
            yFmt={fmtUsdCompact}
            xFmt={(l) => l}
            height={200}
            showLegend={false}
          />
        </Card>
      </div>

      <Card title="Sales bridge — gross to net">
        <div className="stmt" style={{ maxWidth: 480 }}>
          <StmtRow label="Gross sales" amount={c.gross} />
          <StmtRow label="Discounts" amount={c.discounts} neg indent />
          <StmtRow label="Refunds" amount={c.refunds} neg indent />
          <StmtRow label="Shipping revenue" amount={c.shippingRev} indent />
          <StmtRow label="Net sales" amount={c.netRevenue} total />
          <div className="stmt-row"><span className="lbl muted">vs {compareMode === "year" ? "same period last year" : "previous period"}</span>
            <Delta current={c.netRevenue} base={base.netRevenue} /></div>
        </div>
      </Card>
    </>
  );
}
