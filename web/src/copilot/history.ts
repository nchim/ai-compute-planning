import type Anthropic from "@anthropic-ai/sdk";

export type Message = Anthropic.Beta.BetaMessageParam;

export interface Transcript {
  /** The full API `messages` array, tool blocks included, so the loop replays exactly. */
  readonly messages: readonly Message[];
  /** Turns dropped from the front to stay under the size cap — shown to the user, never silent. */
  readonly droppedTurns: number;
}

export const emptyTranscript: Transcript = { messages: [], droppedTurns: 0 };

/** localStorage budget per plan; a turn with a big tool result is ~10–20 KB. */
export const DEFAULT_MAX_BYTES = 400_000;

const VERSION = 1;

export function historyKey(planId: string): string {
  return `copilot.history.${VERSION}.${planId}`;
}

/** Storage can be absent or throw on access (private windows, blocked site data) — then `null`. */
export function safeStorage(kind: "local" | "session"): Storage | null {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    const probe = "__copilot_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export interface Loaded {
  readonly transcript: Transcript;
  /** Why a stored transcript could not be used, for the UI; `null` when there was none or it loaded. */
  readonly warning: string | null;
}

export function loadTranscript(storage: Storage | null, planId: string): Loaded {
  if (storage === null) return { transcript: emptyTranscript, warning: "browser storage is unavailable; the transcript will not persist" };
  let raw: string | null;
  try {
    raw = storage.getItem(historyKey(planId));
  } catch (err) {
    return { transcript: emptyTranscript, warning: `could not read stored transcript: ${describe(err)}` };
  }
  if (raw === null) return { transcript: emptyTranscript, warning: null };
  try {
    return { transcript: parseTranscript(raw), warning: null };
  } catch (err) {
    return { transcript: emptyTranscript, warning: `stored transcript was unreadable and ignored: ${describe(err)}` };
  }
}

/** Trims to the cap, saves, and returns what was saved; a failed write is reported, not thrown. */
export function saveTranscript(
  storage: Storage | null,
  planId: string,
  transcript: Transcript,
  maxBytes = DEFAULT_MAX_BYTES,
): { transcript: Transcript; warning: string | null } {
  const trimmed = trimTranscript(transcript, maxBytes);
  if (storage === null) return { transcript: trimmed, warning: null };
  try {
    storage.setItem(historyKey(planId), serialize(trimmed));
    return { transcript: trimmed, warning: null };
  } catch (err) {
    return { transcript: trimmed, warning: `could not save transcript: ${describe(err)}` };
  }
}

/** A turn starts at a user message that is not just tool results. */
export function isTurnStart(m: Message): boolean {
  if (m.role !== "user") return false;
  if (typeof m.content === "string") return true;
  return m.content.some((b) => b.type !== "tool_result");
}

/** Drops whole turns from the front until the serialized size fits (the last turn is always kept). */
export function trimTranscript(t: Transcript, maxBytes: number): Transcript {
  let messages = t.messages;
  let dropped = t.droppedTurns;
  while (byteLength(serialize({ messages, droppedTurns: dropped })) > maxBytes) {
    const next = messages.findIndex((m, i) => i > 0 && isTurnStart(m));
    if (next < 0) break;
    messages = messages.slice(next);
    dropped += 1;
  }
  return messages === t.messages ? t : { messages, droppedTurns: dropped };
}

function serialize(t: Transcript): string {
  return JSON.stringify({ version: VERSION, messages: t.messages, droppedTurns: t.droppedTurns });
}

function parseTranscript(raw: string): Transcript {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
  const { version, messages, droppedTurns } = parsed as Record<string, unknown>;
  if (version !== VERSION) throw new Error(`version ${String(version)} != ${VERSION}`);
  if (!Array.isArray(messages) || !messages.every(isMessage)) throw new Error("messages malformed");
  if (typeof droppedTurns !== "number") throw new Error("droppedTurns malformed");
  return { messages: messages as Message[], droppedTurns };
}

function isMessage(m: unknown): boolean {
  if (typeof m !== "object" || m === null) return false;
  const { role, content } = m as Record<string, unknown>;
  return (role === "user" || role === "assistant") && (typeof content === "string" || Array.isArray(content));
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
