// Command Center — the daily home screen.
// Briefing → KPI grid → What Changed / Why / What Next / Where Is My Money / What Should I Do.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi, StmtRow, ProvenanceBadge } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { addDays, dateRange, fmtDate, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { compare, periodTotals, series } from "@/engines/analytics";
import { availableCash } from "@/engines/cash";
import { cashForecast } from "@/engines/cashflow";
import { dailyBriefing } from "@/engines/briefing";
import { forecastDaily } from "@/engines/forecast";
import { healthScore } from "@/engines/health";
import { inventoryRows, inventoryCapital } from "@/engines/inventory";
import { salesTaxSummary } from "@/engines/taxes";
import { recStatus, setRecStatus, type RecStatus } from "@/engines/recommend";
import type { Insight } from "@/engines/insights";

function InsightCard({ ins }: { ins: Insight }) {
  const [open, setOpen] = useState(false);
  const app = useApp();
  const cls = ins.kind === "win" ? "win" : ins.severity;
  return (
    <div className={`insight ${cls}`}>
      <div className="insight-title">
        {ins.title}
        <span className="badge" style={{ marginLeft: "auto", flexShrink: 0 }}>{ins.confidencePct}% conf.</span>
      </div>
      <div className="insight-detail">{ins.detail}</div>
      <div className="rec-actions">
        <button className="btn" onClick={() => setOpen(!open)}>{open ? "Hide evidence" : "Why?"}</button>
        {ins.drill && <button className="btn" onClick={() => app.navigate(ins.drill!)}>Open →</button>}
      </div>
      {open && (
        <div className="evidence">
          {ins.evidence.map((e) => (
            <div key={e.label}><span className="lbl">{e.label}</span><span className="val">{e.value}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommandCenter() {
  const app = useApp();
  const { store, openDrill } = app;
  const today = store.today;

  const briefing = useMemo(() => dailyBriefing(store), [store]);
  const last30: Period = { start: addDays(today, -29), end: today };
  const cmp = useMemo(() => compare(store, last30), [store]);
  const todayT = useMemo(() => periodTotals(store, { start: today, end: today }), [store]);
  const mtd = useMemo(() => periodTotals(store, { start: `${today.slice(0, 7)}-01`, end: today }), [store]);
  const ytd = useMemo(() => periodTotals(store, { start: `${today.slice(0, 4)}-01-01`, end: today }), [store]);
  const cash = useMemo(() => availableCash(store, today), [store]);
  const stx = useMemo(() => salesTaxSummary(store, last30), [store]);
  const invCap = useMemo(() => inventoryCapital(inventoryRows(store)), [store]);
  const health = useMemo(() => healthScore(store), [store]);
  const fc = useMemo(() => cashForecast(store, 90), [store]);
  const [recTick, setRecTick] = useState(0);

  // Revenue chart with 14-day forecast
  const revChart = useMemo(() => {
    const hist = series(store, "net_revenue", { start: addDays(today, -59), end: today });
    const f = forecastDaily(hist.map((p) => p.value), 14);
    const labels = [...hist.map((p) => p.date), ...Array.from({ length: 14 }, (_, i) => addDays(today, i + 1))];
    const actual = [...hist.map((p) => p.value), ...Array(14).fill(null)];
    const forecast = [...Array(hist.length - 1).fill(null), hist[hist.length - 1].value, ...f.mean];
    return { labels, actual, forecast, band: { lo: f.lo, hi: f.hi, startIndex: hist.length } };
  }, [store]);

  const c = cmp.current, p = cmp.previous;
  const yesterday = useMemo(() => periodTotals(store, { start: addDays(today, -1), end: addDays(today, -1) }), [store]);

  const markStatus = (id: string, s: RecStatus) => { setRecStatus(id, s); setRecTick((t) => t + 1); };

  return (
    <>
      {/* ── Briefing ── */}
      <Card title={<>Daily executive briefing <span className="badge">deterministic AI — demo mode</span></>}
        right={<span className="muted">{fmtDate(today)}</span>}>
        <p className="selectable" style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink)" }}>{briefing.headline}</p>
        <div className="ring-wrap" style={{ marginTop: 12 }}>
          <HealthRing total={health.total} />
          <div style={{ fontSize: 12, color: "var(--ink-2)", flex: 1 }}>
            <strong>Business health {health.total}/100.</strong>{" "}
            {health.components.filter((x) => x.score >= 75).slice(0, 2).map((x) => x.label).join(" and ")} are strong;{" "}
            {health.components.filter((x) => x.score < 55).slice(0, 2).map((x) => x.label.toLowerCase()).join(" and ") || "nothing"} needs attention.
            <button className="btn" style={{ marginLeft: 8 }} onClick={() => openDrill({
              title: `Business health: ${health.total}/100`,
              subtitle: "Weighted component scores — nothing arbitrary",
              body: (
                <div className="stmt">
                  {health.components.map((comp) => (
                    <div key={comp.id} style={{ marginBottom: 10 }}>
                      <div className="stmt-row subtotal">
                        <span className="lbl">{comp.label} <span className="muted">({Math.round(comp.weight * 100)}% weight)</span></span>
                        <span>{Math.round(comp.score)}/100</span>
                      </div>
                      <div className="muted" style={{ fontSize: 11.5 }}>{comp.explanation}</div>
                    </div>
                  ))}
                </div>
              ),
            })}>Why?</button>
          </div>
        </div>
      </Card>

      {/* ── KPI grid ── */}
      <div className="kpi-row">
        <Kpi label="Revenue today" value={fmtUsdCompact(todayT.netRevenue)} sub={<span>yday {fmtUsdCompact(yesterday.netRevenue)}</span>} onClick={() => app.navigate("sales")} />
        <Kpi label="Revenue MTD" value={fmtUsdCompact(mtd.netRevenue)} onClick={() => app.navigate("sales")} />
        <Kpi label="Revenue YTD" value={fmtUsdCompact(ytd.netRevenue)} onClick={() => app.navigate("sales")} />
        <Kpi label="Orders (30d)" value={fmtNum(c.orders)} current={c.orders} base={p.orders} />
        <Kpi label="AOV (30d)" value={fmtUsd(c.aov)} current={c.aov} base={p.aov} />
        <Kpi label="Gross profit (30d)" value={fmtUsdCompact(c.grossProfit)} current={c.grossProfit} base={p.grossProfit} sub={<span>{fmtPct(c.grossMarginPct, 0)}</span>} onClick={() => app.navigate("pnl")} />
        <Kpi label="Contribution (30d)" value={fmtUsdCompact(c.contributionProfit)} current={c.contributionProfit} base={p.contributionProfit} sub={<span>{fmtPct(c.contributionMarginPct, 0)}</span>} />
        <Kpi label="Conversion (30d)" value={fmtPct(c.conversion, 2)} current={c.conversion} base={p.conversion} onClick={() => app.navigate("website")} />
        <Kpi label="Sessions (30d)" value={fmtNum(c.sessions)} current={c.sessions} base={p.sessions} />
        <Kpi label="Total cash" value={fmtUsdCompact(cash.totalCash)} onClick={() => app.navigate("finance")} />
        <Kpi label="Available cash" value={fmtUsdCompact(cash.availableCash)} onClick={() => openAvailableCashDrill()} sub={<span className="muted">why? →</span>} />
        <Kpi label="Sales tax owed" value={fmtUsdCompact(stx.currentPayable)} provenance="imported" onClick={() => app.navigate("taxes")} />
        <Kpi label="Inventory at cost" value={fmtUsdCompact(invCap.atCost)} sub={<span>retail {fmtUsdCompact(invCap.atRetail)}</span>} onClick={() => app.navigate("inventory")} />
        <Kpi label="Ad spend (30d)" value={fmtUsdCompact(c.adSpend)} current={c.adSpend} base={p.adSpend} invert onClick={() => app.navigate("marketing")} />
        <Kpi label="MER (30d)" value={fmtRatio(c.mer)} current={c.mer} base={p.mer} />
        <Kpi label="Blended CAC (30d)" value={fmtUsd(c.blendedCac)} current={c.blendedCac} base={p.blendedCac} invert />
        <Kpi label="Returning customers" value={fmtPct(c.returningPct, 0)} current={c.returningPct} base={p.returningPct} />
        <Kpi label="30-day cash outlook" value={fmtUsdCompact(fc.endingCash30)} provenance="estimate" onClick={() => app.navigate("cashflow")} />
      </div>

      {/* ── Revenue + forecast ── */}
      <Card title="Net revenue — last 60 days + 14-day forecast" right={<span className="badge estimate">forecast = est.</span>}>
        <LineChart
          labels={revChart.labels}
          series={[
            { name: "Actual", color: "var(--s1)", values: revChart.actual, area: true },
            { name: "Forecast", color: "var(--s1)", values: revChart.forecast, dashed: true },
          ]}
          band={{ ...revChart.band, color: "var(--s1)" }}
          yFmt={(v) => fmtUsdCompact(v)}
          markerIndex={revChart.labels.indexOf(store.siteUpdateDay)}
          markerLabel="site update"
          height={230}
          showLegend={false}
        />
      </Card>

      <div className="grid cols-2">
        {/* ── What changed / why ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Card title="What changed — and why">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...briefing.problems, ...briefing.risks].slice(0, 4).map((i) => <InsightCard key={i.id} ins={i} />)}
              {[...briefing.wins].slice(0, 2).map((i) => <InsightCard key={i.id} ins={i} />)}
            </div>
          </Card>
        </div>

        {/* ── Where is my money ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Card title="Where is my money?">
            <div className="stmt">
              {cash.cashAccounts.map((a) => (
                <StmtRow key={a.label} label={a.label} amount={a.amount} indent />
              ))}
              <StmtRow label="Total cash" amount={cash.totalCash} subtotal />
              <StmtRow label={cash.inTransit.label} amount={cash.inTransit.amount} indent />
              {cash.deductions.map((d) => (
                <StmtRow key={d.label} label={d.label} amount={d.amount} neg indent badge={d.provenance === "estimate" ? "estimate" : d.provenance === "imported" ? "imported" : undefined} />
              ))}
              <StmtRow label="Available operating cash" amount={cash.availableCash} total />
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 11.5 }}>
              Next 30 days: inflows ~{fmtUsdCompact(fc.expectedInflows30)} · expenses ~{fmtUsdCompact(fc.expectedExpenses30)} ·
              inventory {fmtUsdCompact(fc.inventoryPurchases30)} · taxes {fmtUsdCompact(fc.taxPayments30)} →
              projected cash {fmtUsdCompact(fc.endingCash30)} <ProvenanceBadge p="estimate" />
            </div>
            {fc.warnings.map((w) => (
              <div key={w} className="insight warning" style={{ marginTop: 8 }}>
                <div className="insight-detail">{w}</div>
              </div>
            ))}
          </Card>

          <Card title="Financial position">
            <div className="stmt">
              {briefing.financialPosition.map((f) => (
                <div className="stmt-row" key={f.label}>
                  <span className="lbl">{f.label}{f.estimate && <span className="badge estimate">est.</span>}</span>
                  <span className={f.tone === "bad" ? "neg" : f.tone === "good" ? "pos" : ""}>{f.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* ── WHAT SHOULD I DO ── */}
      <Card title={<>What should I do? <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>ranked by impact × confidence × urgency ÷ difficulty</span></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} key={recTick}>
          {briefing.actions.map((r, i) => {
            const st = recStatus(r.id);
            return (
              <div key={r.id} className={`insight ${st !== "open" ? "" : i === 0 ? "critical" : i < 3 ? "warning" : "info"}`}
                style={st !== "open" ? { opacity: 0.55 } : undefined}>
                <div className="insight-title">
                  {i + 1}. {r.title}
                  <span className="badge" style={{ marginLeft: "auto" }}>{fmtUsdCompact(r.impactMonthly)}/mo est.</span>
                  <span className="badge">{r.confidencePct}%</span>
                  {r.cashRequired > 0 && <span className="badge">{fmtUsdCompact(r.cashRequired)} cash</span>}
                </div>
                <div className="insight-detail">{r.action}</div>
                <div className="rec-actions">
                  <ExplainRec r={r} />
                  {(["done", "ignored", "remind", "investigate"] as RecStatus[]).map((s) => (
                    <button key={s} className={`btn ${st === s ? "done" : ""}`} onClick={() => markStatus(r.id, st === s ? "open" : s)}>
                      {st === s ? "✓ " : ""}{s === "done" ? "Done" : s === "ignored" ? "Ignore" : s === "remind" ? "Remind me" : "Investigate"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );

  function openAvailableCashDrill() {
    openDrill({
      title: `Available cash: ${fmtUsd(cash.availableCash)}`,
      subtitle: "Exactly how this number is calculated",
      body: (
        <div className="stmt">
          {cash.cashAccounts.map((a) => <StmtRow key={a.label} label={a.label} amount={a.amount} indent />)}
          <StmtRow label="Total cash" amount={cash.totalCash} subtotal />
          {cash.deductions.map((d) => (
            <div key={d.label}>
              <StmtRow label={d.label} amount={d.amount} neg badge={d.provenance === "estimate" ? "estimate" : undefined} />
              {d.detail && <div className="muted" style={{ fontSize: 11, paddingLeft: 2, marginTop: -2, marginBottom: 4 }}>{d.detail}</div>}
            </div>
          ))}
          <StmtRow label="Available operating cash" amount={cash.availableCash} total />
          <p className="muted" style={{ marginTop: 12, fontSize: 11.5 }}>
            {cash.inTransit.label}: {fmtUsd(cash.inTransit.amount)} — money that exists but has not
            settled to the bank; excluded from both totals above.
          </p>
        </div>
      ),
    });
  }
}

function ExplainRec({ r }: { r: { reason: string; evidence: { label: string; value: string }[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(!open)}>{open ? "Hide" : "Why?"}</button>
      {open && (
        <div style={{ width: "100%" }}>
          <div className="insight-detail">{r.reason}</div>
          <div className="evidence">
            {r.evidence.map((e) => (
              <div key={e.label}><span className="lbl">{e.label}</span><span className="val">{e.value}</span></div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function HealthRing({ total }: { total: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const color = total >= 70 ? "var(--good)" : total >= 50 ? "var(--warning)" : "var(--critical)";
  return (
    <svg width={64} height={64} style={{ flexShrink: 0 }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
      <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${(total / 100) * c} ${c}`} strokeLinecap="round"
        transform="rotate(-90 32 32)" />
      <text x={32} y={37} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 15, fontWeight: 700 }}>{total}</text>
    </svg>
  );
}
