// Command Center — the daily home screen.
//
// Six bands, each with one visual job: pulse (how am I doing), where I stand (money +
// twelve-month shape), performance (four tiles carrying their own trend), what to do,
// what changed, then everything else collapsed. Prose is kept to a briefing that clamps
// to two lines; every other explanation lives behind a "Why?" rather than on the page,
// so the screen is read at a glance and only expands where you ask it to.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, StatTile, StmtRow, Delta, ProvenanceBadge } from "@/components/ui";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { Gauge, ScoreBars } from "@/components/charts/Gauge";
import { SplitMeter, type MeterSegment } from "@/components/charts/SplitMeter";
import { addDays, fmtDate, type Period } from "@/lib/dates";
import { fmtNum, fmtPct, fmtRatio, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { movingAverage } from "@/lib/stats";
import { bucketSeries, compare, periodTotals, series, type MetricId } from "@/engines/analytics";
import { availableCash } from "@/engines/cash";
import { cashForecast } from "@/engines/cashflow";
import { dailyBriefing } from "@/engines/briefing";
import { healthScore } from "@/engines/health";
import { inventoryRows, inventoryCapital, CASH_FLOOR } from "@/engines/inventory";
import { salesTaxSummary } from "@/engines/taxes";
import { pnl } from "@/engines/pnl";
import { recStatus, setRecStatus, type RecStatus, type Recommendation } from "@/engines/recommend";
import type { Insight } from "@/engines/insights";
import { CAPABILITY_LABELS, type Capabilities } from "@/domain/types";

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
  const [briefOpen, setBriefOpen] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [monthSpan, setMonthSpan] = useState<12 | 24 | "all">(12);

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

  // Twelve COMPLETE months. The current month is excluded on purpose — a part-month bar
  // drawn beside full ones reads as a collapse in demand that has not happened.
  const monthly = useMemo(() => {
    const [cy, cm] = today.slice(0, 7).split("-").map(Number);
    const span = monthSpan === "all" ? 600 : monthSpan;
    const startIdx = cy * 12 + (cm - 1) - span;
    const wanted = `${Math.floor(startIdx / 12)}-${String((startIdx % 12) + 1).padStart(2, "0")}-01`;
    const start = wanted < store.start ? store.start : wanted;
    const end = addDays(`${cy}-${String(cm).padStart(2, "0")}-01`, -1);
    const all = bucketSeries(series(store, "net_revenue", { start, end }), "month");
    // "All" starts at the first month that actually sold something — leading empty
    // months are pre-history, not a slump.
    const firstSale = all.findIndex((b) => b.value > 0);
    const buckets = (monthSpan === "all" && firstSale > 0 ? all.slice(firstSale) : all).slice(-span);
    const values = buckets.map((b) => b.value);
    const best = buckets.reduce((a, b) => (b.value > a.value ? b : a), buckets[0] ?? { date: "", value: 0 });
    const sum = values.reduce((t, v) => t + v, 0);
    const last3 = values.slice(-3).reduce((t, v) => t + v, 0);
    const prior3 = values.slice(-6, -3).reduce((t, v) => t + v, 0);
    return {
      keys: buckets.map((b) => b.date),
      values,
      best,
      avg: values.length ? sum / values.length : 0,
      momentum: prior3 > 0 ? (last3 - prior3) / prior3 : null,
      rangeLabel: buckets.length ? `${monthLabel(buckets[0].date)} – ${monthLabel(buckets[buckets.length - 1].date)}` : "",
    };
  }, [store, monthSpan]);

  const c = cmp.current;
  const p = cmp.previous;
  const cap = store.capabilities;

  // Total cash split into what is committed vs what is genuinely yours.
  const cashSegments: MeterSegment[] = useMemo(() => [
    ...cash.deductions.map((d) => ({ label: d.label.replace("Estimated ", "Est. ").replace(" (Amex)", ""), value: d.amount, detail: d.detail })),
    { label: "Available to spend", value: Math.max(0, cash.availableCash), highlight: true },
  ], [cash]);

  const risks = [...briefing.problems, ...briefing.risks];
  const stockoutCount = useMemo(
    () => inventoryRows(store).filter((r) => r.health === "Stockout risk").length, [store]);
  // The bar encodes the priority SCORE, not the dollar impact. Encoding impact put the
  // longest bar next to rank 4 — the eye read the list as mis-sorted, because urgency and
  // difficulty move the ranking and were invisible. The bar now shows the thing the order
  // is actually based on, so it descends, and the dollar figure sits beside it as text.
  const maxScore = Math.max(...briefing.actions.map((r) => r.score), 0.0001);
  const markStatus = (id: string, s: RecStatus) => { setRecStatus(id, s); setRecTick((t) => t + 1); };

  const projections = useMemo(() => ([30, 60, 90] as const).map((d) => ({
    label: `In ${d} days`,
    value: fc.points[d - 1]?.available ?? cash.availableCash,
  })), [fc, cash]);

  return (
    <>
      {/* ── Pulse: one gauge, one sentence, the counts ─── */}
      <Card>
        <div className="pulse">
          <div className="pulse-gauge">
            <Gauge value={health.total} size={104} label={health.coverage >= 0.99 ? "HEALTH" : "PARTIAL"} />
            <button className="btn" style={{ fontSize: 11, padding: "2px 8px" }} onClick={openHealthDrill}>
              Why?
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div className="band-title" style={{ marginBottom: 6 }}>
              Daily briefing · {fmtDate(today)}
              <span className="badge">deterministic AI</span>
            </div>
            <p className={`selectable briefing ${briefOpen ? "" : "clamp-2"}`}>{briefing.headline}</p>
            {briefing.headline.length > 150 && (
              <button className="linkish" onClick={() => setBriefOpen((v) => !v)}>
                {briefOpen ? "Show less" : "Read the full briefing"}
              </button>
            )}
            <div className="chip-row" style={{ marginTop: 10 }}>
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

      {/* ── Where I stand: the money, and the shape of the year ── */}
      <div className="band-title">Where I stand</div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)" }}>
        <Card className="fill">
          {cash.cashKnown ? (
            <>
              <div className="stat-label">Available to spend right now</div>
              <div className="hero-figure">{fmtUsd(cash.availableCash)}</div>
              <div className="hero-sub">
                of {fmtUsd(cash.totalCash)} total cash ·{" "}
                <a className="link" onClick={openAvailableCashDrill}>why? →</a>
              </div>
            </>
          ) : (
            <>
              {/* No bank feed: subtracting real obligations from unknown cash would
                  print a confident deficit that is not true. State what is known. */}
              <div className="stat-label">Committed and already owed</div>
              <div className="hero-figure">{fmtUsd(cash.obligationsTotal)}</div>
              <div className="hero-sub">
                Cash on hand is <strong>not connected</strong> ·{" "}
                <a className="link" onClick={() => app.navigate("datasources")}>connect an account →</a>
              </div>
            </>
          )}

          <div style={{ marginTop: 16 }}>
            <SplitMeter
              segments={cashSegments}
              fmt={(v) => fmtUsdCompact(v)}
              onSegmentClick={openAvailableCashDrill}
            />
          </div>

          {cash.cashKnown && (
            <>
              <div className="grid cols-3" style={{ gap: 8, marginTop: 14 }}>
                {projections.map((pr) => (
                  <MiniStat key={pr.label} label={pr.label} value={fmtUsdCompact(pr.value)}
                    tone={pr.value < CASH_FLOOR ? "bad" : undefined}
                    sub={pr.value < CASH_FLOOR ? "below floor" : undefined} />
                ))}
              </div>
              <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                Tightest moment:{" "}
                <strong style={{ color: fc.trough.available < CASH_FLOOR ? "var(--delta-bad)" : "var(--ink)" }}>
                  {fmtUsdCompact(fc.trough.available)}
                </strong>{" "}
                around {fmtDate(fc.trough.date)}
                {fc.trough.available < CASH_FLOOR ? " — below your floor." : " — stays above your floor."}
              </p>
            </>
          )}
          {!cash.cashKnown && (
            <p className="muted" style={{ fontSize: 11.5, marginTop: "auto", paddingTop: 14 }}>
              Every segment above is money Meridian can read from Shopify and knows you owe.
              Whether your cash covers it is the one thing it cannot tell you yet.
            </p>
          )}
        </Card>

        <Card
          title="Net revenue by month"
          right={
            <span className="seg">
              {([12, 24, "all"] as const).map((sp) => (
                <button key={String(sp)} className={monthSpan === sp ? "on" : ""} onClick={() => setMonthSpan(sp)}>
                  {sp === "all" ? "all" : `${sp}m`}
                </button>
              ))}
            </span>
          }
        >
          <BarChart
            labels={monthly.keys}
            series={[{ name: "Net revenue", color: "var(--s1)", values: monthly.values }]}
            xFmt={(k) => monthLabel(k, monthSpan !== 12)}
            yFmt={fmtUsdCompact}
            height={196}
            showLegend={false}
            directLabelIndex={monthly.values.length - 1}
          />
          <div className="grid cols-3" style={{ gap: 8, marginTop: 10 }}>
            <MiniStat label="Best month" value={fmtUsdCompact(monthly.best.value)} sub={monthLabel(monthly.best.date, true)} />
            <MiniStat label="Monthly average" value={fmtUsdCompact(monthly.avg)} />
            <MiniStat
              label="Last 3 vs prior 3"
              value={monthly.momentum === null ? "—" : `${monthly.momentum > 0 ? "+" : monthly.momentum < 0 ? "−" : ""}${fmtPct(Math.abs(monthly.momentum), 0)}`}
              tone={monthly.momentum === null ? undefined : monthly.momentum > 0.005 ? "good" : monthly.momentum < -0.005 ? "bad" : undefined}
            />
          </div>
        </Card>
      </div>

      {/* ── Performance stat tiles ──────────────────────── */}
      <div className="band-title">Performance · last 30 days vs previous 30</div>
      <div className="stat-row">
        <StatTile label="Net revenue" value={fmtUsdCompact(c.netRevenue)} spark={spark.net_revenue}
          current={c.netRevenue} base={p.netRevenue}
          note={<span className="muted">{fmtUsdCompact(c.netRevenue / 30)}/day avg</span>}
          onClick={() => app.navigate("sales")} size="lg" />
        {cap.cogs ? (
          <StatTile label="Contribution profit" value={fmtUsdCompact(c.contributionProfit)} spark={spark.contribution_profit}
            current={c.contributionProfit} base={p.contributionProfit} accent="var(--s3)"
            note={<span className="muted">{fmtPct(c.contributionMarginPct, 0)} margin</span>}
            onClick={() => app.navigate("pnl")} size="lg" />
        ) : (
          <UnknownTile label="Contribution profit" needs="product costs"
            onClick={() => app.navigate("datasources")} />
        )}
        <StatTile label="Orders" value={fmtNum(c.orders)} spark={spark.orders}
          current={c.orders} base={p.orders} note={<span className="muted">AOV {fmtUsd(c.aov)}</span>}
          onClick={() => app.navigate("sales")} size="lg" />
        {cap.sessions ? (
          <StatTile label="Conversion rate" value={fmtPct(c.conversion, 2)} spark={spark.conversion}
            current={c.conversion} base={p.conversion} accent="var(--s4)"
            note={<span className="muted">{fmtNum(c.sessions)} sessions</span>}
            onClick={() => app.navigate("website")} size="lg" />
        ) : (
          <UnknownTile label="Conversion rate" needs="web analytics"
            onClick={() => app.navigate("datasources")} />
        )}
      </div>

      {/* ── WHAT SHOULD I DO ────────────────────────────── */}
      <Card
        title={<>What should I do? <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>ranked by impact × confidence × urgency ÷ difficulty</span></>}
        right={briefing.actions.length > 4 ? (
          <button className="btn" onClick={() => setShowAllActions((v) => !v)}>
            {showAllActions ? "Top 4" : `All ${briefing.actions.length}`}
          </button>
        ) : undefined}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }} key={recTick}>
          {(showAllActions ? briefing.actions : briefing.actions.slice(0, 4)).map((r, i) => (
            <ActionCard key={r.id} r={r} rank={i + 1} maxScore={maxScore}
              status={recStatus(r.id)} onStatus={markStatus} onOpen={() => r.drill && app.navigate(r.drill)} />
          ))}
        </div>
      </Card>

      {/* ── What changed · outlook or the gaps in coverage ── */}
      <div className="grid cols-2">
        <Card title="What changed — and why">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...risks.slice(0, 3), ...briefing.wins.slice(0, 1)].map((i) => (
              <InsightCard key={i.id} ins={i} spark={i.metric ? spark[i.metric] : undefined} />
            ))}
          </div>
        </Card>

        {cash.cashKnown ? (
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
        ) : (
          <Card
            title="What Meridian can see"
            right={<button className="btn primary" onClick={() => app.navigate("datasources")}>Connect →</button>}
          >
            <CapabilityStrip caps={cap} />
            <div className="band-title" style={{ margin: "16px 0 8px" }}>Health drivers</div>
            <ScoreBars items={health.components.slice(0, 5)} />
          </Card>
        )}
      </div>

      {/* ── Everything else, retained but collapsed ────── */}
      <Card
        title="Financial position and all metrics"
        right={
          <button className="btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide" : `Show ${METRIC_GROUPS.reduce((t, g) => t + g.items.length, 0)}`}
          </button>
        }
      >
        {!showAll && (
          <p className="muted" style={{ fontSize: 12 }}>
            The full position statement and every KPI — sales, profitability, cash, marketing
            and customers — with comparisons against the previous period, last year and target.
          </p>
        )}
        {showAll && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="grid cols-2">
              <div>
                <div className="band-title" style={{ marginBottom: 8 }}>Financial position</div>
                <div className="stmt">
                  {briefing.financialPosition.map((f) => (
                    <div className="stmt-row" key={f.label}>
                      <span className="lbl">{f.label}{f.estimate && <span className="badge estimate">est.</span>}</span>
                      <span className={f.tone === "bad" ? "neg" : f.tone === "good" ? "pos" : ""}>{f.value}</span>
                    </div>
                  ))}
                </div>
                <div className="grid cols-2" style={{ gap: 8, marginTop: 12 }}>
                  <MiniStat label="Inventory at cost" value={fmtUsdCompact(invCap.atCost)} sub={`retail ${fmtUsdCompact(invCap.atRetail)}`} />
                  <MiniStat label="Sales tax owed" value={fmtUsdCompact(stx.currentPayable)} sub="imported" />
                </div>
              </div>
              {cash.cashKnown && (
                <div>
                  <div className="band-title" style={{ marginBottom: 8 }}>Health drivers</div>
                  <ScoreBars items={health.components} />
                </div>
              )}
            </div>
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
          {health.coverage < 0.99 && (
            <div className="insight warning" style={{ marginBottom: 12 }}>
              <div className="insight-detail">
                Scored on {Math.round(health.coverage * 100)}% of the full model. Not measured:{" "}
                {health.unavailable.map((u) => u.label).join(", ")} — each needs{" "}
                {[...new Set(health.unavailable.map((u) => u.needs))].join(" / ")}.
              </div>
            </div>
          )}
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

/** A metric the connected data genuinely cannot support — never a fake zero. */
function UnknownTile({ label, needs, onClick }: { label: string; needs: string; onClick: () => void }) {
  return (
    <div className="stat clickable" onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className="stat-body">
        <div className="stat-value lg" style={{ color: "var(--ink-3)" }}>—</div>
      </div>
      <div className="stat-foot">
        <span className="badge warning">needs {needs}</span>
      </div>
    </div>
  );
}

/**
 * "2026-07" → "Jul", or "Jan '26" where the year turns over. Past twelve months the
 * bare month name is ambiguous — three "Aug" ticks in a row say nothing — so longer
 * spans stamp the year on every tick.
 */
function monthLabel(key: string, alwaysYear = false): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS[(m ?? 1) - 1] ?? key;
  return alwaysYear || m === 1 ? `${name} '${String(y).slice(2)}` : name;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const CAP_SHORT: Record<keyof Capabilities, string> = {
  cash: "Cash & cards",
  cogs: "Product costs",
  sessions: "Web analytics",
  adSpend: "Ad platforms",
  customers: "Customers",
  inventory: "Inventory",
  expenses: "Expenses",
  units: "Unit quantities",
};

/**
 * Eight pills: what this dataset knows, and what it does not. Replaces a paragraph
 * explaining the same thing — coverage is a shape you read, not a list you parse.
 */
function CapabilityStrip({ caps }: { caps: Capabilities }) {
  const keys = Object.keys(CAP_SHORT) as (keyof Capabilities)[];
  // Sales always counts as present — the dataset exists because orders were imported.
  const have = 1 + keys.filter((k) => caps[k]).length;
  return (
    <>
      <div className="cap-count">
        <strong>{have}</strong> of {keys.length + 1} data sources feeding the dashboard
      </div>
      <div className="cap-strip">
        <span className="cap on" title="Orders, revenue, discounts, refunds and sales tax — imported">
          <span className="dot" />
          Sales &amp; orders
        </span>
        {keys.map((k) => (
          <span key={k} className={`cap ${caps[k] ? "on" : "off"}`}
            title={`${caps[k] ? "Connected" : `Needs ${CAPABILITY_LABELS[k].needs}`} — ${CAPABILITY_LABELS[k].gates}`}>
            <span className="dot" />
            {CAP_SHORT[k]}
          </span>
        ))}
      </div>
    </>
  );
}

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
    <div className={`insight compact ${cls}`}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="insight-title">{ins.title}</div>
          <div className={`insight-detail ${open ? "" : "clamp-2"}`}>{ins.detail}</div>
          <div className="row-controls">
            <button className="linkish" onClick={() => setOpen(!open)}>{open ? "Less" : "Why?"}</button>
            {ins.drill && <button className="linkish" onClick={() => app.navigate(ins.drill!)}>Open →</button>}
            <span className="muted" style={{ fontSize: 10.5 }}>{ins.confidencePct}% confidence</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {spark && spark.length > 1 && (
            <Sparkline values={spark} width={86} height={26}
              color={ins.kind === "win" ? "var(--good)" : "var(--s8)"} />
          )}
          {ins.estMonthlyImpact !== undefined && ins.estMonthlyImpact !== 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: ins.estMonthlyImpact < 0 ? "var(--delta-bad)" : "var(--delta-good)" }}>
              {fmtUsdCompact(ins.estMonthlyImpact, true)}/mo
            </span>
          )}
        </div>
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

