# Implementation Plan — Fan-out Work Breakdown

**Status:** v0.4 — 2026-09-15. Orchestrated by Fable; subagent workers build in git worktrees and open
PRs; the orchestrator reviews and merges. **Overall acceptance criterion: `docs/acceptance-session.md`.**
Every worker follows the **`development` skill** (`.claude/skills/development/SKILL.md`). Source of
truth: `architecture.md`, `proto/capplanner/v1/engine.proto`, `engine-design.md`, `ui-spec.md`,
`agent-integration.md`. Scope: single-site Site-Feasibility POC.

Every workstream except WS10 is merged, as are the fidelity follow-ups (#35), the schematic fix (#40)
and the UX feedback loop PRs #41–#52 that followed the first tester sessions; WS10 (acceptance) is
the one PR still in flight. Status per workstream and per follow-up is in the tables below.

## Tracking
- One GitHub issue per workstream (`WS*` labels) in `nchim/ai-compute-planning`; each PR references its
  issue. The issue list + PR history are the progress record.
- Orchestrator rules: proto changes are gated (workers propose in the PR description, never merge them
  unilaterally); CI must be green on the PR's head SHA before merge.

### Merge process (as actually used)
- Workers push `ws<N>-<slug>` branches from their own worktree (`<repo>-wt/<slug>`, see the skill) and
  open a PR with `gh pr create --base main`. They never merge.
- Auto-merge is disabled on the repo, so the orchestrator merges through a **queue**: PRs are merged
  one at a time as **merge commits** (not squashed), oldest-ready first; the next PR in the queue
  merges `origin/main` into its branch (workers do this on request) and CI re-runs on the new head
  before it goes in. History therefore shows one merge commit per workstream plus the
  "Merge origin/main into ws…" commits that queueing produced.
- CI is checked on the **head SHA** of the PR (`gh pr checks`), never on a stale run. When GitHub
  skips a check suite (a merge of `main` into the branch with no diff against it, or a run that never
  gets scheduled), the orchestrator verifies locally instead: `make check`, `make wasm`, and
  `make harness` on the branch, and records that in the merge commit or PR comment.
- The only recurring conflicts were in the skill's **Playbook** (append-only, every worker adds a
  bullet); the resolution rule is "keep both sides, in date order". No code conflicts needed manual
  resolution.
