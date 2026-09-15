import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { ToolError } from "@anthropic-ai/sdk/lib/tools/ToolError";
import { describe, expect, test } from "vitest";

import { createStore } from "../bus";
import { loadAbilene } from "../bus/testPlan";
import { createFakeEngine } from "../engine";
import { createAnalysisTracker } from "./analysis";
import { researchPaths } from "./research";
import { createTools, type ToolEvent } from "./tools";

function harness() {
  const engine = createFakeEngine();
  const store = createStore({ engine, debounceMs: 0 });
  store.dispatch({ type: "loadPlan", plan: loadAbilene() });
  const events: ToolEvent[] = [];
  const tools = createTools({ store, engine, tracker: createAnalysisTracker(store, engine), onEvent: (e) => events.push(e) });
  const tool = (name: string): BetaRunnableTool => {
    const t = tools.find((x) => x.name === name);
    if (t === undefined) throw new Error(`no tool ${name}`);
    return t;
  };
  const run = async (name: string, input: unknown): Promise<unknown> => {
    const t = tool(name);
    const toolUse = { type: "tool_use" as const, id: `id-${name}`, name, input };
    return t.run(t.parse(input), { toolUse, toolUseBlock: toolUse });
  };
  return { store, events, run, tools };
}

describe("edit_site_plan under a slow engine", () => {
  test("returns the analysis of the plan it wrote, never a reply for the plan before it", async () => {
    // WS10 live run: a reply for the pre-edit plan landed after the edit and was reported as its analysis.
    const fake = createFakeEngine();
    const pending: ((r: Awaited<ReturnType<typeof fake.analyze>>) => void)[] = [];
    const engine = {
      ...fake,
      analyze: (plan: Parameters<typeof fake.analyze>[0]) => new Promise<Awaited<ReturnType<typeof fake.analyze>>>((resolve) => pending.push(() => fake.analyze(plan).then(resolve))),
    };
    const store = createStore({ engine, debounceMs: 0 });
    store.dispatch({ type: "loadPlan", plan: loadAbilene() });
    await new Promise((r) => setTimeout(r, 1));
    pending.shift()!(undefined as never); // the load's analyze replies
    await store.whenIdle();
    const tools = createTools({ store, engine, tracker: createAnalysisTracker(store, engine), onEvent: () => undefined });
    const edit = tools.find((t) => t.name === "edit_site_plan")!;

    store.dispatch({ type: "setField", path: "compute.target_it_load_mw", value: 150 }); // a human edit; its analyze is now in flight
    await new Promise((r) => setTimeout(r, 1));
    const input = { patch: [{ path: "compute.target_it_load_mw", value: 175 }] };
    const toolUse = { type: "tool_use" as const, id: "id-edit", name: "edit_site_plan", input };
    const call = edit.run(edit.parse(input), { toolUse, toolUseBlock: toolUse }) as Promise<string>;
    await new Promise((r) => setTimeout(r, 1));
    expect(pending).toHaveLength(2);
    pending.shift()!(undefined as never); // the 150 MW reply lands after the 175 MW edit: superseded
    pending.shift()!(undefined as never); // the 175 MW reply
    const out = JSON.parse(await call) as { analysis: { summary: { mw_online_final: number } } };
    expect(out.analysis.summary.mw_online_final).toBe(175);
    expect(store.getState().result?.summary?.mwOnlineFinal).toBe(175);
  });
});

describe("tool schemas", () => {
  test("no integer bounds anywhere (the API rejects minimum/maximum on strict integer properties)", () => {
    // zod's `.int()` emits ±MAX_SAFE_INTEGER bounds; the live API answered 400 on them (WS10 live run).
    const bounded = (v: unknown): boolean =>
      typeof v === "object" && v !== null && (Array.isArray(v) ? v.some(bounded) : ("minimum" in v || "maximum" in v) || Object.values(v).some(bounded));
    for (const t of harness().tools) expect(bounded((t as { input_schema?: unknown }).input_schema), `${t.name} input_schema carries minimum/maximum`).toBe(false);
  });
});

const failure = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ToolError);
    return String((err as ToolError).content);
  }
  throw new Error("expected the tool to fail");
};

