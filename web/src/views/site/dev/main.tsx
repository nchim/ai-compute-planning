import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { StoreProvider, createStore } from "../../../bus";
import type { Engine } from "../../../engine/types";
import { SiteFeasibilityView } from "../SiteFeasibilityView";
import { loadGoldenPlan, loadGoldenResult } from "../testdata";

/**
 * Storybook-free dev route: `npm run dev` then open /dev-site.html. Renders the view against the
 * hand-built golden Result; every plan edit "re-analyzes" to the same golden so the controls stay live.
 */
const goldenEngine: Engine = {
  analyze: () => Promise.resolve(loadGoldenResult()),
  optimize: () => Promise.resolve(loadGoldenResult()),
  dispose() {},
};

const store = createStore({ engine: goldenEngine });
store.dispatch({ type: "loadPlan", plan: loadGoldenPlan() });

const root = document.getElementById("root");
if (root === null) throw new Error("dev-site.html has no #root element");
createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <SiteFeasibilityView />
    </StoreProvider>
  </StrictMode>,
);
