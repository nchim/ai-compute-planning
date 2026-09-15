import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { StoreProvider, createStore } from "./bus";
import { createEngine } from "./engine";
import { installHarness } from "./harness/install";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("index.html has no #root element");
}
const store = createStore({ engine: createEngine((reason) => console.warn(`engine: ${reason}`)) });
installHarness(store);
createRoot(root).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
