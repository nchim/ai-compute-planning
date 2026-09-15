import { create } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Engine } from "../engine/client";
import { EngineError } from "../engine/protocol";
import { PhasingMode, ResultSchema, Status, type Result, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import { logToJson } from "./log";
import { createStore } from "./store";
import { loadAbilene } from "./testPlan";
import { viewContext } from "./viewContext";

interface Pending {
  readonly plan: SitePlan;
  resolve(result: Result): void;
  reject(err: unknown): void;
}

/** An engine whose replies the test releases by hand, in any order. */
function controllableEngine(): Engine & { calls: Pending[] } {
  const calls: Pending[] = [];
  const analyze = (plan: SitePlan) =>
    new Promise<Result>((resolve, reject) => {
      calls.push({ plan, resolve, reject });
    });
  return { calls, analyze, optimize: analyze, dispose: vi.fn() };
}

const resultWithMw = (mw: number) =>
  create(ResultSchema, { status: Status.OK, summary: { mwOnlineFinal: mw } });

/** Drains the microtask queue (timers are faked, so no setTimeout here). */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

describe("store", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("a plan mutation triggers one debounced analyze; rapid edits coalesce (latest wins)", () => {
    const engine = controllableEngine();
    const store = createStore({ engine, now: () => 0 });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    store.dispatch({ type: "setField", path: "compute.pue", value: 1.3 });
    store.dispatch({ type: "setField", path: "compute.pue", value: 1.4 });
    expect(engine.calls).toHaveLength(0);
    vi.advanceTimersByTime(16);
    expect(engine.calls).toHaveLength(1);
    expect(engine.calls[0]!.plan.compute!.pue).toBe(1.4);
  });

  test("non-mutating commands do not re-analyze", () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    vi.advanceTimersByTime(16);
    store.dispatch({ type: "select", selection: { tab: "site", path: "compute.pue", phaseId: null } });
    store.dispatch({ type: "setField", path: "compute.nope", value: 1 });
    vi.advanceTimersByTime(16);
    expect(engine.calls).toHaveLength(1);
    expect(store.getState().error?.message).toContain("nope");
  });

  test("stale engine replies are dropped", async () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    vi.advanceTimersByTime(16);
    store.dispatch({ type: "setField", path: "compute.pue", value: 1.3 });
    vi.advanceTimersByTime(16);
    expect(engine.calls).toHaveLength(2);

    engine.calls[1]!.resolve(resultWithMw(2));
    await flush();
    expect(store.getState().result?.summary?.mwOnlineFinal).toBe(2);

    engine.calls[0]!.resolve(resultWithMw(1));
    await flush();
    expect(store.getState().result?.summary?.mwOnlineFinal).toBe(2);

    // A stale *rejection* is dropped too — it must not raise an error over the newer result.
    engine.calls[0]!.reject(new EngineError("worker", "late"));
    await flush();
    expect(store.getState().error).toBeNull();
  });

  test("engine rejections become an error with kind + message", async () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    vi.advanceTimersByTime(16);
    engine.calls[0]!.reject(new EngineError("decode", "bad bytes"));
    await flush();
    expect(store.getState().error).toEqual({ kind: "decode", message: "bad bytes" });

    store.dispatch({ type: "setField", path: "compute.pue", value: 1.3 });
    vi.advanceTimersByTime(16);
    engine.calls[1]!.reject(new Error("plain"));
    await flush();
    expect(store.getState().error).toEqual({ kind: "worker", message: "plain" });
  });

  test("the log carries caller-supplied seq/ts, rejections, and serializes to JSON", () => {
    const engine = controllableEngine();
    let t = 100;
    const store = createStore({ engine, now: () => t++ });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    store.dispatch({ type: "setField", path: "compute.bogus", value: 1 });
    const id = store.proposeChange("try liquid", [{ path: "compute.cooling", value: "LIQUID_DTC" }]);
    store.dispatch({ type: "acceptProposal", id });

    const log = store.getLog();
    expect(log.map((e) => [e.seq, e.ts, e.command.type])).toEqual([
      [1, 100, "loadPlan"],
      [2, 101, "setField"],
      [3, 102, "proposeChange"],
      [4, 103, "acceptProposal"],
    ]);
    expect(log[1]!.rejected?.message).toContain("bogus");
    expect(log[3]!.rejected).toBeNull();
    const json = JSON.parse(JSON.stringify(logToJson(log))) as { command: { type: string } }[];
    expect(json[0]!.command.type).toBe("loadPlan");
  });

  test("subscribers are notified and viewContext reflects state", () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    expect(listener).toHaveBeenCalledTimes(1);
    const ctx = viewContext(store.getState());
    expect(ctx.selectedSiteId).toBe("abilene-1");
    expect(ctx.activeTab).toBe("site");
    expect(ctx.resultSummary).toBeNull();
    expect(ctx.diagnostics).toEqual([]);
  });

  test("whenIdle resolves once the debounce has fired and the latest analyze has settled", async () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    await expect(store.whenIdle()).resolves.toBeUndefined(); // nothing pending: immediate

    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    let idle = false;
    const waiting = store.whenIdle().then(() => (idle = true));
    await flush();
    expect(idle).toBe(false); // debounce pending
    vi.advanceTimersByTime(16);
    await flush();
    expect(idle).toBe(false); // analyze in flight

    store.dispatch({ type: "setField", path: "compute.pue", value: 1.3 });
    vi.advanceTimersByTime(16);
    engine.calls[0]!.resolve(resultWithMw(1)); // stale reply: still not idle
    await flush();
    expect(idle).toBe(false);
    engine.calls[1]!.reject(new EngineError("decode", "bad"));
    await waiting;
    expect(store.getState().error?.kind).toBe("decode"); // idle even when the analyze failed
  });

  test("optimize sends a clone in OPTIMIZE mode, leaves the live plan untouched, and stores the reply", async () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    vi.advanceTimersByTime(16);
    engine.calls[0]!.resolve(resultWithMw(1));
    await flush();

    const pending = store.optimize();
    expect(engine.calls).toHaveLength(2);
    expect(engine.calls[1]!.plan.phasing?.mode).toBe(PhasingMode.OPTIMIZE);
    expect(store.getState().plan?.phasing?.mode).toBe(PhasingMode.SINGLE_SHOT);
    expect(store.getLog().map((e) => e.command.type)).toEqual(["loadPlan", "resultReceived"]);

    engine.calls[1]!.resolve(resultWithMw(2));
    expect((await pending).summary?.mwOnlineFinal).toBe(2);
    expect(store.getState().result?.summary?.mwOnlineFinal).toBe(2);

    // A newer analyze supersedes an optimize still in flight: its reply is returned but not stored.
    const stale = store.optimize();
    store.dispatch({ type: "setField", path: "compute.pue", value: 1.3 });
    vi.advanceTimersByTime(16);
    engine.calls[3]!.resolve(resultWithMw(4));
    engine.calls[2]!.resolve(resultWithMw(3));
    expect((await stale).summary?.mwOnlineFinal).toBe(3);
    await flush();
    expect(store.getState().result?.summary?.mwOnlineFinal).toBe(4);

    await expect(createStore({ engine }).optimize()).rejects.toThrow("no plan loaded");
  });

  test("dispose cancels pending work and disposes the engine", () => {
    const engine = controllableEngine();
    const store = createStore({ engine });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    store.dispose();
    vi.advanceTimersByTime(16);
    expect(engine.calls).toHaveLength(0);
    expect(engine.dispose).toHaveBeenCalledOnce();
    expect(() => store.dispatch({ type: "undo" })).toThrow("disposed");
  });
});
