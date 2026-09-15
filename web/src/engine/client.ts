// Main-thread client: encodes a SitePlan, sends it to the worker, and decodes the Result. Every
// failure rejects with an EngineError; replies whose id is unknown (stale, already timed out) are
// dropped rather than applied.

import { fromBinary, toBinary } from "@bufbuild/protobuf";

import { ResultSchema, SitePlanSchema, type Result, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import { EngineError, describe, type Op, type Reply, type Request } from "./protocol";

/** The subset of Worker the client uses; tests substitute an in-process fake. */
export interface WorkerLike {
  postMessage(message: Request, transfer: Transferable[]): void;
  onmessage: ((event: MessageEvent<Reply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface EngineOptions {
  /** Per-request deadline; the promise rejects with kind "timeout" when it passes. */
  timeoutMs?: number;
  /** Defaults to the real engine worker. */
  worker?: WorkerLike;
}

export interface Engine {
  analyze(plan: SitePlan): Promise<Result>;
  optimize(plan: SitePlan): Promise<Result>;
  /** Terminates the worker; in-flight requests reject with kind "worker". */
  dispose(): void;
}

interface Pending {
  resolve: (bytes: Uint8Array) => void;
  reject: (err: EngineError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createEngine(opts: EngineOptions = {}): Engine {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const worker = opts.worker ?? spawnWorker();
  const pending = new Map<number, Pending>();
  let nextId = 1;

  const failAll = (err: EngineError) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  };

  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return; // stale or unknown reply: never applied
    pending.delete(data.id);
    clearTimeout(p.timer);
    if (data.ok) p.resolve(data.bytes);
    else p.reject(new EngineError(data.error.kind, data.error.message));
  };
  worker.onerror = (event) => failAll(new EngineError("worker", event.message || "engine worker crashed"));

  const call = (op: Op, plan: SitePlan): Promise<Result> => {
    let bytes: Uint8Array;
    try {
      bytes = toBinary(SitePlanSchema, plan);
    } catch (err) {
      return Promise.reject(new EngineError("encode", `encode SitePlan: ${describe(err)}`, { cause: err }));
    }
    const id = nextId++;
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new EngineError("timeout", `${op} did not reply within ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, op, bytes }, [bytes.buffer]);
    }).then((out) => {
      try {
        return fromBinary(ResultSchema, out);
      } catch (err) {
        throw new EngineError("decode", `decode Result: ${describe(err)}`, { cause: err });
      }
    });
  };

  return {
    analyze: (plan) => call("analyze", plan),
    optimize: (plan) => call("optimize", plan),
    dispose: () => {
      worker.terminate();
      failAll(new EngineError("worker", "engine disposed"));
    },
  };
}

function spawnWorker(): WorkerLike {
  return new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
}
