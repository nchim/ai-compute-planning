import Anthropic from "@anthropic-ai/sdk";
import type { BetaToolRunner } from "@anthropic-ai/sdk/lib/tools/BetaToolRunner";

import type { Store } from "../bus";
import type { Engine } from "../engine";
import type { SitePlan } from "../gen/capplanner/v1/engine_pb";
import type { SendOptions } from "../harness/api";
import { createAnalysisTracker } from "./analysis";
import { viewContextBlock } from "./context";
import { clearTranscript, emptyTranscript, loadTranscript, safeStorage, saveTranscript, type Message, type Transcript } from "./history";
import { SYSTEM_PROMPT } from "./prompt";
import { createTools, type ToolEvent } from "./tools";
import { createClient, transport } from "./transport";

export type Usage = Anthropic.Beta.BetaUsage;

export interface CopilotOptions {
  readonly store: Store;
  readonly engine: Engine;
  /** The pasted key in BYO-key mode; ignored in relay mode (see transport.ts). */
  readonly apiKey: string;
  readonly model?: string;
  /** Called with every assistant message's usage; the dev UI shows cache_read_input_tokens. */
  readonly onUsage?: (usage: Usage) => void;
  /** Test seam: a pre-built client (e.g. with a scripted `fetch`). */
  readonly client?: Anthropic;
  /** Where transcripts persist; defaults to localStorage, `null` disables persistence. */
  readonly storage?: Storage | null;
  readonly maxIterations?: number;
}

export interface CopilotSnapshot {
  readonly transcript: Transcript;
  readonly running: boolean;
  /** Text of the assistant message currently streaming. */
  readonly streamingText: string;
  /** Latest status per tool call id, this session. */
  readonly toolEvents: readonly ToolEvent[];
  readonly error: string | null;
  readonly notice: string | null;
  readonly lastUsage: Usage | null;
  /** What the Copilot is doing right now, so the UI can show progress before any text arrives. */
  readonly activity: Activity;
}

export type Activity =
  | { readonly kind: "idle" }
  | { readonly kind: "thinking" }
  | { readonly kind: "writing" }
  | { readonly kind: "tool"; readonly name: string };

export type CopilotEvent =
  | { readonly type: "textDelta"; readonly text: string }
  | { readonly type: "tool"; readonly event: ToolEvent }
  | { readonly type: "usage"; readonly usage: Usage }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "turnEnd" };

export interface Copilot {
  /** Runs one turn — all tool rounds — and resolves when it ends. Rejects on API failure or misuse. */
  send(text: string, options?: SendOptions): Promise<void>;
  abort(): void;
  /** Forgets the current plan's conversation (in memory and in storage). Rejects while a turn runs. */
  clear(): void;
  subscribe(listener: (event: CopilotEvent | null, snapshot: CopilotSnapshot) => void): () => void;
  getSnapshot(): CopilotSnapshot;
  dispose(): void;
}

export const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 32_000;

export const emptySnapshot: CopilotSnapshot = {
  transcript: emptyTranscript,
  running: false,
  streamingText: "",
  toolEvents: [],
  error: null,
  notice: null,
  lastUsage: null,
  activity: { kind: "idle" },
};

