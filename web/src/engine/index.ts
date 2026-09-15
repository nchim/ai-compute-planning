import { createFakeEngine } from "./fake";
import { EngineError, type Engine } from "./types";

export { EngineError, isEngineError, type Engine, type EngineErrorKind } from "./types";

/**
 * The single place that decides which engine the app runs. `VITE_ENGINE=wasm` selects the WS5
 * worker-backed engine (`./client`), which needs `make wasm` to have produced `/engine.wasm`;
 * anything else — or a missing wasm build — falls back to the fake engine. The fallback is
 * reported through `onFallback` so it is visible, never silent.
 */
export function createEngine(onFallback: (reason: string) => void): Engine {
  if (import.meta.env.VITE_ENGINE !== "wasm") {
    onFallback("VITE_ENGINE is not 'wasm'");
    return createFakeEngine();
  }
  return lazyEngine(loadWasmEngine().catch((err: unknown) => {
    onFallback(`wasm engine unavailable: ${describe(err)}`);
    return createFakeEngine();
  }));
}

const wasmUrl = "/engine.wasm";

async function loadWasmEngine(): Promise<Engine> {
  // Probe before spawning the worker: a missing build should fall back visibly here, not surface
  // as a load error on every analyze.
  const probe = await fetch(wasmUrl, { method: "HEAD" });
  const type = probe.headers.get("content-type") ?? "";
  if (!probe.ok || !type.includes("wasm")) {
    throw new EngineError("load", `${wasmUrl} is not served (${probe.status} ${type || "no content-type"}); run make wasm`);
  }
  const { createEngine: createWasmEngine } = await import("./client");
  return createWasmEngine();
}

function lazyEngine(ready: Promise<Engine>): Engine {
  return {
    analyze: (plan) => ready.then((e) => e.analyze(plan)),
    optimize: (plan) => ready.then((e) => e.optimize(plan)),
    dispose() {
      ready.then((e) => e.dispose(), () => undefined);
    },
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
