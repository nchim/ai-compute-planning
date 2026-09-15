# Implementation Plan — Fan-out Work Breakdown

**Status:** v0.2 — 2026-09-15. Orchestrated by Fable; subagent workers build in git worktrees and open
PRs; the orchestrator reviews and merges. **Overall acceptance criterion: `docs/acceptance-session.md`.**
Every worker follows the **`development` skill** (`.claude/skills/development/SKILL.md`). Source of
truth: `architecture.md`, `proto/capplanner/v1/engine.proto`, `engine-design.md`, `ui-spec.md`,
`agent-integration.md`. Scope: single-site Site-Feasibility POC.

## Tracking
- One GitHub issue per workstream (`WS*` labels) in `nchim/ai-compute-planning`; each PR references its
  issue. The issue list + PR history are the progress record.
- Orchestrator rules: proto changes are gated (workers propose in the PR description, never merge them
  unilaterally); PRs are squash-merged after review; CI must be green.

## Locked technical decisions (v0.2 — so workers never have to guess)
| Area | Decision |
|---|---|
| Repo layout | Monorepo: `proto/` (buf module) · `engine/` (Go, module `github.com/nchim/ai-compute-planning`, `go.mod` at repo root) · `web/` (SPA) · `harness/` (Playwright driver + acceptance scripts) · `fixtures/` (shared protojson SitePlans) |
| Proto | `proto/capplanner/v1/engine.proto` is canonical (moved from `docs/proto/`). `buf lint` + `buf generate`; **generated code is committed** (`engine/pb/`, `web/src/gen/`) so workers and CI need no plugins beyond `buf` remote plugins. |
| Go | Go 1.25, `google.golang.org/protobuf`. **No goroutines inside the engine** (`core`, `risk`, `optimize`) — the core is a fast, single-threaded pure function; WASM is single-threaded anyway and this rules out data races by construction. |
| WASM boundary | `engine/wasm` exports `capplanner.analyze(Uint8Array) → Uint8Array` and `capplanner.optimize(...)`, binary proto both ways, panics recovered into `INTERNAL_ERROR`. The SPA runs the module in a **Web Worker** so Monte Carlo never blocks the UI. |
| SPA | Vite + React 18 + TypeScript (strict). State = one immutable `SitePlan` + last `Result` behind the **command bus** (a small reducer with a serializable command log; undo = replay). `@bufbuild/protobuf` v2 for types/binary/protojson. Charts: Recharts (or plain SVG where simpler). Tests: Vitest. |
| Copilot | `@anthropic-ai/sdk` beta tool runner, `claude-sonnet-5`, BYO key in dev (see `agent-integration.md`). System prompt text is `docs/agent-system-prompt.md`, loaded verbatim at build time. |
| Harness | Playwright (Node, `@playwright/test` runner) driving `http://localhost:5173` + `window.__harness`. Acceptance script supports `--copilot=scripted|live`. |
| CI | GitHub Actions: `buf lint` · `go vet` · `staticcheck` · `go test -race ./...` (native) · WASM build · `npm run typecheck && npm test` in `web/` · `scripted` acceptance run headless. |

## Dependency graph
```
WS1 scaffold+proto ─┬─▶ WS2 engine core ─┬─▶ WS3 risk ──────┐
                    │                    ├─▶ WS4 optimizer ─┤
                    ├─▶ WS5 wasm bridge (stub core first) ──┼─▶ WS10 acceptance session
                    └─▶ WS6 SPA + command bus ─┬─▶ WS7 site view ┤
                                               ├─▶ WS8 copilot   ┤
                                               └─▶ WS9 harness ──┘
```
Waves: **W0** WS1 (serial) → **W1** WS2 ‖ WS5 ‖ WS6 → **W2** WS3 ‖ WS4 ‖ WS7 ‖ WS8 ‖ WS9 → **W3** WS10.

## Workstreams

### WS1 — Scaffold + proto codegen  *(serial; blocks everything)*
Repo layout above; `buf.yaml`/`buf.gen.yaml`; move the proto; generate Go + TS types and commit them;
`Makefile` targets (`test`, `lint`, `wasm`, `gen`, `web`, `harness`); GitHub Actions CI; `web/` Vite
scaffold that builds; `fixtures/abilene-1.json` (the acceptance reference plan) with a Go and a TS
round-trip test (protojson → binary → protojson).
**DoD:** CI green on the skeleton; `make wasm` produces `web/public/engine.wasm`; fixture round-trips in both languages.

### WS2 — Engine core  *(engine; after WS1)*
`engine/core`: validate → sizing → schedule → capex → opex → revenue → cashflow → metrics → conserve →
render, per `engine-design.md`. Every diagnostic code in the acceptance session must exist
(`DENSITY_EXCEEDS_COOLING`, `FLOOR_LOAD_INSUFFICIENT`, `PHASE_BEFORE_POWER`, `POWER_UNDERSUPPLY`,
`FOOTPRINT_OVER_PARCEL`, `INTERNAL_ERROR`, …). Tables/charts/schematic rendered from the model.
**DoD:** `abilene-1` analyzes `OK` with all conservation checks green; conservation property test over
randomized valid inputs; diagnostic tests per code; determinism test; `Analyze` < 1 ms native on the
reference plan (leaves headroom for 1k Monte Carlo draws in WASM).

