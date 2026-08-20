// Ask the Analyst — natural-language Q&A over the computed business database.
// Demo mode uses the deterministic composer; the LLM adapter receives the same
// structured context in the live build. Answers always cite metrics and periods.

import React, { useRef, useState } from "react";
import { useApp } from "@/state/AppContext";
import { Card } from "@/components/ui";
import { answerQuestion, type AnalystAnswer } from "@/engines/briefing";

const SUGGESTIONS = [
  "How much money do I actually have?",
  "Where did my money go this month?",
  "What are my most profitable products?",
  "What should I reorder?",
  "Why did my bank account decline even though I was profitable?",
  "Can I afford a $15,000 production run?",
  "How much should I keep reserved for sales tax?",
  "What are my biggest expenses?",
  "How much cash is tied up in inventory?",
  "Which marketing channels deserve more money?",
  "What should I focus on this week?",
  "What will revenue be next month?",
];

interface Turn { q: string; a: AnalystAnswer; }

export default function Analyst() {
  const { store } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const ask = (q: string) => {
    if (!q.trim()) return;
    const a = answerQuestion(store, q);
    setTurns((t) => [...t, { q, a }]);
    setInput("");
    setTimeout(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }), 30);
  };

  return (
    <>
      <Card title={<>Business & financial analyst <span className="badge">answers computed from your data — never fabricated</span></>}>
        <div ref={logRef} className="chat-log" style={{ maxHeight: "48vh", overflowY: "auto", paddingRight: 4 }}>
          {turns.length === 0 && (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Ask anything about sales, profit, cash, taxes, inventory, expenses, customers, or marketing.
              The analyst queries the normalized ledger and analytics engines, does all math in code, and
              cites the exact metrics and period used. In the live build, a Claude adapter phrases these
              same computed facts — the model never does the accounting.
            </p>
          )}
          {turns.map((t, i) => (
            <React.Fragment key={i}>
              <div className="chat-q">{t.q}</div>
              <div className="chat-a">
                {t.a.answer}
                <div className="chat-cite">
                  <strong>Period:</strong> {t.a.periodUsed}
                  {t.a.citations.length > 0 && (
                    <span> · <strong>Cited:</strong> {t.a.citations.map((c) => `${c.label} = ${c.value}`).join(" · ")}</span>
                  )}
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); ask(input); }}
          style={{ display: "flex", gap: 8, marginTop: 12 }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your business…"
            style={{ flex: 1 }}
            autoFocus
          />
          <button className="btn primary" type="submit">Ask</button>
        </form>
      </Card>

      <Card title="Try asking">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="btn" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      </Card>
    </>
  );
}
