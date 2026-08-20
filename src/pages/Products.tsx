// Product analytics — rankings that distinguish revenue from actual profitability.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { fmtNum, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/money";
import { productStats, type ProductStats } from "@/engines/analytics";

type RankMode = "revenue" | "profit" | "margin" | "growing" | "declining" | "returns" | "risk";

const RANKS: { id: RankMode; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "profit", label: "Contribution profit" },
  { id: "margin", label: "Margin" },
  { id: "growing", label: "Fastest growing" },
  { id: "declining", label: "Declining" },
  { id: "returns", label: "Return rate" },
  { id: "risk", label: "Stockout risk" },
];

export default function Products() {
  const { store, period, openDrill } = useApp();
  const stats = useMemo(() => productStats(store, period), [store, period]);
  const [rank, setRank] = useState<RankMode>("revenue");
  const [collection, setCollection] = useState("all");

  const collections = useMemo(() => [...new Set(store.products.map((p) => p.collection))], [store]);

  const sorted = useMemo(() => {
    let rows = stats.filter((s) => collection === "all" || s.collection === collection);
    switch (rank) {
      case "revenue": rows = [...rows].sort((a, b) => b.revenue - a.revenue); break;
      case "profit": rows = [...rows].sort((a, b) => b.contributionProfit - a.contributionProfit); break;
      case "margin": rows = [...rows].sort((a, b) => b.contributionMarginPct - a.contributionMarginPct); break;
      case "growing": rows = [...rows].sort((a, b) => b.trendPct - a.trendPct); break;
      case "declining": rows = [...rows].sort((a, b) => a.trendPct - b.trendPct); break;
      case "returns": rows = [...rows].sort((a, b) => b.refundRatePct - a.refundRatePct); break;
      case "risk": rows = [...rows].sort((a, b) => a.daysOfSupply - b.daysOfSupply); break;
    }
    return rows;
  }, [stats, rank, collection]);

  const totals = useMemo(() => ({
    revenue: stats.reduce((t, s) => t + s.revenue, 0),
    contribution: stats.reduce((t, s) => t + s.contributionProfit, 0),
  }), [stats]);

  // Revenue-vs-profit rank divergence: high revenue but weak profit
  const divergent = useMemo(() => {
    const byRev = [...stats].sort((a, b) => b.revenue - a.revenue);
    const byProfit = [...stats].sort((a, b) => b.contributionProfit - a.contributionProfit);
    const profitRank = new Map(byProfit.map((s, i) => [s.productId, i]));
    return byRev.slice(0, 8).filter((s) => (profitRank.get(s.productId) ?? 0) - byRev.indexOf(s) >= 4);
  }, [stats]);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Product revenue (period)" value={fmtUsdCompact(totals.revenue)} />
        <Kpi label="Contribution profit" value={fmtUsdCompact(totals.contribution)} />
        <Kpi label="Active products" value={fmtNum(store.products.length)} />
        <Kpi label="Top by revenue" value={sorted[0]?.name.split(" ").slice(0, 2).join(" ") ?? "—"} small />
      </div>

      {divergent.length > 0 && (
        <div className="insight warning">
          <div className="insight-title">Revenue ≠ profitability</div>
          <div className="insight-detail">
            {divergent.map((d) => d.name).join(", ")} rank high on revenue but materially lower on
            contribution profit (margin, refunds, or ad allocation drag). Rankings here default to
            profit-aware sorting — a high-revenue product is not automatically a top performer.
          </div>
        </div>
      )}

      <Card
        title="Product rankings"
        right={
          <>
            <select value={collection} onChange={(e) => setCollection(e.target.value)}>
              <option value="all">All collections</option>
              {collections.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="seg">
              {RANKS.map((r) => (
                <button key={r.id} className={rank === r.id ? "on" : ""} onClick={() => setRank(r.id)}>{r.label}</button>
              ))}
            </span>
          </>
        }
        pad0
      >
        <div className="tbl-wrap" style={{ maxHeight: 520, overflowY: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th><th className="num">Revenue</th><th className="num">Units</th>
                <th className="num">Gross margin</th><th className="num">Contribution</th><th className="num">Contrib. margin</th>
                <th className="num">Refund rate</th><th className="num">28d trend</th><th className="num">Stock</th><th className="num">Days supply</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.productId} className="clickable" onClick={() => drillProduct(s)}>
                  <td style={{ fontWeight: 600 }}>{s.name} <span className="dim" style={{ fontWeight: 400 }}>· {s.collection}</span></td>
                  <td className="num">{fmtUsdCompact(s.revenue)}</td>
                  <td className="num">{fmtNum(s.units)}</td>
                  <td className="num">{fmtPct(s.grossMarginPct, 0)}</td>
                  <td className="num" style={{ color: s.contributionProfit < 0 ? "var(--delta-bad)" : undefined, fontWeight: 600 }}>{fmtUsdCompact(s.contributionProfit)}</td>
                  <td className="num">{fmtPct(s.contributionMarginPct, 0)}</td>
                  <td className="num" style={{ color: s.refundRatePct > 0.06 ? "var(--delta-bad)" : undefined }}>{fmtPct(s.refundRatePct, 1)}</td>
                  <td className="num" style={{ color: s.trendPct > 0.05 ? "var(--delta-good)" : s.trendPct < -0.05 ? "var(--delta-bad)" : undefined }}>{fmtPct(s.trendPct, 0, true)}</td>
                  <td className="num">{fmtNum(s.stock)}</td>
                  <td className="num" style={{ color: s.daysOfSupply < 21 ? "var(--critical)" : undefined }}>{s.daysOfSupply >= 999 ? "∞" : Math.round(s.daysOfSupply)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );

  function drillProduct(s: ProductStats) {
    const skus = store.skusByProduct.get(s.productId) ?? [];
    const perUnitCogs = s.units > 0 ? Math.round(s.cogs / s.units) : s.stock > 0 ? Math.round(s.stockValue / s.stock) : 0;
    const price = skus[0]?.price ?? 0;
    const fees = Math.round(price * 0.029) + 30;
    const fulfillment = 420;
    const adAlloc = s.units > 0 ? Math.round((s.grossProfit - s.contributionProfit) / s.units) - fees - fulfillment : 0;
    openDrill({
      title: s.name,
      subtitle: `${s.collection} · ${skus.length} SKU${skus.length > 1 ? "s" : ""} · SKU economics per unit`,
      body: (
        <>
          <div className="stmt">
            <div className="stmt-row"><span className="lbl">Retail price</span><span>{fmtUsd(price)}</span></div>
            <div className="stmt-row indent"><span className="lbl">Landed cost (mfg + pack + freight + duties)</span><span className="neg">−{fmtUsd(perUnitCogs)}</span></div>
            <div className="stmt-row indent"><span className="lbl">Payment processing</span><span className="neg">−{fmtUsd(fees)}</span></div>
            <div className="stmt-row indent"><span className="lbl">Fulfillment</span><span className="neg">−{fmtUsd(fulfillment)}</span></div>
            <div className="stmt-row indent"><span className="lbl">Ad allocation (period avg)</span><span className="neg">−{fmtUsd(Math.max(0, adAlloc))}</span></div>
            <div className="stmt-row total"><span className="lbl">Contribution / unit</span>
              <span>{fmtUsd(price - perUnitCogs - fees - fulfillment - Math.max(0, adAlloc))}</span></div>
          </div>
          <div className="evidence" style={{ marginTop: 14 }}>
            <div><span className="lbl">Revenue (period)</span><span className="val">{fmtUsdCompact(s.revenue)}</span></div>
            <div><span className="lbl">Units</span><span className="val">{fmtNum(s.units)}</span></div>
            <div><span className="lbl">Orders containing</span><span className="val">{fmtNum(s.orders)}</span></div>
            <div><span className="lbl">AOV when in order</span><span className="val">{fmtUsd(s.aovPosition)}</span></div>
            <div><span className="lbl">Velocity (14d)</span><span className="val">{s.velocity14.toFixed(1)}/day</span></div>
            <div><span className="lbl">Stock</span><span className="val">{s.stock} units · {fmtUsdCompact(s.stockValue)}</span></div>
          </div>
          <div className="tbl-wrap" style={{ marginTop: 14 }}>
            <table className="tbl">
              <thead><tr><th>SKU</th><th>Variant</th><th className="num">Price</th></tr></thead>
              <tbody>
                {skus.map((k) => (
                  <tr key={k.id}><td className="mono" style={{ fontSize: 11 }}>{k.sku}</td><td>{k.variant}</td><td className="num">{fmtUsd(k.price)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ),
    });
  }
}
