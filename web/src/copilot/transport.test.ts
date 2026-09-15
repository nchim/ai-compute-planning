import { describe, expect, test } from "vitest";

import { createClient, RELAY_PLACEHOLDER_KEY, selectTransport } from "./transport";

const ORIGIN = "https://capplanner.example.run.app";

/** Captures what the client would send: the resolved URL and the headers of the first request. */
async function firstRequest(client: ReturnType<typeof createClient>): Promise<{ url: string; headers: Headers }> {
  const seen: Array<{ url: string; headers: Headers }> = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "stub" } }), { status: 500 });
  };
  const probe = client.withOptions({ fetch, maxRetries: 0 });
  await probe.beta.messages.create({ model: "claude-sonnet-5", max_tokens: 1, messages: [] }).catch(() => undefined);
  const first = seen[0];
  if (first === undefined) throw new Error("no request was sent");
  return first;
}

describe("transport selection", () => {
  test("no VITE_COPILOT_RELAY → BYO-key mode", () => {
    expect(selectTransport(undefined, ORIGIN)).toEqual({ mode: "byo-key" });
    expect(selectTransport("", ORIGIN)).toEqual({ mode: "byo-key" });
  });

  test("a relay path resolves to an absolute baseURL on the page origin", () => {
    expect(selectTransport("/api/anthropic", ORIGIN)).toEqual({ mode: "relay", baseURL: `${ORIGIN}/api/anthropic` });
    expect(selectTransport("/api/anthropic/", ORIGIN)).toEqual({ mode: "relay", baseURL: `${ORIGIN}/api/anthropic` });
    expect(selectTransport("https://relay.example/x", ORIGIN)).toEqual({ mode: "relay", baseURL: "https://relay.example/x" });
  });

  test("relay client: requests go to the relay with a placeholder key and no direct-browser-access header", async () => {
    const client = createClient(selectTransport("/api/anthropic", ORIGIN), "sk-ant-should-be-ignored");
    const { url, headers } = await firstRequest(client);
    expect(url).toBe(`${ORIGIN}/api/anthropic/v1/messages?beta=true`);
    expect(headers.get("x-api-key")).toBe(RELAY_PLACEHOLDER_KEY);
    expect(headers.get("anthropic-dangerous-direct-browser-access")).toBeNull();
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
  });

  test("BYO-key client: requests go straight to Anthropic with the pasted key", async () => {
    const client = createClient(selectTransport(undefined, ORIGIN), "sk-ant-dev");
    const { url, headers } = await firstRequest(client);
    expect(url).toBe("https://api.anthropic.com/v1/messages?beta=true");
    expect(headers.get("x-api-key")).toBe("sk-ant-dev");
    expect(headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
  });
});
