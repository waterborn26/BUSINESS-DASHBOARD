import React, { Suspense } from "react";
import { AppProvider, useApp } from "./state/AppContext";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { CommandPalette } from "./components/layout/CommandPalette";
import { Drawer } from "./components/layout/Drawer";
import { PAGES } from "./pages";

function Shell() {
  const { route, navOpen, setNavOpen } = useApp();
  const Page = PAGES[route] ?? PAGES.command;
  return (
    <div className={`app ${navOpen ? "nav-open" : ""}`}>
      <Sidebar />
      {navOpen && <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />}
      <div className="main">
        <TopBar />
        <main className="content">
          <div className="content-inner">
            <Suspense fallback={<div className="muted">Loading…</div>}>
              <Page />
            </Suspense>
          </div>
        </main>
      </div>
      <CommandPalette />
      <Drawer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
