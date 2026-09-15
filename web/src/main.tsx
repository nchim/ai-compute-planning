import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./app.css";
import { StoreProvider, createStore } from "./bus";
import { EngineProvider } from "./copilot";
import { safeStorage } from "./copilot/history";
import { transport } from "./copilot/transport";
import { selectEngine } from "./engine";
import { installHarness } from "./harness/install";
import { SessionShareProvider, createSessionShare, loadSharePreference, sessionIdFor } from "./telemetry";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root element");
}

// The store (and the engine it owns) is created once here and handed down by context.
const engine = selectEngine((reason) => {
  // The fallback is expected in dev; it is surfaced (not hidden) so nobody mistakes fake numbers for real ones.
  console.info(`[engine] using fake engine: ${reason}`);
});
const store = createStore({ engine });
installHarness(store);

// Session sharing defaults on for the tester deployment (relay mode) and off for BYO-key dev builds;
// the rail's toggle persists the tester's choice.
const share = createSessionShare({
  store,
  enabled: loadSharePreference(safeStorage("local"), transport.mode === "relay"),
  sessionId: sessionIdFor(safeStorage("session")),
});

createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <EngineProvider engine={engine}>
        <SessionShareProvider share={share}>
          <App />
        </SessionShareProvider>
      </EngineProvider>
    </StoreProvider>
  </StrictMode>,
);
