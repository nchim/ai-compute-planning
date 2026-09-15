import type { CopilotSnapshot, Usage } from "../copilot/client";
import { VIEW_CONTEXT_PREFIX } from "../copilot/context";
import { isTurnStart, type Message } from "../copilot/history";

/** What the developer sees of one Copilot turn: enough to follow the conversation, never the raw API messages. */
export interface TurnSummary {
  readonly user: string;
  readonly assistant: string;
  readonly tools: readonly ToolCallSummary[];
  readonly usage: Usage | null;
  readonly error: string | null;
  readonly notice: string | null;
}

export interface ToolCallSummary {
  readonly name: string;
  /** JSON of the input, cut to `MAX_INPUT_CHARS`. */
  readonly input: string;
  readonly isError: boolean;
}

const MAX_INPUT_CHARS = 300;

/** Summarizes the last turn in the snapshot's transcript (the one that just ended). */
export function summarizeLastTurn(snapshot: CopilotSnapshot): TurnSummary {
  const messages = snapshot.transcript.messages;
  let start = messages.length - 1;
  while (start >= 0 && !isTurnStart(messages[start]!)) start--;
  const turn = start < 0 ? [] : messages.slice(start);
  const results = new Map<string, boolean>();
  for (const m of turn) {
    for (const b of blocksOf(m)) if (b.type === "tool_result") results.set(b.tool_use_id, b.is_error === true);
  }
  const tools: ToolCallSummary[] = [];
  const assistant: string[] = [];
  const user: string[] = [];
  for (const m of turn) {
    for (const b of blocksOf(m)) {
      if (b.type === "text") {
        if (m.role === "user" && !b.text.startsWith(VIEW_CONTEXT_PREFIX)) user.push(b.text);
        if (m.role === "assistant") assistant.push(b.text);
      } else if (b.type === "tool_use") {
        tools.push({ name: b.name, input: truncate(JSON.stringify(b.input) ?? "", MAX_INPUT_CHARS), isError: results.get(b.id) ?? false });
      }
    }
  }
  return { user: user.join("\n"), assistant: assistant.join("\n"), tools, usage: snapshot.lastUsage, error: snapshot.error, notice: snapshot.notice };
}

function blocksOf(m: Message) {
  return typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
