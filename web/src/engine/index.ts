import { createEngine, type Engine } from "./client";
import { createFakeEngine } from "./fake";

export { createEngine, type Engine, type EngineOptions, type WorkerLike } from "./client";
export { createFakeEngine } from "./fake";
export { EngineError, type EngineErrorKind } from "./protocol";

/**
 * The single place that decides which engine the app runs: `VITE_ENGINE=wasm` selects the WASM
 * worker engine (a missing `engine.wasm` then surfaces as a "load" error in the UI, not silently);
 * anything else selects the fake engine and says so through `onFallback`.
 */
export function selectEngine(onFallback: (reason: string) => void): Engine {
  const choice = import.meta.env.VITE_ENGINE;
  if (choice === "wasm") return createEngine();
  onFallback(choice === undefined ? "VITE_ENGINE is unset" : `VITE_ENGINE=${String(choice)}`);
  return createFakeEngine();
}