export function createCopilot(options: CopilotOptions): Copilot {
  const { store, engine, model = DEFAULT_MODEL, maxIterations = 16 } = options;
  const client = options.client ?? createClient(transport, options.apiKey);
  const storage = options.storage === undefined ? safeStorage("local") : options.storage;
  const tracker = createAnalysisTracker(store, engine);
  const listeners = new Set<(event: CopilotEvent | null, snapshot: CopilotSnapshot) => void>();
  let snapshot = emptySnapshot;
  let loadedPlanId: string | null = null;
  let controller: AbortController | null = null;

  const update = (patch: Partial<CopilotSnapshot>, event: CopilotEvent | null = null) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l(event, snapshot));
  };

  const onTool = (event: ToolEvent) => {
    const rest = snapshot.toolEvents.filter((e) => e.id !== event.id);
    // A finished tool hands control back to the model, which thinks before its next block.
    const activity: Activity = event.status === "running" ? { kind: "tool", name: event.name } : { kind: "thinking" };
    update({ toolEvents: [...rest, event], activity }, { type: "tool", event });
  };

  const tools = createTools({ store, engine, tracker, onEvent: onTool });

  const planIdOf = (plan: SitePlan | null): string | null => (plan === null ? null : (plan.meta?.planId ?? "unnamed-plan"));

  const currentPlanId = (): string => {
    const id = planIdOf(store.getState().plan);
    if (id === null) throw new Error("no plan is loaded");
    return id;
  };

  /** Restores the transcript for a plan the first time it is seen (on load and whenever the plan changes). */
  const syncTranscript = (planId: string | null) => {
    if (planId === null || planId === loadedPlanId || snapshot.running) return;
    const loaded = loadTranscript(storage, planId);
    loadedPlanId = planId;
    update({ transcript: loaded.transcript, notice: loaded.warning, toolEvents: [] });
  };
  syncTranscript(planIdOf(store.getState().plan));
  const unsubscribe = store.subscribe(() => syncTranscript(planIdOf(store.getState().plan)));

  const commit = (planId: string, messages: readonly Message[]) => {
    const saved = saveTranscript(storage, planId, { messages: dropDangling(messages), droppedTurns: snapshot.transcript.droppedTurns });
    update({ transcript: saved.transcript, notice: saved.warning ?? snapshot.notice });
  };

  const consume = async (runner: BetaToolRunner<true>) => {
    for await (const stream of runner) {
      stream.on("text", (delta) =>
        update({ streamingText: snapshot.streamingText + delta, activity: { kind: "writing" } }, { type: "textDelta", text: delta }),
      );
      stream.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start" && ev.content_block.type === "tool_use") {
          onTool({ id: ev.content_block.id, name: ev.content_block.name, status: "running", detail: "" });
        }
      });
      const message = await stream.finalMessage();
      options.onUsage?.(message.usage);
      update(
        {
          streamingText: "",
          activity: { kind: "thinking" },
          lastUsage: message.usage,
          transcript: { ...snapshot.transcript, messages: [...runner.params.messages, { role: "assistant", content: message.content }] },
        },
        { type: "usage", usage: message.usage },
      );
      if (message.stop_reason === "max_tokens") update({ notice: "The reply was cut off at the token limit." });
      if (message.stop_reason === "refusal") update({ error: "The model declined this request." });
    }
  };

  const send = async (text: string, options: SendOptions = {}): Promise<void> => {
    const prompt = text.trim();
    if (prompt === "") throw new Error("message is empty");
    if (snapshot.running) throw new Error("the Copilot is still working on the previous turn");
    const planId = currentPlanId();
    syncTranscript(planId);
    controller = new AbortController();
    const userMessage: Message = {
      role: "user",
      content: [
        { type: "text", text: viewContextBlock(store.getState()) },
        { type: "text", text: prompt },
      ],
    };
    const messages = [...snapshot.transcript.messages, userMessage];
    update({ running: true, streamingText: "", error: null, activity: { kind: "thinking" }, transcript: { ...snapshot.transcript, messages } });

    const params = {
      model,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } }],
      thinking: { type: "adaptive" as const },
      ...(options.effort === undefined ? {} : { output_config: { effort: options.effort } }),
      tools,
      messages,
      stream: true as const,
      max_iterations: maxIterations,
    };
    let runner = client.beta.messages.toolRunner(params, { signal: controller.signal });
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await consume(runner);
          break;
        } catch (err) {
          // Eager input streaming can hand the SDK unparseable tool JSON; that rejects the iteration
          // without a tool_use id to answer, so the turn is re-issued once. API errors are not retried.
          if (attempt >= 1 || err instanceof Anthropic.APIError || controller.signal.aborted) throw err;
          runner = client.beta.messages.toolRunner({ ...runner.params }, { signal: controller.signal });
        }
      }
      commit(planId, runner.params.messages);
      update({ running: false, activity: { kind: "idle" } }, { type: "turnEnd" });
    } catch (err) {
      commit(planId, runner.params.messages);
      if (err instanceof Anthropic.APIUserAbortError || controller.signal.aborted) {
        update({ running: false, streamingText: "", activity: { kind: "idle" }, notice: "Stopped." }, { type: "turnEnd" });
        return;
      }
      const message = describe(err);
      update({ running: false, streamingText: "", activity: { kind: "idle" }, error: message }, { type: "error", message });
      throw err;
    } finally {
      controller = null;
    }
  };

  const clear = () => {
    if (snapshot.running) throw new Error("the Copilot is still working; stop it before clearing");
    const planId = planIdOf(store.getState().plan);
    const warning = planId === null ? null : clearTranscript(storage, planId);
    update({ transcript: emptyTranscript, toolEvents: [], streamingText: "", error: null, notice: warning ?? "Conversation cleared." });
  };

  return {
    send,
    abort: () => controller?.abort(),
    clear,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    dispose() {
      controller?.abort();
      unsubscribe();
      tracker.dispose();
      listeners.clear();
    },
  };
}

/** An assistant turn whose tool calls were never answered cannot be replayed; drop it. */
function dropDangling(messages: readonly Message[]): readonly Message[] {
  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && typeof last.content !== "string" && last.content.some((b) => b.type === "tool_use")) {
    return messages.slice(0, -1);
  }
  return messages;
}

function describe(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return transport.mode === "relay" ? "The relay rejected this session (401); reload and sign in again." : "Anthropic rejected the API key (401).";
  }
  if (err instanceof Anthropic.RateLimitError) {
    // The relay's daily cap answers in the same envelope, with the reason in the message.
    return `Rate limited (429): ${err.message}`;
  }
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
