# Harness — driving the running SPA from a Claude Code session

Playwright (headless Chromium) against the Vite dev server, talking to the app **only** through
`window.__harness`, which itself only dispatches command-bus commands. Nothing here bypasses the code a
human or the Copilot exercises.

## Commands

| What | Command (from repo root unless noted) |
|---|---|
| Typecheck + smoke | `make harness` |
| Acceptance session, scripted (the CI gate) | `make acceptance` (= `cd harness && npm run acceptance`) |
| Acceptance session, live Copilot (manual; needs a key, records a video) | `cd harness && npm run acceptance:live` |
| Smoke only | `cd harness && npm run smoke` |
| All specs (smoke + scripted acceptance) | `cd harness && npm test` |
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
| `COPILOT_MODE` | `scripted` (default) or `live` — see "Acceptance session". |
| `HARNESS_VIDEO=1` | `Session.launch()` records `run.webm` (+ `run.mp4` via Playwright's bundled ffmpeg when found) and a trace (`trace.zip`) under the run directory, with `slowMo` so the recording is watchable. `npm run acceptance:live` turns it on unless `HARNESS_VIDEO=0`; CI leaves it off. |
| `ANTHROPIC_API_KEY` | Live mode only; falls back to `~/.config/capplanner/anthropic_key`. |
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
  run.webm / run.mp4      HARNESS_VIDEO=1 only; trace.zip alongside (open with `npx playwright show-trace runs/<ts>/trace.zip`).
                          A committed run keeps run.mp4 only — trace.zip (100+ MB) and the .webm are gitignored even under a force-add.
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

`Session` methods mirror `window.__harness` one-to-one (`loadPlan`, `loadFixture(name)` for any `fixtures/*.json`, `getPlan`, `getResult`, `setControl`,
`listControls`, `optimize`, `proposeChange`, `sendCopilot`, `getCopilotSnapshot`, `acceptCard`, `rejectCard`,
`undo`, `redo`, `setBaseline`, `clearBaseline`, `toggleCompare`, `getBaseline`, `getViewContext`,
`getCommandLog`, `waitIdle`, `getConsoleErrors`) plus `screenshot(name)`, `writeArtifact(name, text)`,
`step(name, fn)`, `reload()` and `close()`. `optimize()` is the "Run optimize" button (returns the Result
protojson; the live plan's phasing.mode is untouched) and `proposeChange(summary, patch)` is the Copilot's
`propose_change` (returns the card id) — so a scripted session can issue exactly the Copilot's tool calls.
Plans and Results come back as protojson strings with proto (snake_case) field names, so keys line up with bus paths. Every call is a Promise that rejects with the in-page error message; a step fails if its function threw
**or** if the page raised an uncaught error while it ran. The contract lives in
`web/src/harness/api.ts` and is imported by both sides.

`sendCopilot(text)` resolves when the Copilot turn ends and rejects with "Copilot not installed" until the
CopilotRail registers one via `window.__harness.setCopilot({ send, snapshot })` — which happens as soon as an
API key is in `sessionStorage`. `getCopilotSnapshot()` returns `{ messages, toolEvents, lastUsage, running,
error }`: the full API transcript (tool_use/tool_result blocks included), so a spec can assert on what the
Copilot did and on `lastUsage.cache_read_input_tokens`.

For quick pokes without a spec, the same API is reachable from any Playwright REPL or from the browser
devtools console on a dev build: `await __harness.listControls()`.

## Acceptance session (WS10)

`acceptance/abilene-1.spec.ts` runs `docs/acceptance-session.md` T1–T7 (+ T3b) as steps over one `Session`,
so every turn leaves a screenshot, plan, Result, command log and console errors under `runs/<ts>/`, plus
`timings.json` (the measured analyze / Monte Carlo round trips against the budgets).

| Mode | Run | What it does |
|---|---|---|
| `scripted` (default; CI) | `make acceptance` | The harness issues the tool calls the Copilot is expected to make (`proposeChange` + `acceptCard`, `setControl`, `optimize`) and asserts every engine/UI fact per turn plus the cross-cutting checks (determinism, malformed `loadPlan` rejects, no page errors, performance budgets). No key needed. |
| `live` (manual) | `cd harness && npm run acceptance:live` | Sends the human's words from the doc to the real Copilot (`sendCopilot`), plays the human on its accept/undo cards, and additionally checks the narration: every number traces to a Result (2 significant figures, $B/$M/% scalings, per-metric deltas), four dimensions in T7, ≥1 `query_research`, prompt-cache reads from T2 on, transcript restored after reload. Writes `transcript.md` (H/tools/C per turn) and, by default, `run.mp4` + `trace.zip`. |

**Key handling (live).** The key comes from `ANTHROPIC_API_KEY` or `~/.config/capplanner/anthropic_key`
(trimmed) and is injected into `sessionStorage["copilot.apiKey"]` by a page init script — the same place the
BYO-key panel stores it. It is never printed or written to an artifact: the key panel is masked on every
screenshot, `sk-ant-…` strings are redacted from archived console logs and `transcript.md`, and the
command log / plan / Result never contain it. Runs are gitignored; the one reviewed live run is force-added.

Live mode takes 30–60 minutes (a real tool loop per turn) and fails the test on a narration miss with the
offending numbers listed, so an unexpected failure usually means a prompt/tool wording gap — read
`transcript.md` first.

**Iterating on a live failure.** Restarting from T1 for every defect is the expensive part, so:

| Knob | Effect |
|---|---|
| `npm run acceptance:live:iterate` | Live mode without video/slowMo and with `ACCEPTANCE_MC_ITERATIONS=300` (T4 asserts against whatever count the run used). The archived run uses `acceptance:live` (video on, 1,000 draws). |
| `ACCEPTANCE_RESUME_FROM=T6` | Rebuilds the state of the newest previous run (`ACCEPTANCE_RESUME_RUN=<dir>` to pick one) from its archive — every earlier turn's `plan.json` is loaded in order so undo history matches, the baseline is pinned before T3's plan and compare switched on after T3b, checkpoints come from the archived `result.json`s (each is re-analyzed and must reproduce byte-for-byte), the Copilot transcript is restored into localStorage from `transcript.json` — and starts at that turn, so a failure at T6 re-verifies T6–T8 only. Live mode only. |
| `ACCEPTANCE_MC_ITERATIONS` | Monte Carlo draws written into the fixture (default 1,000). |
| `HARNESS_VIDEO=0/1` | Video + trace + slowMo off/on (on by default for `acceptance:live` only). |

Per-turn reasoning effort is fixed in the spec (`output_config.effort`: high for T3/T7/T8, low for the
T5/T6 what-ifs, the API default elsewhere) and reaches the Copilot through `sendCopilot(text, { effort })`.