- Follow-ups discovered during review are filed as issues with the `follow-up` label and picked up as
  `fu<issue>-<slug>` branches (#15 → PR #25, #23 → PR #26, #28–#30 → PR #35, #39 → PR #40).

### UX feedback loop (as used from PR #41 on)
Once the tester deployment existed, feedback from using it turned into a tighter loop than the
workstream process: each item (or a small batch of related ones) is a **small `ux-<slug>` branch** from
`main` → a PR whose body states the user feedback, the change and the checks → a **local fail-fast
verify** on the branch before merging (`cd web && npm run typecheck && npm run lint && npm test &&
npm run build`, chained with `&&` — PR #50 merged with typecheck errors because the chain used `;`;
`make check` when Go or the deploy server is touched) → merge as a merge commit → **`make deploy`** so
the next tester session runs the fix. `make sessions` reads what the testers did (opt-in sharing, #43)
and feeds the next batch. Docs are synced at stopping points (PR #34, this PR) rather than per UX PR;
the code is the source of truth in between.

## Locked technical decisions (v0.3 — so workers never have to guess)
| Area | Decision |
|---|---|
| Repo layout | Monorepo: `proto/` (buf module) · `engine/` (Go, module `github.com/nchim/ai-compute-planning`, `go.mod` at repo root) · `web/` (SPA) · `harness/` (Playwright driver + acceptance scripts) · `fixtures/` (shared protojson SitePlans) · `deploy/` (Cloud Run host + relay) |
| Proto | `proto/capplanner/v1/engine.proto` is canonical. `buf lint` + `buf generate`; **generated code is committed** (`engine/pb/`, `web/src/gen/`) so workers and CI need no plugins beyond `buf` remote plugins; CI fails if it is stale. |
| Go | Go 1.25, `google.golang.org/protobuf`. **No goroutines inside the engine** (`core`, `risk`, `optimize`) — the core is a fast, single-threaded pure function. Go package lists are always explicit (`./engine/... ./deploy/...`), never `./...` (`web/node_modules` contains stray Go code). |
| WASM boundary | `engine/wasm` publishes `globalThis.capplanner.{analyze, optimize}` (`Uint8Array → Uint8Array`, binary proto both ways); the logic is `engine/bridge` (plain Go, tested under `-race`), panics recovered into `INTERNAL_ERROR`. The SPA runs the module in a **Web Worker**. |
| SPA | Vite + React 18 + TypeScript (strict). State = one immutable `SitePlan` + last `Result` + baseline behind the **command bus** (reducer + serializable log; undo/redo over the plan history). `@bufbuild/protobuf` v2. Charts are plain SVG. Tests: Vitest (+ jsdom for components). |
| Copilot | `@anthropic-ai/sdk` beta tool runner, `claude-sonnet-5`, ten tools over the bus (strict only on the four plan-writing ones; no integer bounds in any schema). Transport chosen at build time: **relay** (`VITE_COPILOT_RELAY`, deployed) or **BYO key** (dev). System prompt text is `docs/agent-system-prompt.md`, imported verbatim at build time. |
| Harness | Playwright (`@playwright/test`) driving `http://localhost:5173` + `window.__harness`. `COPILOT_MODE=scripted|live` for the acceptance session. |
| Deploy | One Cloud Run service (`deploy/`): Go static host + Basic Auth + Anthropic relay + daily cap + `POST /api/session` event sink (opt-in session sharing → Cloud Logging, read with `make sessions`); built from source by Cloud Build (`make deploy`). |
| CI | GitHub Actions `ci.yml`, two jobs: **check** (`make deps` · `make wasm` · `make check` = buf lint, gofmt, `go vet`, staticcheck, `go test -race`, tsc, eslint, vitest · generated code up to date) and **harness** (`make wasm` · Playwright chromium · `make harness`, run artifacts uploaded). |
| Determinism | Results are byte-identical per platform; goldens are compared with a 1e-9 relative tolerance because arm64 fuses multiply-adds and amd64 does not (see `engine-design.md`). |

## Dependency graph
```
WS1 scaffold+proto ─┬─▶ WS2 engine core ─┬─▶ WS3 risk ──────┐
                    │                    ├─▶ WS4 optimizer ─┤
                    ├─▶ WS5 wasm bridge (stub core first) ──┼─▶ WS10 acceptance session
                    └─▶ WS6 SPA + command bus ─┬─▶ WS7 site view ┤          ▲
                                               ├─▶ WS8 copilot   ┤          │
                                               └─▶ WS9 harness ──┘   WS11 baseline/compare
                                                                     WS12 grounding scenarios
                                                                     WS13 deploy + relay
```
Waves as run: **W0** WS1 → **W1** WS2 ‖ WS5 ‖ WS6 → **W2** WS3 ‖ WS4 ‖ WS7 ‖ WS8 ‖ WS9 → **W2b** WS11 +
follow-ups #15/#23 → **W3** WS10 ‖ WS12 ‖ WS13 → fidelity follow-ups (#28–#30, #39) → **UX feedback
loop** (#41–#52, serial, each deployed).

## Workstreams

| WS | Issue | PR | Status |
|---|---|---|---|
| WS1 scaffold + proto codegen + CI | #1 | #12 | merged |
| WS2 engine core | #2 | #16 | merged |
| WS3 risk (Monte Carlo + sensitivity) | #3 | #20 | merged |
| WS4 optimizer (phasing-to-demand-ramp) | #4 | #22 | merged |
| WS5 WASM bridge + worker client | #5 | #13 | merged |
| WS6 SPA shell + command bus + ViewContext | #6 | #14 | merged |
| WS7 Site Feasibility view | #7 | #18 | merged |
| WS8 embedded Copilot | #8 | #19 | merged |
| WS9 remote-control harness | #9 | #17 | merged |
| WS10 acceptance session T1–T8 | #10 | branch `ws10-acceptance` | in progress (PR open) |
| WS11 baseline pin + compare mode | #21 | #24 | merged |
| WS12 grounding scenarios + reconciliation | #27 | #31 | merged |
| WS13 Cloud Run deploy + relay | #11 | #32 | merged |
| follow-up: invalidate in-flight analyze | #15 | #25 | merged |
| follow-up: optimizer core hooks | #23 | #26 | merged (issue open for the instantaneous-shortfall half) |
| follow-ups: model fidelity (energy at utilization, per-lease escalation + opex growth, income-based colo exit) | #28, #29, #30 | #35 | merged |
| docs sync (specs as built, process folded into the skill) | — | #34 | merged |
| follow-up: schematic row-wrapping + px-scaled labels | #39 | #40 | merged |
| UX batch 1: composer, activity indicator, phasing states, engine indicator, optimize robustness, real map, block cards | — | #41 | merged |
| opt-in session sharing → Cloud Logging + `make sessions` | — | #43 | merged |
| Clear conversation | — | #44 | merged (superseded by Reset, #49) |
| markdown chat + resizable rail | — | #45 | merged |
| Gantt marker layout, table formatting, phase editor labels | — | #46 | merged |
| map recenters per fixture; overlays always on with a legend | — | #47 | merged |
| `removeAt` / phase delete / `remove_list_item`, parcel acres chip, cashflow stroke | — | #48 | merged |
| Reset session (`reset` command + `resetSession`) | — | #49 | merged |
| `store.optimize(overrides)`: Copilot settings on the candidate only; single error banner | — | #50 | merged |
| proposal cards in the thread; Monte Carlo/sensitivity in tool results + prompt section | — | #51 | merged |
| canvas shows only the latest proposal headline | — | #52 | merged |

### WS1 — Scaffold + proto codegen  *(#1 → PR #12)*
Repo layout above; `buf.yaml`/`buf.gen.yaml`; Go + TS types generated and committed; `Makefile`
targets (`deps`, `gen`, `lint`, `test`, `check`, `wasm`, `web`, `harness`); GitHub Actions CI; `web/`
Vite scaffold; `fixtures/abilene-1.json` with Go and TS round-trip tests.
**Done:** CI green on the skeleton; `make wasm` produces `web/public/engine.wasm`; fixture round-trips.

### WS2 — Engine core  *(#2 → PR #16)*
`engine/core`: validate → sizing → schedule → capex → opex → revenue → cashflow → metrics → layout →
conserve → render, per `engine-design.md`; every diagnostic code the acceptance session names; the
fourteen conservation checks; `Result` rendered (tables, charts, schematic) from the model.
**Done:** `abilene-1` analyzes `OK` with conservation green; golden `testdata/abilene-1.result.json`
compared with tolerance; diagnostic tests per code; determinism test; `Analyze` ≈ 130 µs native.

### WS3 — Risk: Monte Carlo + sensitivity  *(#3 → PR #20)*
`engine/risk`: seeded inverse-CDF samplers, protoreflect path override, P10/P50/P90/mean/sd +
histogram; one-at-a-time sensitivity → tornado for **two targets** (LCOC and NPV). Composed with the
core in `engine.Analyze` (`engine/engine.go`).
**Done:** seed → byte-identical; histogram sums to iterations; tornado ordering; 1k iters ≈ 125 ms native.

### WS4 — Optimizer: phasing-to-demand-ramp  *(#4 → PR #22; hooks in PR #26)*
`engine/optimize`: staged deterministic search over `core.Analyze` (enumerate phase count × source
assignment → demand-tracking seeds → coordinate descent), 400-evaluation budget, `converged` +
`evaluations` + frontier reported; `max_shortfall_mw` applied to the **hold-average** shortfall.
**Done:** on `abilene-1` the winner beats single-shot on `MIN_STRANDED_PLUS_LCOC`, is feasible,
conservation green, first phase on BTM gas before the grid month; deterministic; ~40 evaluations on T3.

### WS5 — WASM bridge + JS loader  *(#5 → PR #13)*
`engine/bridge` (plain Go, `Bridge.Call(op, bytes)`), `engine/wasm/main.go` (thin `syscall/js`
adapter), `web/src/engine/` (module Web Worker, request ids, timeout, typed `EngineError`, plus a
`fake` engine for UI work without WASM).
**Done:** Vitest round-trips the fixture through the real module under Node; corrupted bytes yield a
`MALFORMED_INPUT` diagnostic, not a crash.

### WS6 — SPA shell + command bus + ViewContext  *(#6 → PR #14; #15 → PR #25)*
Two-region layout (Copilot rail + canvas, future tabs greyed); the command bus (`web/src/bus`: typed
commands, reducer over an immutable `SitePlan`, serializable log, undo/redo, proposals as first-class
commands); debounced re-analyze with a stale-reply guard that also invalidates an in-flight analyze
when a newer mutation is scheduled (#15); `ViewContext`; a raw `Result` inspector.
**Done:** control change → command → re-analyze → re-render; undo restores the prior plan byte-for-byte.

### WS7 — Site Feasibility view  *(#7 → PR #18; refined by #40, #41, #46–#48)*
All seven canvas regions from `ui-spec.md` as SVG charts from `Result` fields; hover explainers from a
glossary; inline diagnostics at the offending control; `optimize()` on the store runs the optimizer on
an OPTIMIZE-mode clone; "Apply best plan" is an accept/undo card. Later: real Leaflet basemap,
schematic block cards, phase delete, blank/running states, engine activity indicator.
**Done:** every region renders from `Result` only; controls live and bidirectional; a golden `Result`
fixture drives component tests.

### WS8 — Embedded Copilot  *(#8 → PR #19; refined by #41, #44, #45, #48–#52)* — see `agent-integration.md`
Tool runner + tools over the bus; cached system prompt from `docs/agent-system-prompt.md`; ViewContext
after the breakpoint; streaming; BYO-key panel; localStorage transcript; every tool error returned as
an `is_error` tool result. Later: growing composer, activity indicator, markdown rendering,
`remove_list_item`, candidate-only `run_optimize`, risk outputs in tool results, proposal cards in
the thread, Reset.
**Done:** unit tests drive the loop through the real SDK with a scripted `fetch`; `cache_read_input_tokens`
asserted on the second turn.

### WS9 — Remote-control harness  *(#9 → PR #17)*
`window.__harness` over the bus (dev/harness builds only); `harness/` Playwright package with `Session`
and per-step artifact archiving under `harness/runs/<ts>/`.
**Done:** the smoke spec loads the fixture, moves a slider, reads the Result, screenshots — in CI.

### WS10 — Acceptance session  *(#10 → branch `ws10-acceptance`, PR open)*
`harness/acceptance/abilene-1.spec.ts` runs `docs/acceptance-session.md` T1–T7 (+ T3b) over one
`Session` in `scripted` (CI gate) and `live` (real Copilot, narration checks, video + trace) modes,
run with the branch's `make acceptance` / `cd harness && npm run acceptance:live` (neither target
exists on `main` yet); the branch also carries the fixture, prompt and tool-schema
adjustments the session surfaced. See `harness/README.md` on that branch for the design.
**DoD:** `scripted` green in CI; one `live` run archived and reviewed by the orchestrator.

### WS11 — Baseline pin + comparison mode  *(#21 → PR #24; user request 2026-09-15)*
Bus commands `setBaseline` / `clearBaseline` / `toggleCompare`; the baseline is a cloned plan + Result
that undo/redo never touch; in compare mode every metric tile shows Δ (current − baseline, absolute and
%), charts ghost the baseline series; `baselineLabel` / `baselineSummary` / `compare` in ViewContext;
Copilot tools `set_baseline` / `toggle_compare`; harness hooks; acceptance T3b.
**Done:** merged; T3b is asserted by the WS10 spec.

### WS12 — Grounding scenarios + reconciliation  *(#27 → PR #31, merged)*
Two more fixtures reconciled against external models: `fixtures/nova-colo.json` (A.CRE colo
development, L0 lens) and `fixtures/epoch-100mw.json` (Epoch AI 100 MW GB200 campus), each with a
source→field table in the README, goldens, determinism, Monte Carlo + optimize smoke, and
reconciliation tests that pin every known gap's direction and band. The gaps became #28–#30. The
"Load fixture" control becomes a dropdown over `fixtures/*.json`; `__harness.loadFixture(name)`.
**DoD:** reconciliation within tolerance on the source's own basis; structural gaps stated, not tuned.

### WS13 — Cloud Run deploy + relay  *(#11 → PR #32, merged)*
`deploy/server` (Go stdlib): serves `web/dist` with SPA fallback, HTTP Basic Auth (user `tester`,
`APP_PASSWORD`), `/api/anthropic/` reverse proxy accepting only `POST /v1/messages` with a header
allow-list and the server-held `ANTHROPIC_API_KEY`, per-UTC-day request cap, SSE streamed through;
`deploy/Dockerfile`, `deploy/cloudrun.md` runbook, `make deploy` / `make serve`. The SPA's
`transport.ts` selects relay mode via `VITE_COPILOT_RELAY`. Go lint/test cover `./deploy/...`.
PR #43 added `POST /api/session` (opt-in session sharing → Cloud Logging) and `make sessions`.
**Done:** merged; per-user auth remains deferred (#11 tracks it).

### Follow-ups
- **#15** (closed, PR #25) — a plan mutation scheduled while an analyze is in flight invalidates that
  reply, so a stale Result never lands on a newer plan.
- **#23** (open; core half landed in PR #26) — `core.DemandAt` and `core.ConstructionLeadMonths`
  exported; `SOURCE_OVERLOADED` validated in EXPLICIT mode; `max_shortfall_mw` documented as a
  hold-average bound. Still open: an instantaneous shortfall mode for the policy.
- **#28 / #29 / #30** (closed, PR #35) — COMPUTE_SALES energy billed at IT × utilization × PUE with an
  exact utilization breakeven; colo escalation per lease from each phase's energize month plus the new
  `costs.opex.opex_growth_pct_yr` on every cost rate (A.CRE convention; trended NOI +1.7%); COLO_LEASE
  exits on NOI ÷ `exit_cap_rate` (both exit bases in `summary.extra`). See `engine-design.md`.
- **#33** (open) — Copilot prompt refinement pass from the archived live run: score each turn against
  the narration rubric in `acceptance-session.md`, tighten the system prompt in one batch (an edit is
  a cache miss), re-run live and compare.
- **#38** (open) — deploy: `strings.TrimSpace` the secret env values (a `--data-file` secret with a
  trailing newline made every login fail on the first revision) and investigate `GET /healthz`
  answering Google's 404 on Cloud Run.
- **#39** (closed, PR #40) — schematic blocks wrapped into rows inside the usable rectangle
  (`SCHEMATIC_OVERFLOW` warning, `blocks_within_parcel` check) and labels/strokes rendered in screen
  pixels.
- **#42** (open) — map cosmetics: permanent power-source labels overlap the site marker on abilene-1;
  the water tint is too faint at 0.6 stress; confirm Esri Gray Canvas terms for a gated POC.

## Deferred / next (tracked, not in the POC)
- **Conversation compaction / context management** for long Copilot sessions (beta compaction or
  context editing; the history store is already swappable).
- **Portfolio views** (the greyed tabs) and multi-site roll-up.
- **Surveyed power-source coordinates** on the map (today a documented schematic offset, labelled
  illustrative).
- **Instantaneous shortfall mode** for `phasing.policy.max_shortfall_mw` (#23's remaining half).
- **Idle energy draw**, **selling costs at exit**, **forward-12 exit NOI** (candidates named in #35;
  no research figure to anchor an idle fraction yet).
- **`decision_vars`** honoured by the optimizer (today the phasing policy alone bounds the search and
  `DECISION_VARS_IGNORED` says so).
- Per-user auth on the relay and a cap shared across instances (#11 remainder); model escalation
  per turn; durable transcript storage.

## Milestones
- **M1** WS1+WS2 — engine analyzes `abilene-1`, conservation green. ✅
- **M2** WS3+WS4 — risk + flagship optimizer. ✅
- **M3** WS5+WS6+WS7 — SPA renders Site Feasibility live from WASM. ✅
- **M4** WS8+WS9+WS11 — Copilot operates the view; harness drives it; baseline/compare. ✅
- **M5** WS10 — acceptance session passes (scripted in CI, live run archived). In progress.
- **M6** WS12+WS13 — grounded fixtures reconciled; tester deployment on Cloud Run. ✅
- **M7** UX feedback loop — testers on the deployment, findings fixed and redeployed (#41–#52). Ongoing.
