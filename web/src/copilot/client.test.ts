// @vitest-environment jsdom
import { create, fromJsonString } from "@bufbuild/protobuf";
import { describe, expect, test, vi } from "vitest";

import fixture from "../../../fixtures/abilene-1.json?raw";
import { createStore, type Store } from "../bus";
import { fakeResult } from "../engine/fake";
import type { Engine } from "../engine";
import { CoolingMode, ResultSchema, Severity, SitePlanSchema, Status, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import { createCopilot } from "./client";
import { SYSTEM_PROMPT } from "./prompt";
import { lastToolResults, scriptedApi, type ScriptedTurn } from "./testApi";

/** Behaves like the real engine on T2: air cooling above 40 kW/rack is an INVALID_INPUT with a proto_path. */
function t2Engine(): Engine {
  const analyze = (plan: SitePlan) => {
    const c = plan.compute;
    if (c !== undefined && c.kwPerRack > 40 && c.cooling === CoolingMode.AIR) {
      return Promise.resolve(
        create(ResultSchema, {
          status: Status.INVALID_INPUT,
          diagnostics: [
            {
              severity: Severity.ERROR,
              code: "DENSITY_EXCEEDS_COOLING",
              message: "130 kW/rack cannot be air cooled",
              protoPath: "compute.cooling",
              expected: "LIQUID_DTC or IMMERSION above 40 kW/rack",
              actual: "AIR",
              hint: "set compute.cooling=LIQUID_DTC",
            },
          ],
        }),
      );
    }
    return Promise.resolve(fakeResult(plan));
  };
  return { analyze, optimize: analyze, dispose: vi.fn() };
}

function loadedStore(engine: Engine): Store {
  const store = createStore({ engine, debounceMs: 0 });
  // jsdom gives import.meta.url an http scheme, so the fs-based loadAbilene() cannot be used here.
  store.dispatch({ type: "loadPlan", plan: fromJsonString(SitePlanSchema, fixture) });
  return store;
}

const mutationPaths = (store: Store) =>
  store.getLog().flatMap((e) => {
    if (e.command.type === "setField") return [e.command.path];
    if (e.command.type === "applyPatch") return e.command.patch.map((p) => p.path);
    return [];
  });

describe("copilot tool loop (scripted API, real SDK)", () => {
  test("T2: diagnostic → edit on the named proto_path → re-run OK; only those paths are mutated", async () => {
    const turns: ScriptedTurn[] = [
      { content: [{ type: "tool_use", id: "toolu_1", name: "set_control", input: { path: "compute.kw_per_rack", value: 130 } }] },
      {
        content: [
          { type: "text", text: "The engine flags cooling; fixing compute.cooling." },
          { type: "tool_use", id: "toolu_2", name: "edit_site_plan", input: { patch: [{ path: "compute.cooling", value: "LIQUID_DTC" }] } },
        ],
        cacheRead: 1234,
      },
      { content: [{ type: "tool_use", id: "toolu_3", name: "run_analyze", input: {} }] },
      { content: [{ type: "text", text: "Fixed: **liquid cooling** at 130 kW/rack." }] },
    ];
    const api = scriptedApi(turns);
    const store = loadedStore(t2Engine());
    const onUsage = vi.fn();
    const copilot = createCopilot({ store, engine: t2Engine(), apiKey: "sk-test", client: api.client, storage: null, onUsage });

    await copilot.send("Push density to 130 kW/rack so we shrink the footprint.");

    expect(mutationPaths(store)).toEqual(["compute.kw_per_rack", "compute.cooling"]);
    expect(store.getState().plan?.compute?.cooling).toBe(CoolingMode.LIQUID_DTC);

    // Request shape: cached system prompt, adaptive thinking, streaming, strict tools, eager patch input.
    const [first, second, , fourth] = api.requests;
    expect(first?.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(first?.thinking).toEqual({ type: "adaptive" });
    expect(first?.stream).toBe(true);
    const tools = first?.tools as unknown as Array<Record<string, unknown>>;
    const edit = tools.find((t) => t["name"] === "edit_site_plan")!;
    const setControl = tools.find((t) => t["name"] === "set_control")!;
    expect(edit["strict"]).toBe(true);
    expect(edit["eager_input_streaming"]).toBe(true);
    expect((edit["input_schema"] as Record<string, unknown>)["additionalProperties"]).toBe(false);
    expect(setControl["strict"]).toBe(true);
    expect(setControl["eager_input_streaming"]).toBeUndefined();
    expect(tools.map((t) => t["name"])).toEqual([
      "edit_site_plan", "set_control", "run_analyze", "run_optimize", "propose_change", "set_baseline", "toggle_compare", "explain", "query_research",
    ]);

    // ViewContext is the first block of the user message, after the system prompt — never inside it.
    const userMessage = first?.messages[0];
    const blocks = userMessage?.content as Array<{ type: string; text: string }>;
    expect(blocks[0]?.text.startsWith("<view_context>")).toBe(true);
    expect(blocks[0]?.text).toContain('"plan_id":"abilene-1"');
    expect(blocks[1]?.text).toBe("Push density to 130 kW/rack so we shrink the footprint.");
    expect(SYSTEM_PROMPT).not.toContain("<view_context>");

    // The model saw the diagnostic with its proto_path, then a clean re-run.
    const [afterSet] = lastToolResults(second!);
    expect(afterSet?.tool_use_id).toBe("toolu_1");
    expect(afterSet?.is_error).toBeUndefined();
    expect(afterSet?.content).toContain("DENSITY_EXCEEDS_COOLING");
    expect(afterSet?.content).toContain('"proto_path":"compute.cooling"');
    const [afterAnalyze] = lastToolResults(fourth!);
    expect(afterAnalyze?.tool_use_id).toBe("toolu_3");
    expect(afterAnalyze?.content).toContain('"status":"OK"');
    expect(afterAnalyze?.content).toContain('"all_passed":true');

    // Usage is reported per turn; the transcript keeps every tool block; chips settled.
    expect(onUsage).toHaveBeenCalledTimes(4);
    const snap = copilot.getSnapshot();
    expect(snap.lastUsage?.cache_read_input_tokens).toBe(0);
    expect(onUsage.mock.calls[1]?.[0]?.cache_read_input_tokens).toBe(1234);
    expect(snap.transcript.messages).toHaveLength(8);
    expect(snap.transcript.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant", "user", "assistant"]);
    expect(snap.toolEvents.map((e) => e.status)).toEqual(["done", "done", "done"]);
    expect(snap.running).toBe(false);
    expect(snap.error).toBeNull();
  });

  test("an unknown path is refused before dispatch and returned as an is_error tool_result", async () => {
    const api = scriptedApi([
      { content: [{ type: "tool_use", id: "toolu_1", name: "set_control", input: { path: "compute.nope", value: 1 } }] },
      { content: [{ type: "text", text: "That field does not exist." }] },
    ]);
    const store = loadedStore(t2Engine());
    const copilot = createCopilot({ store, engine: t2Engine(), apiKey: "sk-test", client: api.client, storage: null });

    await copilot.send("set compute.nope");

    const [result] = lastToolResults(api.requests[1]!);
    expect(result?.is_error).toBe(true);
    expect(result?.content).toContain('no field "nope"');
    expect(mutationPaths(store)).toEqual([]);
    expect(store.getState().error).toBeNull();
    expect(copilot.getSnapshot().toolEvents[0]?.status).toBe("error");
  });

  test("schema-invalid input never reaches a tool", async () => {
    const api = scriptedApi([
      { content: [{ type: "tool_use", id: "toolu_1", name: "edit_site_plan", input: { patch: "compute.pue=1.3" } }] },
      { content: [{ type: "text", text: "ok" }] },
    ]);
    const store = loadedStore(t2Engine());
    const copilot = createCopilot({ store, engine: t2Engine(), apiKey: "sk-test", client: api.client, storage: null });
    await copilot.send("edit");
    const [result] = lastToolResults(api.requests[1]!);
    expect(result?.is_error).toBe(true);
    expect(mutationPaths(store)).toEqual([]);
  });

  test("an API failure rejects send and lands in the error banner; the turn is not left dangling", async () => {
    const api = scriptedApi([], { status: 401, message: "invalid x-api-key" });
    const store = loadedStore(t2Engine());
    const copilot = createCopilot({ store, engine: t2Engine(), apiKey: "sk-bad", client: api.client, storage: null });
    await expect(copilot.send("hello")).rejects.toThrow();
    const snap = copilot.getSnapshot();
    expect(snap.error).toContain("401");
    expect(snap.running).toBe(false);
    expect(snap.transcript.messages.map((m) => m.role)).toEqual(["user"]);
  });

  test("the transcript restores after a simulated reload (new Copilot, same storage)", async () => {
    window.localStorage.clear();
    const api = scriptedApi([{ content: [{ type: "text", text: "Hello again." }] }]);
    const store = loadedStore(t2Engine());
    const first = createCopilot({ store, engine: t2Engine(), apiKey: "sk-test", client: api.client, storage: window.localStorage });
    await first.send("hi");
    first.dispose();

    const second = createCopilot({ store, engine: t2Engine(), apiKey: "sk-test", client: api.client, storage: window.localStorage });
    expect(second.getSnapshot().transcript).toEqual(first.getSnapshot().transcript);
    expect(second.getSnapshot().transcript.messages).toHaveLength(2);
  });
});
