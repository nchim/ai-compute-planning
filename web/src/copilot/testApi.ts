import Anthropic from "@anthropic-ai/sdk";

/**
 * A scripted Anthropic API for tests: the real SDK (streaming parser, tool runner, zod validation)
 * runs against a `fetch` that answers each request with the next scripted assistant message as SSE.
 */
export type ScriptedBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "tool_use"; readonly id: string; readonly name: string; readonly input: unknown };

export interface ScriptedTurn {
  readonly content: readonly ScriptedBlock[];
  readonly stop_reason?: "end_turn" | "tool_use" | "max_tokens";
  readonly cacheRead?: number;
}

export type RequestBody = Anthropic.Beta.Messages.MessageCreateParams;

export interface ScriptedApi {
  readonly client: Anthropic;
  /** Every request body, in order. */
  readonly requests: RequestBody[];
}

export function scriptedApi(turns: readonly ScriptedTurn[], failWith?: { status: number; message: string }): ScriptedApi {
  const requests: RequestBody[] = [];
  const fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push(JSON.parse(String(init?.body)) as RequestBody);
    if (failWith !== undefined) {
      const body = JSON.stringify({ type: "error", error: { type: "api_error", message: failWith.message } });
      return new Response(body, { status: failWith.status, headers: { "content-type": "application/json" } });
    }
    const turn = turns[requests.length - 1];
    if (turn === undefined) throw new Error(`no scripted turn for request #${requests.length}`);
    return new Response(sse(turn), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  const client = new Anthropic({ apiKey: "sk-test", dangerouslyAllowBrowser: true, fetch, maxRetries: 0 });
  return { client, requests };
}

function sse(turn: ScriptedTurn): string {
  const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  const usage = { input_tokens: 50, output_tokens: 1, cache_read_input_tokens: turn.cacheRead ?? 0, cache_creation_input_tokens: 0 };
  const message = { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5", content: [], stop_reason: null, stop_sequence: null, usage };
  let out = ev("message_start", { message });
  turn.content.forEach((b, index) => {
    if (b.type === "text") {
      out += ev("content_block_start", { index, content_block: { type: "text", text: "" } });
      out += ev("content_block_delta", { index, delta: { type: "text_delta", text: b.text } });
    } else {
      out += ev("content_block_start", { index, content_block: { type: "tool_use", id: b.id, name: b.name, input: {} } });
      out += ev("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) } });
    }
    out += ev("content_block_stop", { index });
  });
  const hasTool = turn.content.some((b) => b.type === "tool_use");
  const stop_reason = turn.stop_reason ?? (hasTool ? "tool_use" : "end_turn");
  out += ev("message_delta", { delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 20 } });
  out += ev("message_stop", {});
  return out;
}

/** The last message of a request and its tool_result blocks. */
export function lastToolResults(req: RequestBody): Anthropic.Beta.BetaToolResultBlockParam[] {
  const last = req.messages[req.messages.length - 1];
  if (last === undefined || typeof last.content === "string") return [];
  return last.content.filter((b): b is Anthropic.Beta.BetaToolResultBlockParam => b.type === "tool_result");
}