describe("query_research", () => {
  test("returns a known file, or one section of it", async () => {
    const h = harness();
    const whole = JSON.parse(String(await h.run("query_research", { path: "research/README.md", section: null }))) as { text: string };
    expect(whole.text).toContain("Research Workspace");
    const section = JSON.parse(String(await h.run("query_research", { path: "research/README.md", section: "Method" }))) as { text: string };
    expect(section.text.startsWith("## Method")).toBe(true);
    expect(section.text).toContain("Shallow pass first");
    expect(section.text).not.toContain("Status board");
    expect(h.events.map((e) => e.status)).toEqual(["running", "done", "running", "done"]);
  });

  test("errors on an unknown path (listing valid ones) and on an unknown section", async () => {
    const h = harness();
    const msg = await failure(h.run("query_research", { path: "research/nope.md", section: null }));
    expect(msg).toContain('unknown research path "research/nope.md"');
    expect(msg).toContain("research/02-kpi-architecture.md");
    expect(researchPaths()).toContain("research/topics/14-speed-to-market/14-speed-to-market.md");
    const bad = await failure(h.run("query_research", { path: "research/README.md", section: "Nope" }));
    expect(bad).toContain("## Method");
    expect(h.events.at(-1)?.status).toBe("error");
  });
});

describe("explain", () => {
  test("looks up the glossary and errors on unknown topics", async () => {
    const h = harness();
    const out = JSON.parse(String(await h.run("explain", { topic: "LCOC" }))) as { explanation: string };
    expect(out.explanation).toContain("GPU-hour");
    expect(await failure(h.run("explain", { topic: "flux capacitor" }))).toContain("known topics");
  });
});

describe("propose_change and run_optimize", () => {
  test("propose_change validates the patch and returns a pending proposal id", async () => {
    const h = harness();
    const out = JSON.parse(String(await h.run("propose_change", { summary: "go liquid", patch: [{ path: "compute.cooling", value: "LIQUID_DTC" }] }))) as { proposal_id: string };
    expect(h.store.getState().proposals).toEqual([{ id: out.proposal_id, summary: "go liquid", patch: [{ path: "compute.cooling", value: "LIQUID_DTC" }], status: "pending" }]);
    expect(await failure(h.run("propose_change", { summary: "bad", patch: [{ path: "compute.cooling", value: "WATER" }] }))).toContain("CoolingMode");
    expect(h.store.getState().proposals).toHaveLength(1);
  });

  test("run_optimize writes objective/constraints/policy (not phasing.mode) and optimizes via the store", async () => {
    const h = harness();
    await failure(h.run("run_optimize", {
      objective: "MIN_STRANDED_PLUS_LCOC",
      constraints: [{ metric: "total_capex", op: "LE", value: 8e9 }],
      decision_vars: null,
      policy: { max_phases: 4, min_phase_mw: null, max_phase_mw: null, min_months_between_phases: null, max_shortfall_mw: 20 },
    }));
    const plan = h.store.getState().plan!;
    expect(plan.phasing?.mode).toBe(1); // SINGLE_SHOT: the live plan never flips to OPTIMIZE
    expect(plan.optimization?.objective?.type).toBe(1);
    expect(plan.optimization?.constraints[0]).toMatchObject({ metric: "total_capex", op: 1, value: 8e9 });
    expect(plan.phasing?.policy).toMatchObject({ maxPhases: 4, maxShortfallMw: 20 });
    const log = h.store.getLog().map((e) => e.command.type);
    // The load's debounced analyze is superseded by the patch's; then store.optimize stores its reply.
    expect(log).toEqual(["loadPlan", "applyPatch", "resultReceived", "resultReceived"]);
    // The fake engine returns no OptimizationResult, which is reported — not hidden.
    expect(h.events.at(-1)).toMatchObject({ name: "run_optimize", status: "error" });
  });
});

describe("set_baseline and toggle_compare", () => {
  test("pin with the default label, toggle, and surface reducer rejections as tool errors", async () => {
    const h = harness();
    expect(await failure(h.run("toggle_compare", {}))).toContain("no baseline");
    expect(await failure(h.run("set_baseline", { label: "x" }))).toContain("no result");

    await h.run("run_analyze", {});
    const pinned = JSON.parse(String(await h.run("set_baseline", { label: null }))) as { label: string; baseline_summary: { lcoc_per_gpu_hour: number } };
    expect(pinned.label).toBe("Grid-only single shot");
    expect(pinned.baseline_summary.lcoc_per_gpu_hour).toBe(h.store.getState().result?.summary?.lcocPerGpuHour);

    const on = JSON.parse(String(await h.run("toggle_compare", {}))) as { compare: boolean; baseline_label: string };
    expect(on).toEqual({ compare: true, baseline_label: "Grid-only single shot" });
    expect(h.store.getLog().filter((e) => e.command.type === "toggleCompare")).toHaveLength(2);
    expect(JSON.parse(String(await h.run("set_baseline", { label: "custom" }))).label).toBe("custom");
    expect(h.events.filter((e) => e.status === "error")).toHaveLength(2);
  });
});
