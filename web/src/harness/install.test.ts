import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { createStore, type Store } from "../bus";
import { createFakeEngine, EngineError, type Engine } from "../engine";
import { createHarnessApi, type HarnessApi } from "./install";

const fixture = () => readFileSync(fileURLToPath(new URL("../../../fixtures/abilene-1.json", import.meta.url)), "utf8");

function harness(engine: Engine = createFakeEngine()): { api: HarnessApi; store: Store } {
  const store = createStore({ engine, debounceMs: 0 });
  return { api: createHarnessApi(store), store };
}

async function loaded(): Promise<{ api: HarnessApi; store: Store }> {
  const h = harness();
  await h.api.loadPlan(fixture());
  await h.api.waitIdle();
  return h;
}

describe("harness api", () => {
  test("rejects with a clear message before a plan is loaded, and on malformed protojson", async () => {
    const { api } = harness();
    await expect(api.getPlan()).rejects.toThrow("no plan loaded");
    await expect(api.listControls()).rejects.toThrow("no plan loaded");
    await expect(api.setControl("compute.pue", 1.3)).rejects.toThrow("setField: no plan loaded");
    await expect(api.loadPlan("{not json")).rejects.toThrow("loadPlan: invalid SitePlan protojson");
    await expect(api.loadPlan('{"compute": {"pue": "high"}}')).rejects.toThrow("invalid SitePlan protojson");
    await expect(api.loadPlan(42 as unknown as string)).rejects.toThrow("protojson must be a string");
    expect(await api.getResult()).toBeNull();
  });

  test("loadPlan → waitIdle yields a Result; setControl changes the plan and is logged; undo restores it", async () => {
    const { api } = await loaded();
    const result = JSON.parse((await api.getResult()) as string) as { status: string };
    expect(result.status).toBe("OK");

    const before = await api.getPlan();
    await api.setControl("costs.gpu.depreciation_years", 4);
    await api.waitIdle();
    const after = await api.getPlan();
    expect(after).not.toBe(before);
    expect(JSON.parse(after).costs.gpu.depreciation_years).toBe(4);

    const log = (await api.getCommandLog()) as { command: { type: string; path?: string } }[];
    expect(log.map((e) => e.command.type)).toEqual(["loadPlan", "resultReceived", "setField", "resultReceived"]);

    await api.undo();
    expect(await api.getPlan()).toBe(before);
    await api.redo();
    expect(await api.getPlan()).toBe(after);
    await api.undo();
    await expect(api.undo()).rejects.toThrow("nothing to undo");
  });

  test("loadFixture loads a fixture by name and rejects unknown names with the known list", async () => {
    const { api } = harness();
    await expect(api.loadFixture("nope")).rejects.toThrow('unknown fixture "nope"; known: abilene-1');
    await expect(api.loadFixture(3 as unknown as string)).rejects.toThrow("name must be a string");
    await api.loadFixture("nova-colo");
    await api.waitIdle();
    expect(JSON.parse(await api.getPlan()).meta.plan_id).toBe("nova-colo");
    expect(JSON.parse((await api.getResult()) as string).status).toBe("OK");
  });

  test("a bad path or value rejects with the reducer's message and leaves the plan untouched", async () => {
    const { api } = await loaded();
    const before = await api.getPlan();
    await expect(api.setControl("compute.nope", 1)).rejects.toThrow('ComputeSpec has no field "nope"');
    await expect(api.setControl("compute.pue", "high")).rejects.toThrow("expected number");
    await expect(api.setControl("compute.pue", null as unknown as number)).rejects.toThrow("string, number or boolean");
    expect(await api.getPlan()).toBe(before);
    await api.waitIdle(); // a command rejection is not an engine error
  });

  test("listControls enumerates scalar and enum leaves with current values, including repeated entries", async () => {
    const { api } = await loaded();
    const controls = await api.listControls();
    const byPath = new Map(controls.map((c) => [c.path, c]));
    expect(byPath.get("costs.gpu.depreciation_years")).toEqual({ path: "costs.gpu.depreciation_years", type: "int32", value: 5 });
    expect(byPath.get("compute.cooling")).toMatchObject({ type: "CoolingMode", value: "AIR" });
    expect(byPath.get("compute.cooling")?.options).toContain("LIQUID_DTC");
    expect(byPath.get("power.sources[0].capacity_mw")?.value).toBe(260);
    expect(byPath.get("demand.points[1].demand_mw")?.value).toBe(100);
    expect(byPath.get("run.monte_carlo.seed")?.value).toBe(42);
    expect(byPath.get("run.sensitivity.delta_pct")).toBeDefined(); // unset sub-message: still settable
    for (const c of controls) await api.setControl(c.path, c.value); // every listed path round-trips
  });

  test("sendCopilot/getCopilotSnapshot reject until a Copilot is registered", async () => {
    const { api } = await loaded();
    await expect(api.sendCopilot("hi")).rejects.toThrow("Copilot not installed");
    await expect(api.getCopilotSnapshot()).rejects.toThrow("Copilot not installed");
    await expect(api.setCopilot({ send: async () => undefined } as never)).rejects.toThrow("expected { send, snapshot }");
    const send = vi.fn(async () => undefined);
    await api.setCopilot({ send, snapshot: () => ({ messages: 2 }) });
    await api.sendCopilot("hi");
    expect(send).toHaveBeenCalledWith("hi");
    expect(await api.getCopilotSnapshot()).toEqual({ messages: 2 });
    await api.setCopilot({
      send: async () => {
        throw new Error("turn failed");
      },
      snapshot: () => null,
    });
    await expect(api.sendCopilot("again")).rejects.toThrow("turn failed");
  });

  test("proposeChange opens a card the way the Copilot does and rejects a bad patch at the boundary", async () => {
    const { api, store } = await loaded();
    await expect(api.proposeChange("bad", [{ path: "compute.nope", value: 1 }])).rejects.toThrow('ComputeSpec has no field "nope"');
    await expect(api.proposeChange("empty", [])).rejects.toThrow("non-empty array");
    const id = await api.proposeChange("denser", [{ path: "compute.kw_per_rack", value: 130 }]);
    expect(store.getState().proposals).toEqual([{ id, summary: "denser", patch: [{ path: "compute.kw_per_rack", value: 130 }], status: "pending" }]);
    await api.acceptCard(id);
    expect(JSON.parse(await api.getPlan()).compute.kw_per_rack).toBe(130);
  });

  test("optimize runs the optimizer on the current plan and returns the Result", async () => {
    const { api } = harness();
    await expect(api.optimize()).rejects.toThrow("no plan loaded");
    const loadedApi = (await loaded()).api;
    const result = JSON.parse(await loadedApi.optimize()) as { status: string; optimization?: unknown };
    expect(result.status).toBeTruthy();
    expect(JSON.parse(await loadedApi.getPlan()).phasing.mode).toBe("SINGLE_SHOT"); // the live plan is untouched
  });

  test("acceptCard/rejectCard settle the latest pending proposal by default", async () => {
    const { api, store } = await loaded();
    await expect(api.acceptCard()).rejects.toThrow("no pending proposal");
    store.proposeChange("liquid", [{ path: "compute.cooling", value: "LIQUID_DTC" }]);
    const second = store.proposeChange("denser", [{ path: "compute.kw_per_rack", value: 130 }]);
    await api.acceptCard();
    expect(JSON.parse(await api.getPlan()).compute.kw_per_rack).toBe(130);
    await expect(api.acceptCard(second)).rejects.toThrow("already accepted");
    await api.rejectCard();
    await expect(api.rejectCard("p9")).rejects.toThrow('no proposal "p9"');
    expect(store.getState().proposals.map((p) => p.status)).toEqual(["rejected", "accepted"]);
  });

  test("waitIdle rejects on an engine error and on timeout", async () => {
    const failing: Engine = {
      analyze: () => Promise.reject(new EngineError("worker", "boom")),
      optimize: () => Promise.reject(new EngineError("worker", "boom")),
      dispose: () => undefined,
    };
    const { api } = harness(failing);
    await api.loadPlan(fixture());
    await expect(api.waitIdle()).rejects.toThrow("engine error (worker): boom");

    const hanging: Engine = { ...failing, analyze: () => new Promise(() => undefined) };
    const slow = harness(hanging);
    await slow.api.loadPlan(fixture());
    await expect(slow.api.waitIdle(20)).rejects.toThrow("not idle after 20 ms");
  });

  test("getViewContext is plain JSON with the plan and diagnostics", async () => {
    const { api } = await loaded();
    const ctx = (await api.getViewContext()) as { selectedSiteId: string; diagnostics: { code: string }[] };
    expect(ctx.selectedSiteId).toBe("abilene-1");
    expect(ctx.diagnostics[0]?.code).toBe("FAKE_ENGINE");
    expect(JSON.parse(JSON.stringify(ctx))).toEqual(ctx);
  });
});

