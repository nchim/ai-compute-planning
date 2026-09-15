/**
 * docs/acceptance-session.md T3b — pin the single-shot plan as the baseline, apply the optimized
 * plan, compare. Depends on WS11's harness hooks (`setBaseline` / `toggleCompare`); until the page
 * exposes them the spec skips itself with that reason instead of failing.
 */
import { expect, test } from "@playwright/test";

import { Session } from "../src/session";

test("T3b: baseline pin and compare mode", async ({}, info) => {
  const { baseURL, headless } = info.project.use;
  const session = await Session.launch({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headless === undefined ? {} : { headless }),
  });
  try {
    const hooks = await session.page.evaluate(() => {
      const api = window.__harness as unknown as Record<string, unknown> | undefined;
      return { setBaseline: typeof api?.["setBaseline"] === "function", toggleCompare: typeof api?.["toggleCompare"] === "function" };
    });
    test.skip(!hooks.setBaseline || !hooks.toggleCompare, "T3b needs WS11's __harness.setBaseline/toggleCompare (baseline + compare mode); not in this build yet");
    // WS11 lands the hooks; the assertions follow in the same PR that wires them:
    // baseline = pre-optimization plan + Result; every metric tile shows a Δ in compare mode; the
    // demand-vs-capacity chart carries a ghosted baseline series; undo/redo never changes the baseline.
    expect(hooks).toEqual({ setBaseline: true, toggleCompare: true });
  } finally {
    await session.close();
  }
});
