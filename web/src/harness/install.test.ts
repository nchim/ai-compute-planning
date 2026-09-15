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
    expect(byPath.get("costs.gpu.residual_curve[2]")?.value).toBe(0.5);
    expect(byPath.get("run.monte_carlo.seed")?.value).toBe(42);
    expect(byPath.get("run.sensitivity.delta_pct")).toBeDefined(); // unset sub-message: still settable
    for (const c of controls) await api.setControl(c.path, c.value); // every listed path round-trips
  });

  test("sendCopilot rejects until a Copilot is registered", async () => {
    const { api } = await loaded();
    await expect(api.sendCopilot("hi")).rejects.toThrow("Copilot not installed");
    const copilot = vi.fn(async () => undefined);
    await api.setCopilot(copilot);
    await api.sendCopilot("hi");
    expect(copilot).toHaveBeenCalledWith("hi");
    await api.setCopilot(async () => {
      throw new Error("turn failed");
    });
    await expect(api.sendCopilot("again")).rejects.toThrow("turn failed");
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
