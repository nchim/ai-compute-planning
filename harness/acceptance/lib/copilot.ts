/** Live-mode plumbing: the API key (never archived), the Copilot turn driver and the transcript. */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { Json, Session } from "../../src/session";
import { parseResult, type Result } from "./result";

/** Where the BYO-key panel keeps the key (mirrors `KEY_STORAGE` in web/src/copilot/CopilotRail.tsx). */
export const KEY_STORAGE = "copilot.apiKey";
/** The key panel — masked on every screenshot. */
export const KEY_PANEL_SELECTOR = ".copilot-key";
const KEY_FILE = path.join(homedir(), ".config", "capplanner", "anthropic_key");

/** `ANTHROPIC_API_KEY`, else the contents of `~/.config/capplanner/anthropic_key`. Never log the result. */
export function loadApiKey(): string {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  let raw: string;
  try {
    raw = readFileSync(KEY_FILE, "utf8");
  } catch (err) {
    throw new Error(`live mode needs ANTHROPIC_API_KEY or ${KEY_FILE}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const key = raw.trim();
  if (key === "") throw new Error(`${KEY_FILE} is empty`);
  return key;
}

/** Seeds sessionStorage before the app loads, exactly as pasting the key into the panel would. */
export function keyInitScript(key: string): string {
  return `sessionStorage.setItem(${JSON.stringify(KEY_STORAGE)}, ${JSON.stringify(key)});`;
}

// ---- the transcript as the page exposes it (Anthropic message params) --------------------------

interface TextBlock {
  readonly type: "text";
  readonly text: string;
}
interface ToolUseBlock {
  readonly type: "tool_use";
  readonly id: string;
  readonly name: string;
  readonly input: Json;
}
interface ToolResultBlock {
  readonly type: "tool_result";
  readonly tool_use_id: string;
  readonly content?: string | readonly { readonly type: string; readonly text?: string }[];
  readonly is_error?: boolean;
}
type Block = TextBlock | ToolUseBlock | ToolResultBlock | { readonly type: string };

interface Message {
  readonly role: "user" | "assistant";
  readonly content: string | readonly Block[];
}

export interface Usage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number | null;
  readonly cache_creation_input_tokens?: number | null;
}

interface Snapshot {
  readonly messages: readonly Message[];
  readonly lastUsage: Usage | null;
  readonly running: boolean;
  readonly error: string | null;
}

export interface ToolCall {
  readonly name: string;
  readonly input: Json;
  /** The tool's JSON output, parsed; `null` when it was an error or not JSON. */
  readonly output: Json | null;
  readonly isError: boolean;
}

export interface Turn {
  readonly prompt: string;
  /** Everything the assistant said this turn, across tool rounds and card follow-ups. */
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: Usage | null;
  /** The Result after each accept/undo card the harness accepted during the turn, in order. */
  readonly resultsAfterCards: readonly Result[];
  /** Messages in the transcript when the turn ended. */
  readonly messageCount: number;
}

export async function copilotSnapshot(s: Session): Promise<Snapshot> {
  return (await s.getCopilotSnapshot()) as unknown as Snapshot;
}

const acceptedFollowUp = "Accepted — go on.";
const maxCardsPerTurn = 3;

/**
 * One human turn: send the prompt, then play the human on any accept/undo card the Copilot opened —
 * accept it, let the engine re-analyze and tell the Copilot so it sees the new Result and continues.
 */
export async function copilotTurn(s: Session, prompt: string): Promise<Turn> {
  const before = (await copilotSnapshot(s)).messages.length;
  await s.sendCopilot(prompt);
  const resultsAfterCards: Result[] = [];
  for (let i = 0; i < maxCardsPerTurn && (await acceptPendingCard(s)); i++) {
    await s.waitIdle();
    resultsAfterCards.push(parseResult(await s.getResult()));
    await s.sendCopilot(acceptedFollowUp);
  }
  const snap = await copilotSnapshot(s);
  if (snap.error !== null) throw new Error(`Copilot error: ${snap.error}`);
  const messages = snap.messages.slice(before);
  return {
    prompt,
    text: assistantText(messages),
    toolCalls: toolCalls(messages),
    usage: snap.lastUsage,
    resultsAfterCards,
    messageCount: snap.messages.length,
  };
}

/** True when a pending card was accepted; false when there was none. Anything else is an error. */
async function acceptPendingCard(s: Session): Promise<boolean> {
  try {
    await s.acceptCard();
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no pending proposal")) return false;
    throw err;
  }
}

function blocksOf(m: Message): readonly Block[] {
  return typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
}

function assistantText(messages: readonly Message[]): string {
  return messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => blocksOf(m).flatMap((b) => (b.type === "text" ? [(b as TextBlock).text] : [])))
    .join("\n\n");
}

function toolCalls(messages: readonly Message[]): ToolCall[] {
  const results = new Map<string, ToolResultBlock>();
  for (const m of messages) {
    for (const b of blocksOf(m)) if (b.type === "tool_result") results.set((b as ToolResultBlock).tool_use_id, b as ToolResultBlock);
  }
  return messages.flatMap((m) =>
    blocksOf(m).flatMap((b) => {
      if (b.type !== "tool_use") return [];
      const use = b as ToolUseBlock;
      const r = results.get(use.id);
      return [{ name: use.name, input: use.input, output: r === undefined ? null : parseOutput(r), isError: r?.is_error === true }];
    }),
  );
}

function parseOutput(r: ToolResultBlock): Json | null {
  if (r.is_error === true) return null;
  const text = typeof r.content === "string" ? r.content : (r.content ?? []).map((c) => c.text ?? "").join("");
  try {
    return JSON.parse(text) as Json;
  } catch {
    return null;
  }
}

/** Human-readable record of a turn for the archived run (tool inputs shortened, outputs omitted). */
export function turnMarkdown(label: string, turn: Turn): string {
  const tools = turn.toolCalls.map((c) => `- \`${c.name}\`${c.isError ? " (error)" : ""}: ${truncate(JSON.stringify(c.input), 300)}`);
  const usage = turn.usage === null ? "n/a" : `in ${turn.usage.input_tokens ?? 0} · cache read ${turn.usage.cache_read_input_tokens ?? 0} · out ${turn.usage.output_tokens ?? 0}`;
  return [`## ${label}`, "", `**H:** ${turn.prompt}`, "", `**Tools:**`, ...(tools.length === 0 ? ["- (none)"] : tools), "", `**C:**`, "", turn.text, "", `_usage: ${usage}_`, ""].join("\n");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
