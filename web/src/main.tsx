import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./app.css";
import { StoreProvider, createStore } from "./bus";
import { selectEngine } from "./engine";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root element");
}

// The store (and the engine it owns) is created once here and handed down by context.
const store = createStore({
  engine: selectEngine((reason) => {
    // The fallback is expected in dev; it is surfaced (not hidden) so nobody mistakes fake numbers for real ones.
    console.info(`[engine] using fake engine: ${reason}`);
  }),
});

createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
