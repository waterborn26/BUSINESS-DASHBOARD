// Command Center — the daily home screen.
//
// Reads visually first: a health gauge and briefing, one hero figure (available cash)
// with a composition meter, then stat tiles that carry their own 30-day shape. The full
// metric grid is retained below, grouped and collapsed, so nothing is lost — it just no
// longer competes with the story for attention.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, StatTile, StmtRow, Delta, ProvenanceBadge } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { Gauge, ScoreBars } from "@/components/charts/Gauge";
import { SplitMeter, type MeterSegment } from "@/components/charts/SplitMeter";
import { addDays, fmtDate, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { movingAverage } from "@/lib/stats";
import { compare, periodTotals, series, type MetricId } from "@/engines/analytics";
import { availableCash } from "@/engines/cash";
import { cashForecast } from "@/engines/cashflow";
import { dailyBriefing } from "@/engines/briefing";
import { forecastDaily } from "@/engines/forecast";
import { healthScore } from "@/engines/health";
import { inventoryRows, inventoryCapital, CASH_FLOOR } from "@/engines/inventory";
import { salesTaxSummary } from "@/engines/taxes";
import { pnl } from "@/engines/pnl";
import { recStatus, setRecStatus, type RecStatus, type Recommendation } from "@/engines/recommend";
import type { Insight } from "@/engines/insights";

export default function CommandCenter() {
  const app = useApp();
  const { store, openDrill } = app;
  const today = store.today;
  const last30: Period = { start: addDays(today, -29), end: today };

  const briefing = useMemo(() => dailyBriefing(store), [store]);
  const cmp = useMemo(() => compare(store, last30), [store]);
  const cash = useMemo(() => availableCash(store, today), [store]);
  const health = useMemo(() => healthScore(store), [store]);
  const fc = useMemo(() => cashForecast(store, 90), [store]);
  const stx = useMemo(() => salesTaxSummary(store, last30), [store]);
  const invCap = useMemo(() => inventoryCapital(inventoryRows(store)), [store]);
  const mtd = useMemo(() => periodTotals(store, { start: `${today.slice(0, 7)}-01`, end: today }), [store]);
  const ytd = useMemo(() => periodTotals(store, { start: `${today.slice(0, 4)}-01-01`, end: today }), [store]);
  const todayT = useMemo(() => periodTotals(store, { start: today, end: today }), [store]);
  // Operating profit comes from the ledger, never from netting contribution by hand.
  const statement = useMemo(() => pnl(store, last30), [store]);

  const [recTick, setRecTick] = useState(0);
  const [showAll, setShowAll] = useState(false);

  // 30-day shape for every stat tile, computed once.
  // Daily values carry heavy weekday seasonality, which reads as noise at 90px wide —
  // a trailing 7-day mean shows the trend the tile is actually claiming.
  const spark = useMemo(() => {
    const of = (m: MetricId) => {
      const raw = series(store, m, { start: addDays(today, -35), end: today }).map((p) => p.value);
      return movingAverage(raw, 7).slice(-30);
    };
    return {
      net_revenue: of("net_revenue"),
      orders: of("orders"),
      aov: of("aov"),
      conversion: of("conversion"),
      sessions: of("sessions"),
      gross_profit: of("gross_profit"),
      contribution_profit: of("contribution_profit"),
      ad_spend: of("ad_spend"),
      units: of("units"),
      new_customers: of("new_customers"),
      cac: of("cac"),
      mer: of("mer"),
    } as Record<string, number[]>;
  }, [store]);

  const revChart = useMemo(() => {
    const hist = series(store, "net_revenue", { start: addDays(today, -59), end: today });
    const f = forecastDaily(hist.map((p) => p.value), 14);
    return {
      labels: [...hist.map((p) => p.date), ...Array.from({ length: 14 }, (_, i) => addDays(today, i + 1))],
      actual: [...hist.map((p) => p.value), ...Array(14).fill(null)],
      forecast: [...Array(hist.length - 1).fill(null), hist[hist.length - 1].value, ...f.mean],
      band: { lo: f.lo, hi: f.hi, startIndex: hist.length },
    };
  }, [store]);

  const c = cmp.current;
  const p = cmp.previous;

  // Total cash split into what is committed vs what is genuinely yours.
  const cashSegments: MeterSegment[] = useMemo(() => [
    ...cash.deductions.map((d) => ({ label: d.label.replace("Estimated ", "Est. ").replace(" (Amex)", ""), value: d.amount, detail: d.detail })),
    { label: "Available to spend", value: Math.max(0, cash.availableCash), highlight: true },
  ], [cash]);

  const risks = [...briefing.problems, ...briefing.risks];
  const stockoutCount = useMemo(
    () => inventoryRows(store).filter((r) => r.health === "Stockout risk").length, [store]);
  const maxImpact = Math.max(...briefing.actions.map((r) => r.impactMonthly), 1);
  const markStatus = (id: string, s: RecStatus) => { setRecStatus(id, s); setRecTick((t) => t + 1); };

  const projections = useMemo(() => ([30, 60, 90] as const).map((d) => ({
    label: `In ${d} days`,
    value: fc.points[d - 1]?.available ?? cash.availableCash,
  })), [fc, cash]);

  return (
    <>
      {/* ── Briefing + health ───────────────────────────── */}
      <Card>
        <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <Gauge value={health.total} size={128} label="HEALTH" />
            <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={openHealthDrill}>
              Why?
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 340 }}>
            <div className="band-title" style={{ marginBottom: 8 }}>
              Daily briefing · {fmtDate(today)}
              <span className="badge">deterministic AI — demo mode</span>
            </div>
            <p className="selectable" style={{ fontSize: 14, lineHeight: 1.6 }}>{briefing.headline}</p>
            <div className="chip-row" style={{ marginTop: 12 }}>
              {([
                { n: risks.length, label: "need attention", color: "var(--critical)", route: "alerts" },
                { n: briefing.opportunities.length, label: "opportunities", color: "var(--s1)", route: "opportunities" },
                { n: briefing.wins.length, label: "going well", color: "var(--good)", route: "sales" },
                { n: stockoutCount, label: "stockout risks", color: "var(--warning)", route: "inventory" },
              ] as const)
                .filter((chip) => chip.n > 0)
                .map((chip) => (
                  <button key={chip.label} className="chip" onClick={() => app.navigate(chip.route)}>
                    <span className="dot" style={{ background: chip.color }} />
                    {chip.n} {chip.label}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Hero: where I stand ─────────────────────────── */}
      <div className="band-title">Where I stand</div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div className="stat-label">Available to spend right now</div>
              <div className="hero-figure">{fmtUsd(cash.availableCash)}</div>
              <div className="hero-sub">
                of {fmtUsd(cash.totalCash)} total cash ·{" "}
                <a className="link" onClick={openAvailableCashDrill}>why? →</a>
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="stat-label" style={{ justifyContent: "flex-end" }}>In transit</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{fmtUsdCompact(cash.inTransit.amount)}</div>
              <div className="hero-sub">settles in ~2 days</div>
            </div>
          </div>
          <div style={{ marginTop: 18 }}>
            <SplitMeter
              segments={cashSegments}
              fmt={(v) => fmtUsdCompact(v)}
              onSegmentClick={openAvailableCashDrill}
            />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            Every blue segment is money that already belongs to someone else — tax
            authorities, vendors, your card. Only the green is yours to deploy.
          </p>
          <div style={{ marginTop: 14 }}>
            <div className="band-title" style={{ marginBottom: 8 }}>
              Projected available cash <span className="badge estimate">est.</span>
            </div>
            <div className="grid cols-3" style={{ gap: 8 }}>
              {projections.map((pr) => (
                <MiniStat key={pr.label} label={pr.label} value={fmtUsdCompact(pr.value)}
                  tone={pr.value < CASH_FLOOR ? "bad" : undefined}
                  sub={pr.value < CASH_FLOOR ? "below floor" : undefined} />
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
              Tightest moment: <strong style={{ color: fc.trough.available < CASH_FLOOR ? "var(--delta-bad)" : "var(--ink)" }}>
                {fmtUsdCompact(fc.trough.available)}
              </strong> around {fmtDate(fc.trough.date)}
              {fc.trough.available < CASH_FLOOR
                ? ` — below your ${fmtUsdCompact(CASH_FLOOR)} floor.`
                : ` — stays above your ${fmtUsdCompact(CASH_FLOOR)} floor.`}
            </p>
          </div>
        </Card>

        <Card title="90-day cash outlook" right={<span className="badge estimate">est.</span>}>
          <LineChart
            labels={fc.points.map((pt) => pt.date)}
            series={[
              { name: "Projected cash", color: "var(--s1)", values: fc.points.map((pt) => pt.cash), area: true },
              { name: "Available", color: "var(--s3)", values: fc.points.map((pt) => pt.available), dashed: true },
            ]}
            yFmt={fmtUsdCompact}
            height={168}
          />
          <div className="grid cols-2" style={{ gap: 8, marginTop: 10 }}>
            <MiniStat label="Inflows (30d)" value={fmtUsdCompact(fc.expectedInflows30)} tone="good" />
            <MiniStat label="Outflows (30d)" value={fmtUsdCompact(fc.expectedExpenses30 + fc.inventoryPurchases30 + fc.taxPayments30)} tone="bad" />
          </div>
          {fc.warnings.length > 0 && (
            <div className="insight warning" style={{ marginTop: 10 }}>
              <div className="insight-detail">{fc.warnings[0]}</div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Performance stat tiles ──────────────────────── */}
      <div className="band-title">Performance · last 30 days vs previous 30</div>
      <div className="stat-row">
        <StatTile label="Net revenue" value={fmtUsdCompact(c.netRevenue)} spark={spark.net_revenue}
          current={c.netRevenue} base={p.netRevenue}
          note={<span className="muted">{fmtUsdCompact(c.netRevenue / 30)}/day avg</span>}
          onClick={() => app.navigate("sales")} size="lg" />
        <StatTile label="Contribution profit" value={fmtUsdCompact(c.contributionProfit)} spark={spark.contribution_profit}
          current={c.contributionProfit} base={p.contributionProfit} accent="var(--s3)"
          note={<span className="muted">{fmtPct(c.contributionMarginPct, 0)} margin</span>}
          onClick={() => app.navigate("pnl")} size="lg" />
        <StatTile label="Orders" value={fmtNum(c.orders)} spark={spark.orders}
          current={c.orders} base={p.orders} note={<span className="muted">AOV {fmtUsd(c.aov)}</span>}
          onClick={() => app.navigate("sales")} size="lg" />
        <StatTile label="Conversion rate" value={fmtPct(c.conversion, 2)} spark={spark.conversion}
          current={c.conversion} base={p.conversion} accent="var(--s4)"
          note={<span className="muted">{fmtNum(c.sessions)} sessions</span>}
          onClick={() => app.navigate("website")} size="lg" />
      </div>

      {/* ── Revenue + forecast ──────────────────────────── */}
      <Card title="Net revenue — last 60 days + 14-day forecast" right={<span className="badge estimate">forecast = est.</span>}>
        <LineChart
          labels={revChart.labels}
          series={[
            { name: "Actual", color: "var(--s1)", values: revChart.actual, area: true },
            { name: "Forecast", color: "var(--s1)", values: revChart.forecast, dashed: true },
          ]}
          band={{ ...revChart.band, color: "var(--s1)" }}
          yFmt={fmtUsdCompact}
          markerIndex={revChart.labels.indexOf(store.siteUpdateDay)}
          markerLabel="site update"
          height={220}
          showLegend={false}
        />
      </Card>

      {/* ── What changed / financial position ───────────── */}
      <div className="grid cols-2">
        <Card title="What changed — and why">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...risks.slice(0, 4), ...briefing.wins.slice(0, 1)].map((i) => (
              <InsightCard key={i.id} ins={i} spark={i.metric ? spark[i.metric] : undefined} />
            ))}
          </div>
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
          <div className="grid cols-2" style={{ gap: 8, marginTop: 14 }}>
            <MiniStat label="Inventory at cost" value={fmtUsdCompact(invCap.atCost)} sub={`retail ${fmtUsdCompact(invCap.atRetail)}`} />
            <MiniStat label="Sales tax owed" value={fmtUsdCompact(stx.currentPayable)} sub="imported" />
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="band-title" style={{ marginBottom: 8 }}>Health drivers</div>
            <ScoreBars items={health.components.slice(0, 5)} />
          </div>
        </Card>
      </div>

      {/* ── WHAT SHOULD I DO ────────────────────────────── */}
      <Card title={<>What should I do? <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>ranked by impact × confidence × urgency ÷ difficulty</span></>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} key={recTick}>
          {briefing.actions.map((r, i) => (
            <ActionCard key={r.id} r={r} rank={i + 1} maxImpact={maxImpact}
              status={recStatus(r.id)} onStatus={markStatus} onOpen={() => r.drill && app.navigate(r.drill)} />
          ))}
        </div>
      </Card>

      {/* ── Full metric grid, retained but demoted ──────── */}
      <Card
        title="All metrics"
        right={
          <button className="btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide" : `Show all ${METRIC_GROUPS.reduce((t, g) => t + g.items.length, 0)}`}
          </button>
        }
      >
        {!showAll && (
          <p className="muted" style={{ fontSize: 12 }}>
            Every KPI — sales, profitability, cash, marketing and customers — with comparisons
            against yesterday, the previous period, last year, forecast and target.
          </p>
        )}
        {showAll && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {METRIC_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="band-title" style={{ marginBottom: 8 }}>{g.title}</div>
                <div className="kpi-row">
                  {g.items.map((m) => {
                    const v = metricValue(m.id);
                    return (
                      <div className="kpi clickable" key={m.id} onClick={() => m.route && app.navigate(m.route)}>
                        <div className="kpi-label">
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>
                          {m.provenance && <ProvenanceBadge p={m.provenance} />}
                        </div>
                        <div className="kpi-value">{v.value}</div>
                        <div className="kpi-sub">
                          {v.current !== undefined && v.base !== undefined && (
                            <Delta current={v.current} base={v.base} invert={m.invert} />
                          )}
                          {v.sub && <span className="muted">{v.sub}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );

  // ── metric registry for the full grid ──
  function metricValue(id: string): { value: string; current?: number; base?: number; sub?: string } {
    switch (id) {
      case "rev_today": return { value: fmtUsdCompact(todayT.netRevenue), sub: `yday ${fmtUsdCompact(periodTotals(store, { start: addDays(today, -1), end: addDays(today, -1) }).netRevenue)}` };
      case "rev_mtd": return { value: fmtUsdCompact(mtd.netRevenue) };
      case "rev_ytd": return { value: fmtUsdCompact(ytd.netRevenue) };
      case "gross_rev": return { value: fmtUsdCompact(c.gross), current: c.gross, base: p.gross };
      case "units": return { value: fmtNum(c.units), current: c.units, base: p.units };
      case "items_order": return { value: c.itemsPerOrder.toFixed(2), current: c.itemsPerOrder, base: p.itemsPerOrder };
      case "refund_rate": return { value: fmtPct(c.refundRatePct, 1), current: c.refundRatePct, base: p.refundRatePct };
      case "discount_rate": return { value: fmtPct(c.discountRatePct, 1), current: c.discountRatePct, base: p.discountRatePct };
      case "gross_profit": return { value: fmtUsdCompact(c.grossProfit), current: c.grossProfit, base: p.grossProfit, sub: fmtPct(c.grossMarginPct, 0) };
      case "contribution": return { value: fmtUsdCompact(c.contributionProfit), current: c.contributionProfit, base: p.contributionProfit, sub: fmtPct(c.contributionMarginPct, 0) };
      case "op_profit": return { value: fmtUsdCompact(statement.operatingProfit), sub: fmtPct(statement.operatingMarginPct, 1) };
      case "gross_margin": return { value: fmtPct(c.grossMarginPct, 1), current: c.grossMarginPct, base: p.grossMarginPct };
      case "contrib_margin": return { value: fmtPct(c.contributionMarginPct, 1), current: c.contributionMarginPct, base: p.contributionMarginPct };
      case "total_cash": return { value: fmtUsdCompact(cash.totalCash) };
      case "available_cash": return { value: fmtUsdCompact(cash.availableCash) };
      case "tax_liab": return { value: fmtUsdCompact(stx.currentPayable) };
      case "inv_cost": return { value: fmtUsdCompact(invCap.atCost) };
      case "inv_retail": return { value: fmtUsdCompact(invCap.atRetail) };
      case "cash_outlook": return { value: fmtUsdCompact(fc.endingCash30), sub: "30d projected" };
      case "ad_spend": return { value: fmtUsdCompact(c.adSpend), current: c.adSpend, base: p.adSpend };
      case "mer": return { value: fmtRatio(c.mer), current: c.mer, base: p.mer };
      case "cac": return { value: fmtUsd(c.blendedCac), current: c.blendedCac, base: p.blendedCac };
      case "sessions": return { value: fmtNum(c.sessions), current: c.sessions, base: p.sessions };
      case "conversion": return { value: fmtPct(c.conversion, 2), current: c.conversion, base: p.conversion };
      case "rev_session": return { value: fmtUsd(c.revenuePerSession, { cents: true }), current: c.revenuePerSession, base: p.revenuePerSession };
      case "new_customers": return { value: fmtNum(c.newCustomers), current: c.newCustomers, base: p.newCustomers };
      case "returning": return { value: fmtPct(c.returningPct, 0), current: c.returningPct, base: p.returningPct };
      case "aov": return { value: fmtUsd(c.aov), current: c.aov, base: p.aov };
      default: return { value: "—" };
    }
  }

  function openHealthDrill() {
    openDrill({
      title: `Business health: ${health.total}/100`,
      subtitle: "Weighted component scores — nothing arbitrary",
      body: (
        <>
          <ScoreBars items={health.components} />
          <div className="stmt" style={{ marginTop: 16 }}>
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
        </>
      ),
    });
  }

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
              {d.detail && <div className="muted" style={{ fontSize: 11, marginTop: -2, marginBottom: 4 }}>{d.detail}</div>}
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

// ── Sub-components ───────────────────────────────────────

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 6, padding: "7px 10px" }}>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{label}</div>
      <div style={{
        fontSize: 16, fontWeight: 700, marginTop: 1,
        color: tone === "good" ? "var(--delta-good)" : tone === "bad" ? "var(--delta-bad)" : undefined,
      }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{sub}</div>}
    </div>
  );
}

function InsightCard({ ins, spark }: { ins: Insight; spark?: number[] }) {
  const [open, setOpen] = useState(false);
  const app = useApp();
  const cls = ins.kind === "win" ? "win" : ins.severity;
  return (
    <div className={`insight ${cls}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="insight-title">{ins.title}</div>
          <div className="insight-detail">{ins.detail}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span className="badge">{ins.confidencePct}% conf.</span>
          {spark && spark.length > 1 && (
            <Sparkline values={spark} width={86} height={26}
              color={ins.kind === "win" ? "var(--good)" : "var(--s8)"} />
          )}
          {ins.estMonthlyImpact !== undefined && ins.estMonthlyImpact !== 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: ins.estMonthlyImpact < 0 ? "var(--delta-bad)" : "var(--delta-good)" }}>
              {fmtUsdCompact(ins.estMonthlyImpact, true)}/mo
            </span>
          )}
        </div>
      </div>
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

function ActionCard({ r, rank, maxImpact, status, onStatus, onOpen }: {
  r: Recommendation; rank: number; maxImpact: number;
  status: RecStatus; onStatus: (id: string, s: RecStatus) => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tone = rank === 1 ? "critical" : rank <= 3 ? "warning" : "info";
  return (
    <div className={`insight ${status !== "open" ? "" : tone}`} style={status !== "open" ? { opacity: 0.5 } : undefined}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="insight-title">{rank}. {r.title}</div>
          <div className="insight-detail">{r.action}</div>
        </div>
        <div style={{ width: 132, flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtUsdCompact(r.impactMonthly)}<span className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>/mo</span></div>
          <div className="impact-track" style={{ marginTop: 4 }}>
            <div className="impact-fill" style={{ width: `${Math.max(4, (r.impactMonthly / maxImpact) * 100)}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
            {r.confidencePct}% conf.{r.cashRequired > 0 ? ` · ${fmtUsdCompact(r.cashRequired)} cash` : ""}
          </div>
        </div>
      </div>
      <div className="rec-actions">
        <button className="btn" onClick={() => setOpen(!open)}>{open ? "Hide" : "Why?"}</button>
        {r.drill && <button className="btn" onClick={onOpen}>Open →</button>}
        {(["done", "ignored", "remind", "investigate"] as RecStatus[]).map((s) => (
          <button key={s} className={`btn ${status === s ? "done" : ""}`} onClick={() => onStatus(r.id, status === s ? "open" : s)}>
            {status === s ? "✓ " : ""}{s === "done" ? "Done" : s === "ignored" ? "Ignore" : s === "remind" ? "Remind me" : "Investigate"}
          </button>
        ))}
      </div>
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
    </div>
  );
}

// ── Full metric registry (retained, grouped, collapsed by default) ──
const METRIC_GROUPS: {
  title: string;
  items: { id: string; label: string; route?: string; invert?: boolean; provenance?: "imported" | "estimate" }[];
}[] = [
  {
    title: "Sales",
    items: [
      { id: "rev_today", label: "Revenue today", route: "sales" },
      { id: "rev_mtd", label: "Revenue MTD", route: "sales" },
      { id: "rev_ytd", label: "Revenue YTD", route: "sales" },
      { id: "gross_rev", label: "Gross sales", route: "sales" },
      { id: "units", label: "Units sold", route: "sales" },
      { id: "aov", label: "AOV", route: "sales" },
      { id: "items_order", label: "Items / order", route: "sales" },
      { id: "refund_rate", label: "Refund rate", route: "sales", invert: true },
      { id: "discount_rate", label: "Discount rate", route: "sales", invert: true },
    ],
  },
  {
    title: "Profitability",
    items: [
      { id: "gross_profit", label: "Gross profit", route: "pnl" },
      { id: "gross_margin", label: "Gross margin", route: "pnl" },
      { id: "contribution", label: "Contribution profit", route: "pnl" },
      { id: "contrib_margin", label: "Contribution margin", route: "pnl" },
      { id: "op_profit", label: "Operating profit", route: "pnl" },
    ],
  },
  {
    title: "Cash & obligations",
    items: [
      { id: "total_cash", label: "Total cash", route: "finance" },
      { id: "available_cash", label: "Available cash", route: "finance" },
      { id: "tax_liab", label: "Sales tax owed", route: "taxes", provenance: "imported" },
      { id: "inv_cost", label: "Inventory at cost", route: "inventory" },
      { id: "inv_retail", label: "Inventory at retail", route: "inventory" },
      { id: "cash_outlook", label: "30-day cash outlook", route: "cashflow", provenance: "estimate" },
    ],
  },
  {
    title: "Marketing & customers",
    items: [
      { id: "ad_spend", label: "Ad spend", route: "marketing", invert: true },
      { id: "mer", label: "MER", route: "marketing" },
      { id: "cac", label: "Blended CAC", route: "marketing", invert: true },
      { id: "sessions", label: "Sessions", route: "website" },
      { id: "conversion", label: "Conversion rate", route: "website" },
      { id: "rev_session", label: "Revenue / session", route: "website" },
      { id: "new_customers", label: "New customers", route: "customers" },
      { id: "returning", label: "Returning customers", route: "customers" },
    ],
  },
];
