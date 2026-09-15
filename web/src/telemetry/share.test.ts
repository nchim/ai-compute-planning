import { fromJsonString } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import fixture from "../../../fixtures/abilene-1.json?raw";
import { createStore } from "../bus";
import { emptySnapshot, type Copilot, type CopilotEvent, type CopilotSnapshot } from "../copilot/client";
import { VIEW_CONTEXT_PREFIX } from "../copilot/context";
import { createFakeEngine } from "../engine";
import { SitePlanSchema } from "../gen/capplanner/v1/engine_pb";
import { chunkEntries, createSessionShare, type SessionEvent } from "./share";
import { summarizeLastTurn } from "./turn";

const plan = () => fromJsonString(SitePlanSchema, fixture);

/** A fetch that records every posted event and answers as scripted. */
function recordingFetch(answer: () => Promise<Response> = () => Promise.resolve(new Response(null, { status: 204 }))) {
  const events: SessionEvent[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    events.push(JSON.parse(String(init?.body)) as SessionEvent);
    return answer();
  });
  return { impl: impl as unknown as typeof fetch, events, calls };
}

function setup(opts: { enabled?: boolean; fetch?: typeof fetch } = {}) {
  const store = createStore({ engine: createFakeEngine(), debounceMs: 0 });
  const net = recordingFetch();
  const share = createSessionShare({ store, enabled: opts.enabled ?? true, sessionId: "sess-1", fetch: opts.fetch ?? net.impl });
  return { store, share, net };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createSessionShare", () => {
  test("batches command-log entries (~1 s) and reports the newest Result", async () => {
    const { store, share, net } = setup();
    store.dispatch({ type: "loadPlan", plan: plan() });
    store.dispatch({ type: "setField", path: "compute.kw_per_rack", value: 120 });
    await vi.advanceTimersByTimeAsync(500);
    expect(net.events).toHaveLength(0); // still debounced
    await vi.advanceTimersByTimeAsync(600);

    expect(net.calls[0]?.url).toBe("/api/session");
    expect(net.calls[0]?.init.method).toBe("POST");
    expect(net.events.map((e) => e.kind)).toEqual(["commands", "result"]);
    const [commands, result] = net.events as [SessionEvent, SessionEvent];
    expect(commands).toMatchObject({ session_id: "sess-1", plan_id: "abilene-1", seq: 1 });
    const entries = (commands.payload as { entries: { seq: number; command: { type: string; status?: string } }[] }).entries;
    expect(entries.map((e) => e.command.type)).toEqual(["loadPlan", "setField", "resultReceived"]);
    expect(entries[2]?.command).toEqual({ type: "resultReceived", status: "OK" }); // compact: the result event carries the rest
    expect(result.payload).toMatchObject({ status: "OK", diagnostics: expect.any(Array) });
    expect((result.payload as { summary: unknown }).summary).not.toBeNull();

    // A later change is a new batch with fresh entries only.
    store.dispatch({ type: "setField", path: "compute.kw_per_rack", value: 130 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(net.events.map((e) => e.kind)).toEqual(["commands", "result", "commands", "result"]);
    const later = (net.events[2]?.payload as { entries: { seq: number }[] }).entries;
    expect(later.map((e) => e.seq)).toEqual([4, 5]);
    share.dispose();
  });

  test("sends nothing while off, and does not backfill entries logged while off", async () => {
    const { store, share, net } = setup({ enabled: false });
    store.dispatch({ type: "loadPlan", plan: plan() });
    await vi.advanceTimersByTimeAsync(1100);
    expect(net.events).toHaveLength(0);

    share.setEnabled(true);
    store.dispatch({ type: "setField", path: "compute.kw_per_rack", value: 120 });
    await vi.advanceTimersByTimeAsync(1100);
    const entries = (net.events[0]?.payload as { entries: { command: { type: string } }[] }).entries;
    expect(entries.map((e) => e.command.type)).toEqual(["setField", "resultReceived"]);

    share.setEnabled(false);
    store.dispatch({ type: "setField", path: "compute.kw_per_rack", value: 125 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(net.events).toHaveLength(2);
    share.dispose();
  });

  test("app errors become error events and API keys are scrubbed from every body", async () => {
    const { store, share, net } = setup();
    store.dispatch({ type: "errorRaised", error: { kind: "worker", message: "rejected key sk-ant-api03-SECRET in request" } });
    await vi.advanceTimersByTimeAsync(1100);
    const bodies = net.calls.map((c) => String(c.init.body));
    expect(bodies.some((b) => b.includes("SECRET"))).toBe(false);
    const error = net.events.find((e) => e.kind === "error");
    expect(error?.payload).toEqual({ source: "app", kind: "worker", message: "rejected key sk-ant-[redacted] in request" });
    share.dispose();
  });

  test("a failed post warns once and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    const { store, share } = setup({ fetch: failing });
    store.dispatch({ type: "loadPlan", plan: plan() });
    await vi.advanceTimersByTimeAsync(1100);
    store.dispatch({ type: "setField", path: "compute.kw_per_rack", value: 120 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(failing).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(store.getState().plan).not.toBeNull();
    share.dispose();
  });

  test("a non-2xx reply counts as a failure too", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const net = recordingFetch(() => Promise.resolve(new Response("nope", { status: 413 })));
    const { store, share } = setup({ fetch: net.impl });
    store.dispatch({ type: "errorRaised", error: { kind: "parse", message: "x" } });
    await vi.advanceTimersByTimeAsync(1100);
    expect(warn).toHaveBeenCalledTimes(1);
    share.dispose();
  });

  test("reports each Copilot turn (user, assistant, tools, usage, error) on turnEnd and on error", async () => {
    const { store, share, net } = setup();
    store.dispatch({ type: "loadPlan", plan: plan() });
    await vi.advanceTimersByTimeAsync(1100);
    net.events.length = 0;

    const listeners = new Set<(event: CopilotEvent | null, snapshot: CopilotSnapshot) => void>();
    const copilot = {
      subscribe: (l: (event: CopilotEvent | null, snapshot: CopilotSnapshot) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    } as unknown as Copilot;
    const detach = share.attachCopilot(copilot);
    const snapshot: CopilotSnapshot = {
      ...emptySnapshot,
      lastUsage: { input_tokens: 10, output_tokens: 5 } as CopilotSnapshot["lastUsage"],
      transcript: {
        droppedTurns: 0,
        messages: [
          { role: "user", content: [{ type: "text", text: `${VIEW_CONTEXT_PREFIX} view json` }, { type: "text", text: "Push density to 130" }] },
          { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "set_control", input: { path: "compute.kw_per_rack", value: 130 } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "DENSITY_EXCEEDS_COOLING" }] },
          { role: "assistant", content: [{ type: "text", text: "Switching to liquid." }] },
        ],
      },
    };
    listeners.forEach((l) => l({ type: "textDelta", text: "x" }, snapshot)); // not a turn boundary
    listeners.forEach((l) => l({ type: "turnEnd" }, snapshot));
    listeners.forEach((l) => l({ type: "error", message: "boom" }, { ...snapshot, error: "boom" }));
    await vi.advanceTimersByTimeAsync(1100);

    expect(net.events.map((e) => e.kind)).toEqual(["copilot_turn", "copilot_turn"]);
    expect(net.events[0]?.payload).toEqual({
      user: "Push density to 130",
      assistant: "Switching to liquid.",
      tools: [{ name: "set_control", input: '{"path":"compute.kw_per_rack","value":130}', isError: true }],
      usage: { input_tokens: 10, output_tokens: 5 },
      error: null,
      notice: null,
    });
    expect(net.events[1]?.payload).toMatchObject({ error: "boom" });

    detach();
    listeners.forEach((l) => l({ type: "turnEnd" }, snapshot));
    await vi.advanceTimersByTimeAsync(1100);
    expect(net.events).toHaveLength(2);
    share.dispose();
  });

  test("flush sends what is queued without waiting for the debounce", async () => {
    const { store, share, net } = setup();
    store.dispatch({ type: "errorRaised", error: { kind: "parse", message: "x" } });
    await share.flush();
    expect(net.events.map((e) => e.kind)).toEqual(["commands", "error"]);
    share.dispose();
  });
});

describe("chunkEntries", () => {
  test("splits a batch so no chunk serializes past the cap; an oversized entry stands alone", () => {
    const entry = (seq: number, path: string) => ({ seq, ts: 0, command: { type: "setField" as const, path, value: 1 }, rejected: null });
    const entries = [entry(1, "a"), entry(2, "b"), entry(3, "c".repeat(300)), entry(4, "d")];
    const chunks = chunkEntries(entries, 200);
    expect(chunks.map((c) => c.length)).toEqual([2, 1, 1]);
    expect(chunkEntries(entries, 1_000_000)).toHaveLength(1);
    expect(chunkEntries([], 10)).toEqual([]);
  });
});

describe("summarizeLastTurn", () => {
  test("an empty transcript summarizes to empty strings", () => {
    expect(summarizeLastTurn(emptySnapshot)).toEqual({ user: "", assistant: "", tools: [], usage: null, error: null, notice: null });
  });

  test("only the last turn is summarized and long tool inputs are cut", () => {
    const long = "x".repeat(1000);
    const snapshot: CopilotSnapshot = {
      ...emptySnapshot,
      transcript: {
        droppedTurns: 0,
        messages: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
          { role: "user", content: "second question" },
          { role: "assistant", content: [{ type: "tool_use", id: "t9", name: "edit_site_plan", input: { patch: long } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "t9", content: "ok" }] },
          { role: "assistant", content: "second answer" },
        ],
      },
    };
    const turn = summarizeLastTurn(snapshot);
    expect(turn.user).toBe("second question");
    expect(turn.assistant).toBe("second answer");
    expect(turn.tools[0]?.name).toBe("edit_site_plan");
    expect(turn.tools[0]?.input.length).toBe(301);
    expect(turn.tools[0]?.isError).toBe(false);
  });
});
