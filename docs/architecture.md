# System Architecture — AI-Lab Capacity Planner

**Status:** v0.3 — 2026-09-15. Updated to what is built (WS1–WS13 and PRs #35–#52). This doc + the
proto contract are the source of truth. Read `product-brief.md` for the product framing and
`research/02-kpi-architecture.md` for the analytical spine.

## Locked decisions (2026-09-15)

| Decision | Choice |
|---|---|
| Flagship optimization | **Phasing-to-demand-ramp** (minimize stranded-capacity carry + LCOC) |
| v1 engine scope | **Single site** (feasibility + phasing + optimizer). Portfolio deferred. |
| Fidelity | **Deterministic + sensitivity + Monte Carlo** risk (P10/P50/P90) |
| Map | Real tiles: Esri Gray Canvas (key-free; CARTO Positron now needs a key) via Leaflet behind the `MapProvider` seam; schematic provider kept as the tile-free fallback |
| POC surface | **Site Feasibility** view (where the engine POC lands) |
| Deployment | One Cloud Run container: static SPA + Basic Auth + Anthropic relay + session-event sink (`deploy/`) |

## Components & the stable seam

```
┌────────────────────────────── SPA (browser) ──────────────────────────────┐
│  Persistent, view-aware Copilot rail   │   Canvas (per view)               │
│  - one conversation across all views   │   - Site Feasibility (POC):       │
│  - knows: active tab, selected site,   │       map · schematic · phasing   │
│    current SitePlan, last Result,      │       · critical path · pro forma │
│    baseline + compare state            │       · risk · optimization       │
│  - proposes changes as accept/undo     │   - live, bidirectional controls  │
│    cards; interprets Result metrics    │   - hover explainers on metrics   │
└─────────────┬──────────────────────────────────────┬──────────────────────┘
              │ SDK (relay or BYO key)                │ SitePlan (binary proto)
              ▼                                        ▼
      ┌───────────────┐                     ┌────────────────────────────┐
      │  Anthropic     │                     │  Engine (Go → WASM, in a   │
      │  Messages API  │  tools run in the   │  Web Worker)               │
      │  (Sonnet 5)    │  browser, over the  │  Analyze(SitePlan)→Result  │
      └───────────────┘  command bus         │  Optimize(SitePlan)→Result │
                                              │  pure · deterministic core │
                                              │  + Monte Carlo + optimizer │
                                              └────────────────────────────┘
```

**The seam is `engine.proto`:** `SitePlan` in → `Result` out. Everything the UI renders and everything
the agent interprets is a field of `Result`. This is what let the engine and UI workstreams build in
parallel against a frozen contract.

### SPA (view layer)
- **Persistent Copilot** across tabs; a `ViewContext` (`web/src/bus/viewContext.ts`) is derived from
  the store on every turn: `activeTab`, `selectedSiteId` (the plan id), `plan`, `resultSummary`,
  `diagnostics`, `selection` (`tab`, focused control `path`, `phaseId`, scrubber `month`),
  `baselineLabel`, `baselineSummary`, `compare`. The Copilot's context block adds `conservation.all_passed`
  and the pending proposal ids.
- **Bidirectional, real-time controls:** every control reads/writes the in-memory `SitePlan`; a human
  edit and an agent tool call are the same command → the store re-runs `Analyze` (debounced 16 ms, in
  the worker) and re-renders. Agent changes surface as **accept/undo "proposed change" cards**.
- **Assistive:** hover explainers on every metric and control from a glossary (`views/site/glossary.ts`),
  inline diagnostics at the offending control (matched on `proto_path`), the rest at the top of the view.
- **Views can talk to the Copilot without owning it:** `CopilotHandleProvider` (`copilot/handle.tsx`,
  wrapped around the rail + canvas in `App.tsx`) holds the live Copilot's `send`; the rail registers it
  (and the same function with `window.__harness.setCopilot`), any view reads it with `useCopilotSend()`
  — `null` while no Copilot exists — e.g. the schematic block card's "Explain →" link.

### Engine (compute layer)
- **Pure function**, no I/O, no globals, no clock/RNG except via the proto (seed passed in). Output is a
  deterministic function of the input bytes (`proto.MarshalOptions{Deterministic: true}`).
- **Packages:** `engine/core` (analytical core + conservation + render), `engine/risk` (Monte Carlo +
  sensitivity), `engine/optimize` (phasing search), composed by the `engine` root package
  (`engine.Analyze` = core, then risk on a valid plan; `engine.Optimize`), exposed through
  `engine/bridge` and `engine/wasm`.
- **WASM**: `globalThis.capplanner.{analyze, optimize}`, `Uint8Array → Uint8Array` of binary proto;
  protojson is used only agent- and harness-side.
- **Determinism across platforms:** a Result is byte-identical for identical bytes **on one platform**.
  Go fuses multiply-adds on arm64 but not amd64, so the last bits of doubles differ between a Mac and
  CI; goldens are therefore compared with a 1e-9 relative tolerance (`requireProtoClose`), never with
  `proto.Equal`.

### Agent ↔ engine protocol
- The Copilot edits the `SitePlan` through bus commands (dotted protojson paths), waits for the store's
  re-analyze to settle, and reads `Result.summary` + `diagnostics` + conservation from the tool result.
- **Diagnostics are the correction channel:** every error/warning carries `code`, `proto_path`,
  `expected`, `actual`, `hint` so the agent fixes the exact field and re-runs. See `engine-design.md`.

### The command bus (one mutation path for three drivers)
All state changes flow through a single **command bus** (`web/src/bus`) — a reducer over an immutable
state `{plan, result, baseline, compare, engine, proposals, selection, error, history}` with a
serializable command log. `engine: {analyzing, optimizing}` is **derived state**: the store sets it
around its own engine calls and it never enters the command log (there is no `optimizing` flag or
command; the toolbar badge, progress bar and the phasing region's running panel all read
`state.engine`). Three drivers emit the same commands, so behavior is identical however it is triggered:
1. **Human** — direct manipulation of controls.
2. **Embedded Copilot** — the in-app agent's tool calls.
3. **External remote-control harness** — a developer session driving `window.__harness`.

Commands as built: `loadPlan` · `setField` · `applyPatch` · `removeAt(path, index)` (deletes one
element of a repeated field — the phasing editor's × and the Copilot's `remove_list_item`; rejects a
non-repeated path, an `[i]` suffix or an out-of-range index; undoable) · `proposeChange` /
`acceptProposal` / `rejectProposal` · `reset` (back to `initialState` except `engine`; `resetSession`
in `web/src/session/reset.ts` wraps it with the Copilot clear and the fixture reload) · `undo` /
`redo` · `setBaseline(label)` / `clearBaseline` / `toggleCompare` · `select` · `resultReceived` ·
`errorRaised` / `clearError`. A rejected command (bad path, no baseline, …) is logged with its reason
and raises a visible error rather than mutating state.

**Optimize is an action, not a command.** `store.optimize(overrides?: PatchOp[])` clones the live plan,
applies `overrides` (objective, constraints, decision vars, policy — whatever the caller wants the
optimizer to see) **to the clone only**, sets `phasing.mode=OPTIMIZE` on it, fills in the documented
permissive default policy when the plan has none (`defaultPolicyFor`: 4 phases, 25–100 MW, 6 months
apart, shortfall cap = target MW), runs `engine.optimize` under the same stale-reply guard as analyze
and stores an OK / OK_WITH_WARNINGS reply via `resultReceived`. A refused or infeasible reply is **not**
stored: the last good Result stays on screen and the first ERROR diagnostic becomes an `errorRaised`
(kind `optimize`) for the banner; the promise still resolves with the Result so the caller (the
Copilot) reads the diagnostics. An invalid override path rejects the promise with the `PathError`. The
live plan is never touched by an optimize; "Apply best plan" and the Copilot's `run_optimize` both go
through it, and the winner reaches the plan only via a proposal. A mutation → re-run `Analyze` →
re-render is the same cycle for all three drivers, and an analyze in flight when a newer mutation is
scheduled is discarded.

### Developer remote-control & test harness
A Claude Code session can **operate and debug the running SPA itself**, not just the embedded Copilot:
- The SPA (dev/harness builds, `VITE_HARNESS=1`) exposes **`window.__harness`** over the bus
  (`web/src/harness/api.ts`): `loadPlan`, `loadFixture`, `getPlan`, `getResult`, `setControl`,
  `listControls`, `optimize` (the "Run optimize" button), `proposeChange` (the Copilot's
  `propose_change`), `sendCopilot(text, {effort?})` / `setCopilot` / `getCopilotSnapshot`,
  `acceptCard` / `rejectCard`, `undo` / `redo`, `setBaseline` / `clearBaseline` / `toggleCompare` /
  `getBaseline`, `getViewContext`, `getCommandLog`, `waitIdle`, `getConsoleErrors` — so a scripted
  session can issue exactly the Copilot's tool calls.
- `harness/` drives headless **Chromium via Playwright** with a `Session` helper that mirrors the API
  and archives per-step artifacts (screenshot, plan, Result, command log, console errors) under
  `harness/runs/<ts>/`. The smoke spec and the scripted acceptance session (`make acceptance`) run in
  CI; the live acceptance run is manual and archived (`harness/README.md`).
- Same-origin, dev-only: the API is not installed in production builds and never bypasses the bus.

### Inference transport (relay vs BYO key)
`web/src/copilot/transport.ts` picks the transport at build time:
- **Relay mode** (deployed): `VITE_COPILOT_RELAY=/api/anthropic` sets the SDK `baseURL` to the page
  origin; the browser holds no key (a placeholder satisfies the SDK), and the direct-browser-access
  header is removed. The rail shows "Relay mode — key held server-side".
- **BYO-key mode** (dev default): the developer pastes a key into the rail (sessionStorage) and the
  browser calls Anthropic directly. Never deployed.

### Deployment topology (Cloud Run)
One container (`deploy/Dockerfile`: Go stage builds `engine.wasm` + the server, Node stage builds the
relay SPA, distroless final) runs `deploy/server` (Go stdlib only):
- serves `web/dist` with SPA fallback and correct MIME/cache headers;
- **HTTP Basic Auth** (user `tester`, `APP_PASSWORD` secret) on everything except `GET /healthz`;
- **`/api/anthropic/`** reverse proxy accepting only `POST /v1/messages`, forwarding an allow-list of
  headers, injecting the server-held `ANTHROPIC_API_KEY`, streaming SSE through;
- a **daily request cap** (`DAILY_REQUEST_CAP`, default 500, per UTC day, in-process) answering 429 in
  the Anthropic error envelope — meaningful because the service runs with `--max-instances 1`;
- **`POST /api/session`** (same Basic Auth, outside the daily cap): the opt-in session-sharing sink.
  Each accepted event (JSON ≤ 256 KB) is written as one bare JSON line on stdout, which Cloud Logging
  parses into `jsonPayload` (`session_event=true`, `session_id`, `plan_id`, `kind`, `seq`, `payload`);
  `sk-ant-…` tokens are masked. Nothing is stored in the container.
Cloud Run terminates TLS; `--allow-unauthenticated` is deliberate (our Basic Auth gates instead). The
topology has not changed since WS13 — the UX PRs redeploy the same single service with `make deploy`.
Runbook: `deploy/cloudrun.md`; `make deploy` builds from source on Cloud Build, `make serve` runs the
same configuration locally.

### Session sharing (telemetry path)
`web/src/telemetry/` — `createSessionShare({store, enabled, sessionId})` is created once in `main.tsx`
and handed to the rail through `SessionShareProvider`. When enabled it posts to `/api/session`, one
event per request, tagged with a random per-page-load `session_id` (sessionStorage) and the current
`plan_id`: new command-log entries as debounced (~1 s) `commands` batches chunked under 200 KB, the
newest `result` (status, summary, diagnostics) of each batch, every `errorRaised` plus uncaught page
errors/rejections as `error`, and a `copilot_turn` summary (user text, assistant text, tool names +
inputs ≤ 300 chars, usage, error, notice) at each turn end. Bodies are scrubbed of `sk-ant-` tokens;
a failed post warns once and is otherwise ignored, so sharing can never break the app. Entries logged
while sharing was off are not sent retroactively. Reader: `make sessions` (`deploy/sessions.py`).

## Data flow (one interaction)
1. User, Copilot or harness changes a control → a bus command mutates `SitePlan`.
2. Store serializes to binary proto → worker `analyze` → `Result` bytes → deserialize → `resultReceived`.
3. Canvas renders `Result.tables/charts/schematic/summary`; the Copilot's next turn sees the new
   ViewContext; diagnostics render inline and in the tool result.
4. For "optimize this," the Copilot calls `run_optimize` with objective/constraints/policy, which
   `store.optimize(overrides)` applies to the optimizer's candidate only; it interprets the frontier
   and proposes the best plan as an accept/undo card. A failed run changes nothing on screen.
5. "Set as baseline" snapshots plan + Result; "Compare" overlays Δ tiles and ghosted baseline series,
   and the Copilot narrates `current − baseline` from the two summaries in ViewContext.

## Non-goals for v1
Portfolio roll-up; real financing waterfall; surveyed power-source coordinates (the map places
sources at a schematic offset); server-side compute; multi-user live
co-editing; persistence beyond the browser (transcripts live in localStorage; the relay stores nothing —
shared session events go to Cloud Logging, not to a database).

## Tech choices
- **Engine:** Go 1.25, `google.golang.org/protobuf`, compiled with `GOOS=js GOARCH=wasm`; no goroutines.
- **Proto:** proto3, `buf` for lint/generate; generated code committed (`engine/pb`, `web/src/gen`).
- **SPA:** Vite + React 18 + TypeScript strict, `@bufbuild/protobuf` v2, plain SVG charts, Vitest.
- **Map:** Leaflet 1.9 with Esri World Light/Dark Gray Canvas raster tiles
  (`server.arcgisonline.com`, key-free, Esri + OSM attribution; CARTO Positron was dropped because
  keyless tiles are now watermarked). The tiles are the one third-party asset the browser loads cross-origin;
  the container serves nothing for them and sets no CSP, so no deploy change is needed. A tile
  failure degrades to the vector overlays on a blank map with a notice.
- **Copilot:** `@anthropic-ai/sdk` beta tool runner, `claude-sonnet-5`; chat rendered with
  react-markdown + remark-gfm; see `agent-integration.md`.
- **Harness:** Playwright (`@playwright/test`) + `window.__harness`; see `harness/README.md`.
- **Deploy:** Cloud Run from source (Cloud Build), secrets in Secret Manager; see `deploy/cloudrun.md`.
- **Determinism:** all randomness seeded via `run.monte_carlo.seed`; no wall-clock in the engine —
  which is also what makes harness-driven validation runs reproducible.
