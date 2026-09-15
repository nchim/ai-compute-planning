import { clone, create } from "@bufbuild/protobuf";

import type { Engine } from "../engine/client";
import { EngineError } from "../engine/protocol";
import { PhasingMode, PhasingSchema, SitePlanSchema, type Result } from "../gen/capplanner/v1/engine_pb";
import { planChanged, reduce } from "./reducer";
import { initialState, type Command, type LogEntry, type PatchOp, type State } from "./types";

export interface StoreOptions {
  readonly engine: Engine;
  /** Wall clock for log timestamps (injectable so tests stay deterministic). */
  readonly now?: () => number;
  /** Plan mutations within this window coalesce into one analyze call. */
  readonly debounceMs?: number;
}

export interface Store {
  getState(): State;
  subscribe(listener: () => void): () => void;
  dispatch(command: Command): void;
  /** Convenience over `proposeChange`: mints the proposal id and returns it. */
  proposeChange(summary: string, patch: readonly PatchOp[]): string;
  /**
   * Runs the optimizer on a clone of the current plan with `phasing.mode=OPTIMIZE` — the live plan is
   * untouched. The reply is stored via `resultReceived` under the same stale-reply guard as analyze,
   * and returned.
   */
  optimize(): Promise<Result>;
  getLog(): readonly LogEntry[];
  /** Resolves once no analyze is debounced or in flight (also after a failed analyze). */
  whenIdle(): Promise<void>;
  dispose(): void;
}

/**
 * Owns the state, the command log and the re-analyze cycle. Plan mutation → (debounced) analyze →
 * `resultReceived`. Each engine call takes a request number, minted when the mutation is scheduled;
 * a reply is applied only if it is still the latest, so replies for a superseded plan (out of order,
 * or landing while a newer mutation is still debounced) are dropped rather than shown.
 * Instances are created in `main.tsx` and passed by context — there is no module-level store.
 */
export function createStore(options: StoreOptions): Store {
  const { engine, now = Date.now, debounceMs = 16 } = options;
  let state = initialState;
  const log: LogEntry[] = [];
  const listeners = new Set<() => void>();
  let latestRequest = 0;
  let proposalCounter = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let inFlight = 0;
  const idleWaiters: (() => void)[] = [];
  let disposed = false;

  const notify = () => listeners.forEach((l) => l());

  const dispatch = (command: Command) => {
    if (disposed) throw new Error("store is disposed");
    const prev = state;
    state = reduce(prev, command);
    const rejected = state.error !== null && state.error !== prev.error && state.error.kind === "command";
    log.push({ seq: log.length + 1, ts: now(), command, rejected: rejected ? state.error : null });
    if (planChanged(prev, state)) scheduleAnalyze();
    notify();
  };

  const scheduleAnalyze = () => {
    latestRequest++; // anything still in flight is for a superseded plan: drop its reply
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(runAnalyze, debounceMs);
  };

  const isIdle = () => debounce === null && inFlight === 0;

  const settleIfIdle = () => {
    if (!isIdle()) return;
    idleWaiters.splice(0).forEach((resolve) => resolve());
  };

  const runAnalyze = () => {
    debounce = null;
    const plan = state.plan;
    if (plan === null) {
      settleIfIdle();
      return;
    }
    // Fire-and-forget: the guarded handler already reported any failure to the UI.
    guarded(latestRequest, engine.analyze(plan)).catch(() => undefined);
  };

  /** Tracks an engine reply as in flight and applies it only while `request` is still the latest. */
  const guarded = (request: number, reply: Promise<Result>): Promise<Result> => {
    inFlight++;
    return reply
      .then(
        (result) => {
          if (request === latestRequest && !disposed) dispatch({ type: "resultReceived", result });
          return result;
        },
        (err: unknown) => {
          if (request === latestRequest && !disposed) {
            const kind = err instanceof EngineError ? err.kind : "worker";
            const message = err instanceof Error ? err.message : String(err);
            dispatch({ type: "errorRaised", error: { kind, message } });
          }
          throw err;
        },
      )
      .finally(() => {
        inFlight--;
        settleIfIdle();
      });
  };

  const optimize = (): Promise<Result> => {
    if (disposed) return Promise.reject(new Error("store is disposed"));
    if (state.plan === null) return Promise.reject(new Error("no plan loaded"));
    const candidate = clone(SitePlanSchema, state.plan);
    candidate.phasing ??= create(PhasingSchema);
    candidate.phasing.mode = PhasingMode.OPTIMIZE;
    dispatch({ type: "optimizeStarted" });
    return guarded(++latestRequest, engine.optimize(candidate)).finally(() => {
      if (!disposed) dispatch({ type: "optimizeSettled" });
    });
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    proposeChange(summary, patch) {
      const id = `p${++proposalCounter}`;
      dispatch({ type: "proposeChange", id, summary, patch });
      return id;
    },
    optimize,
    getLog: () => log,
    whenIdle: () =>
      new Promise((resolve) => {
        if (isIdle()) resolve();
        else idleWaiters.push(resolve);
      }),
    dispose() {
      disposed = true;
      if (debounce !== null) clearTimeout(debounce);
      listeners.clear();
      engine.dispose();
    },
  };
}
