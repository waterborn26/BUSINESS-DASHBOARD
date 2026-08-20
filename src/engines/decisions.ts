// Decision journal engine — evaluates logged decisions against what actually
// happened to the metrics each decision claimed it would affect.

import type { Store } from "@/data/store";
import type { Decision } from "@/domain/types";
import { addDays, daysBetween, type Period } from "@/lib/dates";
import { fmtPct, fmtUsdCompact } from "@/lib/money";
import { ordersInPeriod, trafficSourceStats, funnel } from "./analytics";

export interface DecisionEvaluation {
  decision: Decision;
  daysSince: number;
  findings: { label: string; before: string; after: string; deltaPct: number | null }[];
  verdict: "beneficial" | "harmful" | "neutral" | "too-early";
  summary: string;
}

export function evaluateDecisions(store: Store): DecisionEvaluation[] {
  return store.decisions.map((d) => evaluateOne(store, d));
}

function evaluateOne(store: Store, d: Decision): DecisionEvaluation {
  const today = store.today;
  const daysSince = daysBetween(d.date, today);
  const win = Math.min(daysSince, 45);
  const after: Period = { start: d.date, end: addDays(d.date, win - 1) };
  const before: Period = { start: addDays(d.date, -win), end: addDays(d.date, -1) };
  const findings: DecisionEvaluation["findings"] = [];
  let deltaScore = 0;

  for (const metric of d.metrics) {
    const [kind, target] = metric.split(":");
    if (kind === "units" || kind === "revenue" || kind === "contribution") {
      const measure = (p: Period) => {
        let units = 0, revenue = 0, contribution = 0;
        for (const o of ordersInPeriod(store, p)) {
          for (const it of o.items) {
            if (it.productId === target) {
              units += it.qty;
              revenue += it.unitPrice * it.qty;
              contribution += (it.unitPrice - it.unitCogs) * it.qty;
            }
          }
        }
        return { units, revenue, contribution };
      };
      const b = measure(before), a = measure(after);
      const key = kind as "units" | "revenue" | "contribution";
      const delta = b[key] > 0 ? (a[key] - b[key]) / b[key] : null;
      findings.push({
        label: `${kind === "units" ? "Units sold" : kind === "revenue" ? "Revenue" : "Contribution profit"} (${store.productById.get(target)?.name ?? target})`,
        before: kind === "units" ? String(b.units) : fmtUsdCompact(b[key]),
        after: kind === "units" ? String(a.units) : fmtUsdCompact(a[key]),
        deltaPct: delta,
      });
      if (delta !== null) deltaScore += (kind === "contribution" ? 2 : 1) * delta;
    } else if (kind === "conversion") {
      const filter = target === "mobile" ? { device: "mobile" } : undefined;
      const cr = (p: Period) => {
        const f = funnel(store, p, filter);
        return f[0].value ? f[4].value / f[0].value : 0;
      };
      const b = cr(before), a = cr(after);
      const delta = b > 0 ? (a - b) / b : null;
      findings.push({ label: `Conversion (${target})`, before: fmtPct(b, 2), after: fmtPct(a, 2), deltaPct: delta });
      if (delta !== null) deltaScore += delta * 2;
    } else if (kind === "cac" || kind === "roas") {
      const stats = (p: Period) => trafficSourceStats(store, p).find((s) => s.source === target);
      const b = stats(before), a = stats(after);
      if (b && a) {
        const bv = kind === "cac" ? b.cac : b.mer;
        const av = kind === "cac" ? a.cac : a.mer;
        const delta = bv > 0 ? (av - bv) / bv : null;
        findings.push({
          label: `${kind.toUpperCase()} (${target})`,
          before: kind === "cac" ? fmtUsdCompact(bv) : `${bv.toFixed(1)}x`,
          after: kind === "cac" ? fmtUsdCompact(av) : `${av.toFixed(1)}x`,
          deltaPct: delta,
        });
        if (delta !== null) deltaScore += (kind === "cac" ? -1 : 1) * delta;
      }
    }
  }

  const verdict: DecisionEvaluation["verdict"] =
    daysSince < 10 ? "too-early" : deltaScore > 0.04 ? "beneficial" : deltaScore < -0.04 ? "harmful" : "neutral";
  const summary =
    verdict === "too-early" ? `Only ${daysSince} days of data — check back after day 10.` :
    verdict === "beneficial" ? "Evidence suggests this decision was financially beneficial." :
    verdict === "harmful" ? "Evidence suggests this decision is hurting the metrics it targeted." :
    "No clear effect detected yet — the metrics moved within normal variation.";
  return { decision: d, daysSince, findings, verdict, summary };
}
