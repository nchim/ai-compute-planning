/** Browser-storage helpers for session sharing: the per-page-load session id and the persisted toggle. */

export const SESSION_ID_KEY = "share.sessionId";
export const PREFERENCE_KEY = "share.session";

/** A random id per page load, kept in sessionStorage so a reload starts a new session. */
export function sessionIdFor(storage: Storage | null): string {
  try {
    const existing = storage?.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const fresh = randomId();
    storage?.setItem(SESSION_ID_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

export function loadSharePreference(storage: Storage | null, fallback: boolean): boolean {
  try {
    const raw = storage?.getItem(PREFERENCE_KEY);
    return raw === null || raw === undefined ? fallback : raw === "true";
  } catch {
    return fallback;
  }
}

export function saveSharePreference(storage: Storage | null, on: boolean): void {
  try {
    storage?.setItem(PREFERENCE_KEY, String(on));
  } catch {
    // Storage can be blocked; the toggle still works for this page load.
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}
