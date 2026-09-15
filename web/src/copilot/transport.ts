import Anthropic from "@anthropic-ai/sdk";

/**
 * Where the Copilot's Anthropic calls go.
 *
 * - `relay` (deployed default): the SDK talks to our own server (`deploy/server`), which holds the API
 *   key, gates on the shared password and applies the daily cap. Selected by `VITE_COPILOT_RELAY`
 *   (a path like `/api/anthropic`), resolved against the page origin at build/load time.
 * - `byo-key` (dev default): the developer pastes a key and the browser calls Anthropic directly.
 */
export type Transport =
  | { readonly mode: "relay"; readonly baseURL: string }
  | { readonly mode: "byo-key" };

/** The SDK insists on a key; the relay drops it and injects its own, so any placeholder will do. */
export const RELAY_PLACEHOLDER_KEY = "relay";

export function selectTransport(relay: string | undefined, origin: string): Transport {
  if (relay === undefined || relay === "") return { mode: "byo-key" };
  // The SDK concatenates baseURL + path and hands that to `new URL()`, which throws for a relative
  // baseURL; resolve it against the origin here so the failure is at build config, not first send.
  return { mode: "relay", baseURL: new URL(relay, origin).href.replace(/\/$/, "") };
}

/**
 * Builds the SDK client for a transport. `dangerouslyAllowBrowser` is required in both modes — without
 * it the SDK refuses to construct in a browser at all — but it also makes the SDK send
 * `anthropic-dangerous-direct-browser-access: true`. That header exists to acknowledge a key in the
 * page; in relay mode there is none, so it is removed (a `null` default header deletes it), and the
 * relay's header allow-list drops it regardless.
 */
export function createClient(transport: Transport, apiKey: string): Anthropic {
  if (transport.mode === "relay") {
    return new Anthropic({
      apiKey: RELAY_PLACEHOLDER_KEY,
      baseURL: transport.baseURL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: { "anthropic-dangerous-direct-browser-access": null },
    });
  }
  // ⚠️ DEV ONLY — the key lives in the page. Never build for deployment without VITE_COPILOT_RELAY.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/** The transport this build was configured with. */
export const transport: Transport = selectTransport(import.meta.env.VITE_COPILOT_RELAY, globalThis.location?.origin ?? "http://localhost");