### WS3 — Risk: Monte Carlo + sensitivity  *(engine; after WS2)*
`engine/risk`: seeded inverse-CDF samplers (NORMAL/TRIANGULAR/UNIFORM), path-based input override,
P10/P50/P90/mean/sd + histogram; one-at-a-time sensitivity → ordered tornado.
**DoD:** seed → byte-identical result; histogram sums to iterations; tornado ordering test; 1k iters < 1 s in WASM.

### WS4 — Optimizer: phasing-to-demand-ramp  *(engine; after WS2)*
`engine/optimize`: staged search (enumerate phase count × power source; refine sizes/timing by
coordinate descent seeded from a demand-tracking heuristic); constraints filter, objective ranks;
frontier returned; `converged` + `evaluations` reported; evaluation budget documented.
**DoD:** on `abilene-1` the winner beats single-shot on `MIN_STRANDED_PLUS_LCOC`, is feasible, conservation
green, first phase on BTM gas before the grid month; deterministic.

### WS5 — WASM bridge + JS loader  *(engine; after WS1, with a stub core until WS2 merges)*
`engine/wasm/main.go` (`syscall/js`, bytes→bytes, recover → `INTERNAL_ERROR`); `web/src/engine/`
loader that runs the module in a Web Worker and exposes `analyze(plan): Promise<Result>` /
`optimize(...)`; every failure (load, decode, panic) becomes a rejected promise with a typed error.
**DoD:** Vitest (jsdom + real wasm) round-trips the fixture; a corrupted byte array yields a diagnostic, not a crash.

### WS6 — SPA shell + command bus + ViewContext  *(UI; after WS1)*
Vite/React/TS shell with the two-region layout (Copilot rail + canvas, greyed future tabs); the
**command bus** (typed commands, reducer over immutable `SitePlan`, serializable log, undo/redo,
accept/undo "proposed change" cards as first-class commands); re-analyze cycle via the WS5 loader
(stub until merged); `ViewContext`; a raw `Result` inspector panel.
**DoD:** a control change dispatches a command → re-analyzes → re-renders; undo restores the prior plan
byte-for-byte; Vitest covers the reducer and undo.

### WS7 — Site Feasibility view  *(UI; after WS6)*
All canvas regions from `ui-spec.md`: context map (schematic overlays), site schematic with the
phase-reveal scrubber, phasing lever + demand-ramp/step chart with shortfall/stranded shading,
critical-path Gantt, pro forma/LCOC with the three master-lever sliders, risk radar + Monte Carlo
bands + tornado, optimization panel + frontier + "Apply best plan". Hover explainers from a glossary.
Inline diagnostics at the offending control.
**DoD:** every region renders from `Result` fields only; controls are live and bidirectional; explainers present.

### WS8 — Embedded Copilot  *(UI; after WS6)* — see `agent-integration.md`
Tool runner + tools over the command bus (`edit_site_plan`, `run_analyze`, `run_optimize`,
`set_control`, `propose_change`, `explain`, `query_research`); system prompt from
`docs/agent-system-prompt.md` with a cache breakpoint; ViewContext injected after it; BYO-key panel;
streaming; localStorage transcript (try/catch, restore on load); tool inputs validated before execution;
every tool error returned to the model as a `tool_result` error, never swallowed.
**DoD:** Copilot operates the view and self-corrects from diagnostics on the T2 scenario;
`cache_read_input_tokens > 0` on the second turn; a unit test drives the tool loop with a mocked API.

### WS9 — Remote-control harness  *(UI; after WS6)*
`window.__harness` (dev build only) over the command bus; `harness/` Playwright package with a
`Session` helper (`loadPlan`, `setControl`, `sendCopilot`, `acceptCard`, `undo`, `getResult`,
`getCommandLog`, `screenshot`) and run-artifact archiving under `harness/runs/<ts>/`.
**DoD:** a smoke script loads the fixture, drags a slider, reads the Result, screenshots headlessly, from CI.

### WS10 — Acceptance session  *(after everything)*
Implement `docs/acceptance-session.md` T1–T7 as a harness script with `scripted` and `live` modes;
iterate engine/UI/agent until it passes; archive a reviewed `live` run.
**DoD:** `scripted` green in CI; `live` run archived and reviewed by the orchestrator.

### Deferred (tracked, not in POC)
Inference relay replacing BYO-key; conversation compaction; portfolio views; real map tiles.

## Milestones
- **M1** WS1+WS2 — engine analyzes `abilene-1`, conservation green.
- **M2** WS3+WS4 — risk + flagship optimizer.
- **M3** WS5+WS6+WS7 — SPA renders Site Feasibility live from WASM.
- **M4** WS8+WS9 — Copilot operates the view; harness drives it.
- **M5** WS10 — acceptance session passes.