function ActionCard({ r, rank, maxScore, status, onStatus, onOpen }: {
  r: Recommendation; rank: number; maxScore: number;
  status: RecStatus; onStatus: (id: string, s: RecStatus) => void; onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tone = rank === 1 ? "critical" : rank <= 3 ? "warning" : "info";
  return (
    <div className={`insight compact ${status !== "open" ? "" : tone}`} style={status !== "open" ? { opacity: 0.5 } : undefined}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className="rank">{rank}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="insight-title">{r.title}</div>
          <div className={`insight-detail ${open ? "" : "clamp-2"}`}>{r.action}</div>
          <div className="row-controls">
            <button className="linkish" onClick={() => setOpen(!open)}>{open ? "Less" : "Why?"}</button>
            {r.drill && <button className="linkish" onClick={onOpen}>Open →</button>}
            <button className={`linkish ${status === "done" ? "on" : ""}`}
              onClick={() => onStatus(r.id, status === "done" ? "open" : "done")}>
              {status === "done" ? "✓ Done" : "Mark done"}
            </button>
            <span className="muted" style={{ fontSize: 10.5 }}>
              {r.confidencePct}% confidence{r.cashRequired > 0 ? ` · needs ${fmtUsdCompact(r.cashRequired)}` : ""}
            </span>
          </div>
        </div>
        <div style={{ width: 116, flexShrink: 0, textAlign: "right" }}>
          {r.impactMonthly === null ? (
            <div className="muted" style={{ fontSize: 11, lineHeight: 1.3 }}
              title="A monthly dollar impact needs more revenue than this business currently does">
              impact not<br />estimable yet
            </div>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {fmtUsdCompact(r.impactMonthly)}<span className="muted" style={{ fontSize: 10.5, fontWeight: 400 }}>/mo</span>
            </div>
          )}
          <div className="impact-track" style={{ marginTop: 5 }} title="Priority score — impact × confidence × urgency ÷ difficulty">
            <div className="impact-fill" style={{ width: `${Math.max(4, (r.score / maxScore) * 100)}%` }} />
          </div>
        </div>
      </div>
      {open && (
        <div style={{ width: "100%" }}>
          <div className="insight-detail" style={{ marginTop: 8 }}>{r.reason}</div>
          <div className="evidence">
            {r.evidence.map((e) => (
              <div key={e.label}><span className="lbl">{e.label}</span><span className="val">{e.value}</span></div>
            ))}
          </div>
          <div className="rec-actions">
            {(["done", "ignored", "remind", "investigate"] as RecStatus[]).map((s) => (
              <button key={s} className={`btn ${status === s ? "done" : ""}`} onClick={() => onStatus(r.id, status === s ? "open" : s)}>
                {status === s ? "✓ " : ""}{s === "done" ? "Done" : s === "ignored" ? "Ignore" : s === "remind" ? "Remind me" : "Investigate"}
              </button>
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
