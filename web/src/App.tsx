import { useStore, type Tab } from "./bus";
import { Canvas } from "./components/Canvas";
import { CopilotRail } from "./copilot";

const tabs: readonly { id: Tab; label: string; enabled: boolean }[] = [
  { id: "portfolio", label: "Portfolio", enabled: false },
  { id: "site", label: "Site Feasibility", enabled: true },
  { id: "scenario", label: "Scenario", enabled: false },
  { id: "demand", label: "Demand", enabled: false },
];

export function App() {
  const { state, store } = useStore();
  const active = state.selection.tab;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Capacity Planner <small>AI-Lab POC</small>
        </div>
        <nav className="nav" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              className="tab"
              aria-selected={t.id === active}
              disabled={!t.enabled}
              onClick={() => store.dispatch({ type: "select", selection: { ...state.selection, tab: t.id } })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="selector">Site: {state.plan?.meta?.siteName ?? "—"}</div>
      </header>
      <div className="bodyrow">
        <CopilotRail />
        <Canvas />
      </div>
    </div>
  );
}
