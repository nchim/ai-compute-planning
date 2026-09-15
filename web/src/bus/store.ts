import type { Engine } from "../engine/client";
import { EngineError } from "../engine/protocol";
import type { Result, SitePlan } from "../gen/capplanner/v1/engine_pb";
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
  /** Runs the optimizer on the current plan; the reply lands as `resultReceived` like an analyze. */
  optimize(): void;
  getLog(): readonly LogEntry[];
  dispose(): void;
}

/**
 * Owns the state, the command log and the re-analyze cycle. Plan mutation → (debounced) analyze →
 * `resultReceived`. Each analyze call takes a request number; a reply is applied only if it is still
 * the latest, so out-of-order engine replies are dropped rather than overwriting a newer result.
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
    if (debounce !== null) clearTimeout(debounce);
    debounce = setTimeout(runAnalyze, debounceMs);
  };

  const runAnalyze = () => {
    debounce = null;
    runEngine((plan) => engine.analyze(plan));
  };

  /** Analyze and optimize share one request counter, so whichever reply is newest wins. */
  const runEngine = (call: (plan: SitePlan) => Promise<Result>) => {
    const plan = state.plan;
    if (plan === null) return;
    const request = ++latestRequest;
    call(plan).then(
      (result) => {
        if (request === latestRequest && !disposed) dispatch({ type: "resultReceived", result });
      },
      (err: unknown) => {
        if (request !== latestRequest || disposed) return;
        const kind = err instanceof EngineError ? err.kind : "worker";
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: "errorRaised", error: { kind, message } });
      },
    );
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
    optimize() {
      if (disposed) throw new Error("store is disposed");
      runEngine((plan) => engine.optimize(plan));
    },
    getLog: () => log,
    dispose() {
      disposed = true;
      if (debounce !== null) clearTimeout(debounce);
      listeners.clear();
      engine.dispose();
    },
  };
}