describe("baseline", () => {
  test("setBaseline → getBaseline → toggleCompare; undo leaves the baseline; clear resets compare", async () => {
    const { api, store } = await loaded();
    await expect(api.toggleCompare()).rejects.toThrow("no baseline");
    await expect(api.setBaseline(7 as unknown as string)).rejects.toThrow("label must be a string");

    await api.setBaseline();
    const pinned = await api.getBaseline();
    expect(pinned?.label).toBe("Grid-only single shot");
    expect((pinned?.summary as { lcoc_per_gpu_hour?: number }).lcoc_per_gpu_hour).toBeGreaterThan(0);

    await api.setControl("costs.gpu.depreciation_years", 4);
    await api.waitIdle();
    await api.toggleCompare();
    const ctx = (await api.getViewContext()) as { compare: boolean; baselineLabel: string; baselineSummary: unknown };
    expect(ctx.compare).toBe(true);
    expect(ctx.baselineLabel).toBe("Grid-only single shot");
    expect(ctx.baselineSummary).toEqual(pinned?.summary);

    await api.undo();
    expect(await api.getBaseline()).toEqual(pinned);
    expect(store.getState().compare).toBe(true);

    await api.clearBaseline();
    expect(await api.getBaseline()).toBeNull();
    expect(store.getState().compare).toBe(false);
    await expect(api.clearBaseline()).rejects.toThrow("clearBaseline: no baseline");
  });

  test("setBaseline rejects before any Result exists", async () => {
    const { api } = harness();
    await expect(api.setBaseline("x")).rejects.toThrow("setBaseline: no result");
  });
});
