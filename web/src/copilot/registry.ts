import type { Copilot } from "./client";

/**
 * The harness seam (WS9 attaches `sendCopilot` to `window.__harness`). The rail registers the live
 * Copilot on mount and clears it on unmount; this is a wiring handle, not application state — the
 * transcript and plan live in the Copilot/store, never here.
 */
let active: Copilot | null = null;

export function registerCopilot(copilot: Copilot | null): void {
  active = copilot;
}

export function sendCopilot(text: string): Promise<void> {
  if (active === null) {
    return Promise.reject(new Error("the Copilot is not available: mount the rail and set an API key first"));
  }
  return active.send(text);
}
