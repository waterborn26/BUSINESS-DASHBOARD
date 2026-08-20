// Right-hand drilldown drawer — used by "Why?" explanations and metric drilldowns.

import React from "react";
import { useApp } from "@/state/AppContext";

export function Drawer() {
  const { drill, closeDrill } = useApp();
  if (!drill) return null;
  return (
    <>
      <div className="drawer-overlay" onClick={closeDrill} />
      <aside className="drawer" role="dialog" aria-label={drill.title}>
        <div style={{ display: "flex", alignItems: "start" }}>
          <div>
            <h2>{drill.title}</h2>
            {drill.subtitle && <div className="sub">{drill.subtitle}</div>}
          </div>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={closeDrill}>Esc</button>
        </div>
        <div style={{ marginTop: 8 }}>{drill.body}</div>
      </aside>
    </>
  );
}
