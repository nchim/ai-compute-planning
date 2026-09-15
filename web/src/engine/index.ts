import { createFakeEngine } from "./fake";
import { EngineError, type Engine } from "./types";

export { EngineError, isEngineError, type Engine, type EngineErrorKind } from "./types";

/**
 * The single place that decides which engine the app runs. `VITE_ENGINE=wasm` selects the WS5
 * module (`./wasm`), loaded lazily; anything else — or a wasm module that cannot be imported —
 * falls back to the fake engine. The fallback is reported through `onFallback` so it is visible.
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

interface WasmEngineModule {
  createEngine(): Engine;
}

async function loadWasmEngine(): Promise<Engine> {
  // A non-literal specifier keeps tsc/Vite from resolving a module that only exists once WS5 merges.
  const specifier = "./wasm";
  const mod = (await import(/* @vite-ignore */ specifier)) as Partial<WasmEngineModule>;
  if (typeof mod.createEngine !== "function") {
    throw new EngineError("load", "./wasm does not export createEngine()");
  }
  return mod.createEngine();
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
