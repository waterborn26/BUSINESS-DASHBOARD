import React from "react";
import { useApp } from "@/state/AppContext";
import { ROUTES, ROUTE_GROUPS } from "@/state/routes";

export function Sidebar() {
  const { route, navigate } = useApp();
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="logo">M</span> Meridian
      </div>
      {ROUTE_GROUPS.map((g) => (
        <div className="nav-group" key={g}>
          <div className="nav-group-label">{g}</div>
          {ROUTES.filter((r) => r.group === g).map((r) => (
            <button
              key={r.id}
              className={`nav-item ${route === r.id ? "active" : ""}`}
              onClick={() => navigate(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "14px 10px 6px", fontSize: 10.5, color: "var(--ink-3)" }}>
        Demo dataset · ⌘K to search
      </div>
    </nav>
  );
}
