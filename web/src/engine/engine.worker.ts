// Web Worker that loads wasm_exec.js + engine.wasm once and serves requests from the client.
// Both files are served from web/public (built by `make wasm`). Loading is started eagerly at
// import time; a failed load is reported per request with kind "load" so the client always rejects.

import { describe, serve, type EngineOps, type Request } from "./protocol";

declare class Go {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

const execUrl = "/wasm_exec.js";
const wasmUrl = "/engine.wasm";

async function load(): Promise<EngineOps> {
  // wasm_exec.js is a classic script that defines globalThis.Go; importing it as a module is fine
  // because it has no import/export statements (module workers cannot use importScripts).
  await import(/* @vite-ignore */ execUrl);
  const go = new Go();
  const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), go.importObject);
  // main() registers capplanner synchronously and then blocks forever, so run() never settles
  // unless the module exits, which is itself a load failure.
  void go.run(instance).then(() => {
    throw new EvalError("engine.wasm exited");
  });
  const ops = (globalThis as { capplanner?: EngineOps }).capplanner;
  if (!ops) throw new Error("engine.wasm did not register globalThis.capplanner");
  return ops;
}

const ready = load();

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data;
  let ops: EngineOps;
  try {
    ops = await ready;
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: { kind: "load", message: describe(err) } });
    return;
  }
  const reply = serve(ops, req);
  self.postMessage(reply, { transfer: reply.ok ? [reply.bytes.buffer] : [] });
};
