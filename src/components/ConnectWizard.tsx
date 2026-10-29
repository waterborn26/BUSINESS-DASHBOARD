// The guided setup for one source: the real steps, then the token or file.
//
// The paste step is deliberately unavailable in the browser build. A Shopify Admin
// token in a web page is a token you have given away, and offering the field anyway
// — storing it in localStorage and calling it connected — would be worse than not
// offering it at all.

import React, { useState } from "react";
import { GUIDES } from "@/domain/connectionGuides";
import { EFFORT_COPY, type ConnectionSpec } from "@/domain/connections";
import { secretHost, setSecret } from "@/lib/secrets";

type Save = { state: "idle" | "saving" | "saved" | "error"; message?: string };

export function ConnectWizard({ spec, onClose }: { spec: ConnectionSpec; onClose: () => void }) {
  const guide = GUIDES[spec.id];
  const [done, setDone] = useState<Set<number>>(new Set());
  const [value, setValue] = useState("");
  const [save, setSave] = useState<Save>({ state: "idle" });
  const host = secretHost();

  const toggle = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  async function store() {
    if (!guide?.secret) return;
    setSave({ state: "saving" });
    try {
      await setSecret(guide.secret.key, value.trim());
      setSave({ state: "saved" });
    } catch (e) {
      setSave({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  const valid = guide?.secret ? guide.secret.looksValid(value) : false;
  const allStepsDone = guide ? done.size >= guide.steps.length : false;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="wizard" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Connect ${spec.name}`}>
        <div className="wizard-head">
          <div>
            <h2>{spec.name}</h2>
            <div className="sub">{spec.unlocks}</div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">Close</button>
        </div>

        {!guide ? (
          <div className="insight warning">
            <div className="insight-title">Nothing to set up yet</div>
            <div className="insight-detail">
              <span className={`badge ${EFFORT_COPY[spec.effort].cls}`}>{EFFORT_COPY[spec.effort].label}</span>{" "}
              {spec.requires}
            </div>
          </div>
        ) : (
          <>
            <div className="wizard-meta">
              <span className="badge">about {guide.minutes} min</span>
              <span className="muted">{done.size} of {guide.steps.length} done</span>
              <div className="impact-track" style={{ flex: 1, minWidth: 80 }}>
                <div className="impact-fill" style={{ width: `${(done.size / guide.steps.length) * 100}%` }} />
              </div>
            </div>

            <ol className="wizard-steps">
              {guide.steps.map((s, i) => (
                <li key={i} className={done.has(i) ? "on" : ""}>
                  <button className="step-check" onClick={() => toggle(i)} aria-label={`Step ${i + 1} done`}>
                    {done.has(i) ? "✓" : i + 1}
                  </button>
                  <div>
                    <div className="step-text">{s.text}</div>
                    {s.link && (
                      <a className="link" href={s.link.url} target="_blank" rel="noreferrer noopener">
                        {s.link.label} →
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {guide.file && (
              <div className="wizard-finish">
                <div className="stat-label">{guide.file.label}</div>
                <input type="file" accept={guide.file.accept} disabled />
                <p className="muted">{guide.file.hint}</p>
                <p className="muted"><strong>Importer not built yet.</strong> Send me one export and I will build the reader around your bank's actual layout rather than a guess at it.</p>
              </div>
            )}

            {guide.secret && (
              <div className="wizard-finish">
                <div className="stat-label">{guide.secret.label}</div>
                {host === "desktop" ? (
                  <>
                    <input
                      type="password" value={value} placeholder={guide.secret.placeholder}
                      onChange={(e) => { setValue(e.target.value); setSave({ state: "idle" }); }}
                      spellCheck={false} autoComplete="off"
                    />
                    <div className="wizard-actions">
                      <button className="btn primary" disabled={!valid || save.state === "saving"} onClick={store}>
                        {save.state === "saving" ? "Saving…" : "Save to Keychain"}
                      </button>
                      {value && !valid && <span className="badge warning">that does not look like the right key</span>}
                      {save.state === "saved" && <span className="badge good">saved — sync still to be built</span>}
                      {save.state === "error" && <span className="badge critical">{save.message}</span>}
                    </div>
                  </>
                ) : (
                  <div className="insight warning">
                    <div className="insight-title">Finish this step in the desktop app</div>
                    <div className="insight-detail">
                      You are in the browser version, which has no Keychain. Pasting a live API
                      key into a web page is how keys leak, so the field is not offered here.
                      Work through the steps above now, then paste the key once in the Mac app.
                    </div>
                  </div>
                )}
                <p className="muted">{guide.secret.hint}</p>
              </div>
            )}

            {allStepsDone && !guide.secret && !guide.file && (
              <div className="insight win"><div className="insight-detail">All set — tell me and I will wire the sync.</div></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
