import type { Store } from "../bus";
import type { Engine } from "../engine";
import type { Result } from "../gen/capplanner/v1/engine_pb";

export interface AnalysisTracker {
  /** Resolves with a Result that reflects the current plan, running/awaiting the engine as needed. */
  settle(): Promise<Result>;
  dispose(): void;
}

/**
 * Knows whether `state.result` is current for `state.plan`. The store re-analyzes (debounced) after
 * every plan mutation; the tracker watches for the mutation and the reply so a tool can wait for the
 * reply instead of reading a stale Result.
 */
export function createAnalysisTracker(store: Store, engine: Engine, timeoutMs = 10_000): AnalysisTracker {
  let seen = store.getState();
  let dirty = seen.plan !== null && seen.result === null;
  let failure: string | null = null;

  const unsubscribe = store.subscribe(() => {
    const next = store.getState();
    if (next.plan !== seen.plan) {
      dirty = true;
      failure = null;
    }
    if (next.result !== seen.result) {
      dirty = false;
      failure = null;
    } else if (dirty && next.error !== null && next.error !== seen.error && next.error.kind !== "command") {
      dirty = false;
      failure = next.error.message;
    }
    seen = next;
  });

  const awaitReply = () =>
    new Promise<Result>((resolve, reject) => {
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`the engine did not reply within ${timeoutMs} ms`));
      }, timeoutMs);
      const stop = store.subscribe(() => {
        if (dirty) return;
        stop();
        clearTimeout(timer);
        settled().then(resolve, reject);
      });
    });

  const settled = async (): Promise<Result> => {
    if (failure !== null) throw new Error(`engine error: ${failure}`);
    const { plan, result } = store.getState();
    if (plan === null) throw new Error("no plan is loaded");
    if (result !== null) return result;
    // Nothing in flight and nothing cached (e.g. right after a load): analyze now.
    const fresh = await engine.analyze(plan);
    store.dispatch({ type: "resultReceived", result: fresh });
    return fresh;
  };

  return {
    settle: () => (dirty ? awaitReply() : settled()),
    dispose: unsubscribe,
  };
}
