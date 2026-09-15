# Harness — driving the running SPA from a Claude Code session

Playwright (headless Chromium) against the Vite dev server, talking to the app **only** through
`window.__harness`, which itself only dispatches command-bus commands. Nothing here bypasses the code a
human or the Copilot exercises.

## Commands

| What | Command (from repo root unless noted) |
|---|---|
| Everything (typecheck + all specs) | `make harness` |
| Smoke only | `cd harness && npm run smoke` |
| All specs | `cd harness && npm test` |
| Watch the browser | `cd harness && npx playwright test --headed` (or `HEADED=1` for a `Session` launched from your own script) |
| One spec, verbose | `cd harness && npx playwright test tests/smoke.spec.ts --reporter=list` |
| Typecheck | `cd harness && npm run typecheck` |
| First-time setup | `cd harness && npm ci && npx playwright install chromium` (CI adds `--with-deps`) |

`npm test` starts `npm run dev -- --port 5173` in `web/` for you (`playwright.config.ts` → `webServer`)
with `VITE_HARNESS=1`; locally an already-running server on that port is reused. Run `make wasm` first
to drive the real engine (see env vars).

## Environment variables

| Var | Effect |
|---|---|
| `VITE_ENGINE` | Passed to the dev server. Default: `wasm` if `web/public/engine.wasm` exists (`make wasm`), else `fake`. Force `fake` to test the UI without the engine. |
| `HARNESS_BASE_URL` | Where the SPA is (default `http://localhost:5173`); the web server is still started on 5173. |
| `HEADED=1` | `Session.launch()` opens a visible browser (specs use Playwright's `--headed` instead). |
| `CI` | Never reuses a running server; adds the GitHub reporter. |

## Where artifacts land

Each `Session` writes to `harness/runs/<ISO timestamp>/` (gitignored; WS10 force-adds one reviewed run):

```
runs/2026-09-15T17-07-39-547Z/
  01-load-fixture/        one directory per session.step(name, fn)
    screenshot.png        full page after the step
    plan.json             SitePlan protojson (null before a plan is loaded)
    result.json           Result protojson (null until the first analyze)
    command-log.json      the whole command log so far (seq, ts, command, rejected)
    console-errors.json   { page: [...__harness.getConsoleErrors()], playwright: [console.error text], uncaught: [page errors] }
  02-set-depreciation/
  final.png               session.screenshot("final")
```

Playwright's own `test-results/` holds its failure context; it is gitignored too.

## Driving it from a Claude Code session

The intended loop: write or edit a spec (or a one-off script) that uses `Session`, run it with Bash,
then read the artifacts to debug — the command log tells you exactly what the bus did, `result.json`
what the engine said, `console-errors.json` what the page complained about.

```ts
import { Session } from "../src/session";

const s = await Session.launch({ baseURL: "http://localhost:5173" });   // waits for window.__harness
try {
  await s.step("load", async (s) => {
    await s.loadPlan(fixtureProtojson);   // rejects on malformed protojson
    await s.waitIdle();                   // rejects on engine error or after 10 s
  });
  await s.step("what-if", async (s) => {
    await s.setControl("revenue.compute.utilization_pct", 65);  // rejects with the reducer's message on a bad path/value
    await s.waitIdle();
    const result = JSON.parse((await s.getResult())!);
  });
  await s.undo();                          // rejects "nothing to undo" when history is empty
  console.log(await s.listControls());     // every settable path with type, options (enums) and current value
} finally {
  await s.close();                         // throws if the page raised an uncaught error nobody attributed to a step
}
```

`Session` methods mirror `window.__harness` one-to-one (`loadPlan`, `getPlan`, `getResult`, `setControl`,
`listControls`, `sendCopilot`, `acceptCard`, `rejectCard`, `undo`, `redo`, `getViewContext`,
`getCommandLog`, `waitIdle`, `getConsoleErrors`) plus `screenshot(name)`, `step(name, fn)` and `close()`.
Plans and Results come back as protojson strings with proto (snake_case) field names, so keys line up with bus paths. Every call is a Promise that rejects with the in-page error message; a step fails if its function threw
**or** if the page raised an uncaught error while it ran. The contract lives in
`web/src/harness/api.ts` and is imported by both sides.

`sendCopilot(text)` resolves when the Copilot turn ends and rejects with "Copilot not installed" until
WS8 registers one in the page via `window.__harness.setCopilot(fn)`.

For quick pokes without a spec, the same API is reachable from any Playwright REPL or from the browser
devtools console on a dev build: `await __harness.listControls()`.

## Acceptance session (WS10)

`docs/acceptance-session.md` T1–T7 is meant to be written as steps over one `Session`:
`session.step("T1 orientation", …)` … `session.step("T7 summary", …)`, with `scripted` mode issuing the
same `setControl`/`acceptCard` calls the Copilot would and `live` mode going through `sendCopilot`.
