// Goals — target vs actual vs projection, with required pace.

import React, { useMemo } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { addDays, dateRange, daysBetween, startOfYear, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { periodTotals, series } from "@/engines/analytics";
import { availableCash } from "@/engines/cash";
import { forecastDaily, forecastSum } from "@/engines/forecast";

export default function Goals() {
  const { store } = useApp();
  const today = store.today;

  const rows = useMemo(() => {
    const ytdP: Period = { start: startOfYear(today), end: today };
    const ytd = periodTotals(store, ytdP);
    const mtd = periodTotals(store, { start: `${today.slice(0, 7)}-01`, end: today });
    const cash = availableCash(store, today);
    const daysLeft = daysBetween(today, `${today.slice(0, 4)}-12-31`);
    const monthsLeft = Math.max(0.5, daysLeft / 30.4);

    // annual projections from forecast
    const hist = dateRange(addDays(today, -119), today).map((d) => {
      const r = store.rollups.get(d);
      return r ? r.gross - r.discounts - r.refunds + r.shippingRev : 0;
    });
    const revFc = forecastSum(forecastDaily(hist, Math.min(365, daysLeft)), daysLeft);
    const histC = dateRange(addDays(today, -119), today).map((d) => {
      const r = store.rollups.get(d);
      return r ? r.gross - r.discounts - r.refunds + r.shippingRev - r.cogs - r.fees - r.fulfillment - r.adSpend : 0;
    });
    const conFc = forecastSum(forecastDaily(histC, Math.min(365, daysLeft)), daysLeft);

    return store.goals.map((g) => {
      let actual = 0, projected = 0, unit: (v: number) => string = fmtUsdCompact;
      switch (g.metric) {
        case "net_revenue": actual = ytd.netRevenue; projected = ytd.netRevenue + revFc.mean; break;
        case "contribution_profit": actual = ytd.contributionProfit; projected = ytd.contributionProfit + conFc.mean; break;
        case "available_cash": actual = cash.availableCash; projected = cash.availableCash; break;
        case "orders": actual = mtd.orders; projected = Math.round((mtd.orders / Number(today.slice(8, 10))) * 30); unit = (v) => fmtNum(Math.round(v)); break;
        case "conversion": actual = periodTotals(store, { start: addDays(today, -29), end: today }).conversion; projected = actual; unit = (v) => fmtPct(v, 2); break;
      }
      const pct = g.target ? actual / g.target : 0;
      const requiredMonthly = g.period === "annual" && g.isMoney ? Math.max(0, (g.target - actual) / monthsLeft) : null;
      return { g, actual, projected, pct, requiredMonthly, unit, onTrack: projected >= g.target };
    });
  }, [store]);

  const revGoal = rows.find((r) => r.g.metric === "net_revenue");

  return (
    <>
      {revGoal && (
        <div className="insight info">
          <div className="insight-detail selectable" style={{ fontSize: 13 }}>
            To reach your {fmtUsdCompact(revGoal.g.target)} annual revenue goal, you need to average{" "}
            <strong>{revGoal.requiredMonthly !== null ? fmtUsdCompact(revGoal.requiredMonthly) : "—"}/month</strong> for the remainder
            of the year. Your current forecast lands at <strong>{fmtUsdCompact(revGoal.projected)}</strong>
            {" "}({revGoal.onTrack ? "on track" : `${fmtUsdCompact(revGoal.g.target - revGoal.projected)} short at current pace`}).
          </div>
        </div>
      )}

      <div className="grid cols-2">
        {rows.map(({ g, actual, projected, pct, requiredMonthly, unit, onTrack }) => (
          <Card key={g.id} title={<>{g.label} <span className="badge">{g.period}</span></>}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="kpi-value" style={{ fontSize: 24 }}>{unit(actual)}</span>
              <span className="muted">of {unit(g.target)} target</span>
              <span className={`badge ${onTrack ? "good" : "warning"}`} style={{ marginLeft: "auto" }}>
                {onTrack ? "on track" : "behind pace"}
              </span>
            </div>
            <div style={{ background: "var(--surface-2)", borderRadius: 5, height: 10, marginTop: 10, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${Math.min(100, pct * 100)}%`, height: "100%",
                background: onTrack ? "var(--s3)" : "var(--s4)", borderRadius: 5,
                transition: "width 400ms ease",
              }} />
            </div>
            <div className="kpi-sub" style={{ marginTop: 8, justifyContent: "space-between", display: "flex" }}>
              <span>{fmtPct(pct, 0)} complete</span>
              <span>projected: {unit(projected)} <span className="badge estimate">est.</span></span>
              {requiredMonthly !== null && <span>required pace: {fmtUsdCompact(requiredMonthly)}/mo</span>}
            </div>
          </Card>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11.5 }}>
        Projections use the same transparent forecasting engine as the Forecasting screen (trend × weekday
        decomposition). Goals are stored locally and editable in the live build.
      </p>
    </>
  );
}
