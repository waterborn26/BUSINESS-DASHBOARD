// Decision Journal — log decisions, then let the data judge them.

import React, { useMemo, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { fmtDateFull } from "@/lib/dates";
import { fmtPct, fmtUsdCompact } from "@/lib/money";
import { evaluateDecisions } from "@/engines/decisions";

const VERDICT_BADGE: Record<string, { cls: string; label: string }> = {
  beneficial: { cls: "good", label: "beneficial" },
  harmful: { cls: "critical", label: "harmful" },
  neutral: { cls: "", label: "no clear effect" },
  "too-early": { cls: "warning", label: "too early" },
};

export default function DecisionJournal() {
  const { store } = useApp();
  const evals = useMemo(() => evaluateDecisions(store), [store]);
  const [draft, setDraft] = useState({ title: "", hypothesis: "", expected: "", invested: "" });
  const [logged, setLogged] = useState<string[]>([]);

  return (
    <>
      <Card title="Log a decision">
        <div className="grid cols-4" style={{ alignItems: "end" }}>
          <label style={lbl}>Decision<input type="text" placeholder="e.g. Raised Everflask price to $48" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
          <label style={lbl}>Hypothesis<input type="text" placeholder="Why you expect it to work" value={draft.hypothesis} onChange={(e) => setDraft({ ...draft, hypothesis: e.target.value })} /></label>
          <label style={lbl}>Expected outcome<input type="text" placeholder="e.g. contribution +10%" value={draft.expected} onChange={(e) => setDraft({ ...draft, expected: e.target.value })} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ ...lbl, flex: 1 }}>Invested ($)<input type="number" value={draft.invested} onChange={(e) => setDraft({ ...draft, invested: e.target.value })} /></label>
            <button className="btn primary" style={{ height: 30 }} disabled={!draft.title.trim()}
              onClick={() => { setLogged((l) => [draft.title, ...l]); setDraft({ title: "", hypothesis: "", expected: "", invested: "" }); }}>
              Log
            </button>
          </div>
        </div>
        {logged.length > 0 && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Logged this session: {logged.join(" · ")} — evaluation begins automatically after 10 days of data.
          </p>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {evals.map((ev) => {
          const badge = VERDICT_BADGE[ev.verdict];
          return (
            <Card key={ev.decision.id}
              title={<>{ev.decision.title} <span className={`badge ${badge.cls}`}>{badge.label}</span></>}
              right={<span className="muted">{fmtDateFull(ev.decision.date)} · {ev.daysSince} days ago</span>}
            >
              <div className="grid cols-2">
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
                  <p><strong>Hypothesis:</strong> {ev.decision.hypothesis}</p>
                  <p><strong>Expected:</strong> {ev.decision.expectedOutcome}</p>
                  {ev.decision.invested > 0 && <p><strong>Invested:</strong> {fmtUsdCompact(ev.decision.invested)}</p>}
                  <p style={{ marginTop: 8 }}><strong>Verdict:</strong> {ev.summary}</p>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Metric</th><th className="num">Before*</th><th className="num">After*</th><th className="num">Change</th></tr></thead>
                    <tbody>
                      {ev.findings.map((f) => (
                        <tr key={f.label}>
                          <td>{f.label}</td>
                          <td className="num dim">{f.before}</td>
                          <td className="num">{f.after}</td>
                          <td className="num" style={{ color: f.deltaPct == null ? undefined : f.deltaPct > 0 ? "var(--delta-good)" : "var(--delta-bad)" }}>
                            {f.deltaPct == null ? "—" : fmtPct(f.deltaPct, 1, true)}
                          </td>
                        </tr>
                      ))}
                      {ev.findings.length === 0 && <tr><td colSpan={4} className="dim">No measurable metrics attached.</td></tr>}
                    </tbody>
                  </table>
                  <p className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                    *Equal windows before/after the decision date (max 45 days each).
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--ink-3)" };
