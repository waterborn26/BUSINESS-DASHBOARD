// Funnel chart with per-step conversion and drop-off labels.
// Ordinal ramp of the sequential blue (steps within the 2:1-contrast floor).

import React from "react";
import { fmtNumCompact, fmtPct } from "@/lib/money";
import type { FunnelStep } from "@/engines/analytics";

const RAMP = ["#86b6ef", "#5598e7", "#3987e5", "#256abf", "#1c5cab"];

export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {steps.map((s, i) => {
        const frac = s.value / max;
        const stepConv = i > 0 && steps[i - 1].value > 0 ? s.value / steps[i - 1].value : 1;
        return (
          <div key={s.label} style={{ display: "grid", gridTemplateColumns: "100px 1fr 150px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{s.label}</span>
            <div style={{ background: "var(--surface-2)", borderRadius: 4, height: 22, position: "relative", overflow: "hidden" }}>
              <div style={{
                width: `${Math.max(1.5, frac * 100)}%`, height: "100%",
                background: RAMP[Math.min(i, RAMP.length - 1)],
                borderRadius: 4, transition: "width 300ms ease",
              }} />
            </div>
            <span style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
              <strong style={{ color: "var(--ink)" }}>{fmtNumCompact(s.value)}</strong>
              {i > 0 && <span className="muted">  {fmtPct(stepConv, 1)} of prior</span>}
            </span>
          </div>
        );
      })}
      {steps.length >= 2 && steps[0].value > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
          Overall conversion: <strong style={{ color: "var(--ink)" }}>{fmtPct(steps[steps.length - 1].value / steps[0].value, 2)}</strong>
        </div>
      )}
    </div>
  );
}
