import { toJson, type JsonValue } from "@bufbuild/protobuf";

import { commandToJson, type LogEntry, type Store } from "../bus";
import type { Copilot } from "../copilot/client";
import { DiagnosticSchema, Status, SummaryMetricsSchema, type Result } from "../gen/capplanner/v1/engine_pb";
import { summarizeLastTurn } from "./turn";

/**
 * Opt-in session sharing. When enabled, what the tester does is posted to the deployment's
 * `POST /api/session` (deploy/server/session.go), one event per request, and ends up in Cloud Logging
 * for the developer (deploy/sessions.py). Sent: command-log batches, a summary of each Copilot turn,
 * each Result's summary + diagnostics, and app/page errors. Never sent: the API key or anything from
 * the key panel; every body is also scrubbed of `sk-ant-` tokens. A failed post can never break the
 * app: it is reported once with console.warn and otherwise ignored.
 */
export interface SessionShareOptions {
  readonly store: Store;
  readonly enabled: boolean;
  readonly sessionId: string;
  readonly endpoint?: string;
  /** Test seams. */
  readonly fetch?: typeof fetch;
  readonly debounceMs?: number;
}

export interface SessionShare {
  isEnabled(): boolean;
  setEnabled(on: boolean): void;
  /** Reports each finished Copilot turn until the returned function is called. */
  attachCopilot(copilot: Copilot): () => void;
  /** Sends everything queued now (also called on `pagehide`). */
  flush(): Promise<void>;
  dispose(): void;
}

export type EventKind = "commands" | "copilot_turn" | "result" | "error";

export interface SessionEvent {
  readonly session_id: string;
  readonly plan_id: string;
  readonly kind: EventKind;
  readonly seq: number;
  readonly payload: JsonValue;
}

export const DEFAULT_ENDPOINT = "/api/session";
/** Under the server's 256 KB cap with room for the envelope. */
const MAX_BODY_BYTES = 200_000;
const API_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]*/g;
const jsonOptions = { useProtoFieldName: true } as const;

export function createSessionShare(options: SessionShareOptions): SessionShare {
  const { store, sessionId, endpoint = DEFAULT_ENDPOINT, debounceMs = 1000 } = options;
  const post = options.fetch ?? ((input, init) => fetch(input, init));
  let enabled = options.enabled;
  let sentEntries = 0; // command-log entries already queued
  let seq = 0;
  let queue: SessionEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let warned = false;
  let disposed = false;

  const planId = () => store.getState().plan?.meta?.planId ?? "";

  const schedule = () => {
    if (!enabled || disposed) return;
    timer ??= setTimeout(() => void flush(), debounceMs);
  };

  const enqueue = (kind: EventKind, payload: JsonValue) => {
    if (!enabled || disposed) return;
    queue.push({ session_id: sessionId, plan_id: planId(), kind, seq: ++seq, payload });
    schedule();
  };

  const send = async (event: SessionEvent) => {
    let body = JSON.stringify(event).replace(API_KEY_PATTERN, "sk-ant-[redacted]");
    if (body.length > MAX_BODY_BYTES) {
      // Never drop silently: the developer sees that something was here and how big it was.
      body = JSON.stringify({ ...event, payload: { truncated: true, bytes: body.length } });
    }
    try {
      const res = await post(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (!warned) console.warn("session sharing: could not post an event; further failures are silent", err);
      warned = true;
    }
  };

  /**
   * New command-log entries become one `commands` batch (chunked to fit) plus derived result/error
   * events. Called at flush time, not per dispatch, so a burst of edits and the Result they produce
   * travel together.
   */
  const drainLog = () => {
    const log = store.getLog();
    if (!enabled || log.length <= sentEntries) return;
    const fresh = log.slice(sentEntries);
    sentEntries = log.length;
    for (const chunk of chunkEntries(fresh)) enqueue("commands", { entries: chunk });
    // Only the newest Result matters (earlier ones in the batch were superseded); every error does.
    let lastResult: Result | null = null;
    for (const e of fresh) {
      if (e.command.type === "resultReceived") lastResult = e.command.result;
      if (e.command.type === "errorRaised") enqueue("error", { source: "app", kind: e.command.error.kind, message: e.command.error.message });
    }
    if (lastResult !== null) enqueue("result", resultToJson(lastResult));
  };

  const sendQueued = async () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    drainLog();
    const batch = queue;
    queue = [];
    for (const event of batch) await send(event);
  };
  // Flushes are chained so events reach the server in seq order even when a pagehide flush overlaps a timer flush.
  let chain = Promise.resolve();
  const flush = () => (chain = chain.then(sendQueued));

  const onPageError = (e: ErrorEvent) => enqueue("error", { source: "page", kind: "uncaught", message: e.message });
  const onRejection = (e: PromiseRejectionEvent) => enqueue("error", { source: "page", kind: "unhandledrejection", message: describe(e.reason) });
  const onPageHide = () => void flush();

  const unsubscribe = store.subscribe(schedule);
  const page = typeof window === "undefined" ? null : window;
  page?.addEventListener("error", onPageError);
  page?.addEventListener("unhandledrejection", onRejection);
  page?.addEventListener("pagehide", onPageHide);

  return {
    isEnabled: () => enabled,
    setEnabled(on) {
      enabled = on;
      // Entries logged while sharing was off are not sent retroactively.
      sentEntries = store.getLog().length;
      if (!on) queue = [];
    },
    attachCopilot(copilot) {
      return copilot.subscribe((event, snapshot) => {
        if (event?.type === "turnEnd" || event?.type === "error") enqueue("copilot_turn", summarizeLastTurn(snapshot) as unknown as JsonValue);
      });
    },
    flush,
    dispose() {
      disposed = true;
      unsubscribe();
      page?.removeEventListener("error", onPageError);
      page?.removeEventListener("unhandledrejection", onRejection);
      page?.removeEventListener("pagehide", onPageHide);
      if (timer !== null) clearTimeout(timer);
      queue = [];
    },
  };
}

/** Command-log entries as JSON; a `resultReceived` carries only the status (the `result` event has the rest). */
export function entryToJson(e: LogEntry): JsonValue {
  const command = e.command.type === "resultReceived" ? { type: e.command.type, status: Status[e.command.result.status] } : commandToJson(e.command);
  return { seq: e.seq, ts: e.ts, command, rejected: e.rejected === null ? null : { ...e.rejected } };
}

/** Groups entries so no chunk serializes past the body cap (a single oversized entry is its own chunk). */
export function chunkEntries(entries: readonly LogEntry[], maxBytes = MAX_BODY_BYTES): JsonValue[][] {
  const chunks: JsonValue[][] = [];
  let current: JsonValue[] = [];
  let size = 0;
  for (const e of entries) {
    const json = entryToJson(e);
    const bytes = JSON.stringify(json).length;
    if (current.length > 0 && size + bytes > maxBytes) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(json);
    size += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function resultToJson(result: Result): JsonValue {
  return {
    status: Status[result.status],
    summary: result.summary === undefined ? null : toJson(SummaryMetricsSchema, result.summary, jsonOptions),
    diagnostics: result.diagnostics.map((d) => toJson(DiagnosticSchema, d, jsonOptions)),
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
