// Inventory intelligence — health, stockout projection, cash-aware reordering,
// and inventory capital.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card, Kpi } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fmtNum, fmtUsd, fmtUsdCompact } from "@/lib/money";
import {
  inventoryRows, inventoryCapital, LEAD_TIME_DAYS, REORDER_COVER_DAYS, CASH_FLOOR,
  type InventoryHealth,
} from "@/engines/inventory";
import { availableCash } from "@/engines/cash";

const HEALTH_BADGE: Record<InventoryHealth, string> = {
  "Healthy": "good", "Overstocked": "", "Understocked": "warning",
  "Slow moving": "", "Dead stock": "serious", "Stockout risk": "critical",
};

export default function Inventory() {
  const { store } = useApp();
  const rows = useMemo(() => inventoryRows(store), [store]);
  const cap = useMemo(() => inventoryCapital(rows), [rows]);
  const cash = useMemo(() => availableCash(store, store.today), [store]);
  const [filter, setFilter] = useState<"all" | InventoryHealth>("all");

  const filtered = useMemo(
    () => rows.filter((r) => filter === "all" || r.health === filter).sort((a, b) => a.daysOfSupply - b.daysOfSupply),
    [rows, filter],
  );
  const reorders = useMemo(() => rows.filter((r) => r.recommendedReorderQty > 0).sort((a, b) => a.daysOfSupply - b.daysOfSupply), [rows]);
  const reorderCashTotal = reorders.reduce((t, r) => t + r.cashSafeReorderQty * r.landedUnitCost, 0);

  const counts = useMemo(() => {
    const m = new Map<InventoryHealth, number>();
    for (const r of rows) m.set(r.health, (m.get(r.health) ?? 0) + 1);
    return m;
  }, [rows]);

  return (
    <>
      <div className="kpi-row">
        <Kpi label="Inventory at cost" value={fmtUsd(cap.atCost)} sub={<span>{fmtNum(cap.unitsTotal)} units</span>} />
        <Kpi label="Inventory at retail" value={fmtUsd(cap.atRetail)} />
        <Kpi label="Slow-moving capital" value={fmtUsdCompact(cap.slowMovingCapital)} />
        <Kpi label="Dead-stock capital" value={fmtUsdCompact(cap.deadStockCapital)} />
        <Kpi label="Stockout risks" value={String(counts.get("Stockout risk") ?? 0)} />
      </div>

      <Card title="Cash-aware reorder plan"
        right={<span className="muted">available cash {fmtUsdCompact(cash.availableCash)} · plan uses {fmtUsdCompact(reorderCashTotal)}</span>}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th><th className="num">Days left</th><th className="num">Stockout date</th>
                <th className="num">Demand qty</th><th className="num">Cash-safe qty</th><th className="num">Cost</th><th>Note</th>
              </tr>
            </thead>
            <tbody>
              {reorders.map((r) => (
                <tr key={r.productId}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="num" style={{ color: r.daysOfSupply < 21 ? "var(--critical)" : undefined }}>{Math.round(r.daysOfSupply)}</td>
                  <td className="num dim">{r.projectedStockoutDate ? fmtDate(r.projectedStockoutDate) : "—"}</td>
                  <td className="num">{r.recommendedReorderQty}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{r.cashSafeReorderQty}</td>
                  <td className="num">{fmtUsdCompact(r.cashSafeReorderQty * r.landedUnitCost)}</td>
                  <td className="dim" style={{ whiteSpace: "normal", maxWidth: 260 }}>
                    {r.cashSafeReorderQty < r.recommendedReorderQty
                      ? `Capped: demand supports ${r.recommendedReorderQty}, but cash position and tax reserves make ${r.cashSafeReorderQty} safer right now.`
                      : "Full demand-based quantity fits the cash plan."}
                  </td>
                </tr>
              ))}
              {reorders.length === 0 && <tr><td colSpan={7} className="dim">Nothing needs reordering.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Reorder quantities target ~{REORDER_COVER_DAYS} days of cover after a {LEAD_TIME_DAYS}-day lead
          time, using blended 14/28-day velocity, then get capped by projected available cash (keeping a{" "}
          {fmtUsdCompact(CASH_FLOOR)} floor after tax reserves and committed POs). The engine never
          recommends a purchase the cash plan can't support.
        </p>
      </Card>

      <Card
        title="Inventory health"
        right={
          <span className="seg">
            {(["all", "Stockout risk", "Understocked", "Healthy", "Overstocked", "Slow moving", "Dead stock"] as const).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? `All (${rows.length})` : `${f} (${counts.get(f) ?? 0})`}
              </button>
            ))}
          </span>
        }
        pad0
      >
        <div className="tbl-wrap" style={{ maxHeight: 480, overflowY: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th><th>Health</th><th className="num">Stock</th><th className="num">At cost</th>
                <th className="num">At retail</th><th className="num">Velocity 14d</th><th className="num">Days supply</th>
                <th className="num">Reorder point</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.productId}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td><span className={`badge ${HEALTH_BADGE[r.health]}`}>{r.health}</span></td>
                  <td className="num">{fmtNum(r.stock)}</td>
                  <td className="num">{fmtUsdCompact(r.stockValue)}</td>
                  <td className="num dim">{fmtUsdCompact(r.retailValue)}</td>
                  <td className="num">{r.velocity14.toFixed(1)}/d</td>
                  <td className="num" style={{ color: r.daysOfSupply < 21 ? "var(--critical)" : undefined }}>
                    {r.daysOfSupply >= 999 ? "∞" : Math.round(r.daysOfSupply)}
                  </td>
                  <td className="num dim">{r.reorderPoint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
