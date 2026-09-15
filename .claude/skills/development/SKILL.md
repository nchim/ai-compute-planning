---
name: development
description: Shared feature-development process for the AI-Lab Capacity Planner (Go/WASM engine, protobuf contract, SPA, remote-control harness). Read before doing ANY implementation work on this project — it defines the code-quality bar, the TDD + conservation + proto-contract discipline, and the worktree→PR workflow every worker follows. LIVING doc: append to the Playbook as you learn.
---

# Development Skill — AI-Lab Capacity Planner

Shared process for everyone building this project (orchestrator + subagent workers). Follow it for every
task. **This file is living: improve it as you learn (see "Improve this skill").**

## Read first (source of truth)
- `docs/implementation-plan.md` — locked tech decisions, your workstream, dependencies.
- `docs/acceptance-session.md` — the overall acceptance criterion; know which turns your work serves.
- `proto/capplanner/v1/engine.proto` — THE contract (`SitePlan → Result`). Do not diverge from it.
- `docs/architecture.md`, `docs/engine-design.md`, `docs/ui-spec.md`, `docs/agent-integration.md`,
  `docs/agent-system-prompt.md` — component specs.
- `research/02-kpi-architecture.md` — the analytical/strategic spine (LCOC, four dimensions,
  shortage-vs-underutilization).

## Code-quality bar (we are graded on this)
1. **Concise and readable, written to be maintained and extended.** Small functions with one job,
   names that say what they mean, no clever tricks, no dead code, no premature abstraction. A reader
   should follow the pipeline top-down without a map. Comments explain *why*, not *what*.
2. **Catch errors as early in the pipeline as possible.** Validate inputs at the boundary (proto
   validation, tool-input schemas, harness arguments) and fail there with a precise message. Never let a
   bad value travel into sizing/cashflow/rendering and surface as a NaN or a wrong chart.
3. **Every error is handled and bubbles back to the caller — ultimately the agent.** In Go: return
   wrapped errors (`fmt.Errorf("sizing: %w", err)`), never ignore a return value, never `panic` for
   expected conditions; at the WASM boundary, recover and emit an `INTERNAL_ERROR` diagnostic. In TS:
   no swallowed promises, no empty `catch`; tool failures become `tool_result` errors the model sees;
   UI failures render a visible diagnostic. Engine model errors are **diagnostics in the Result**, not
   Go errors.
4. **No data races.** The engine has **no goroutines** (single-threaded pure function; WASM is
   single-threaded anyway). Go tests run with `-race`. In the SPA, all mutable state lives behind the
   command bus reducer; the engine runs in a Web Worker with request ids so out-of-order replies are
   dropped, not applied. No module-level mutable singletons.

## Non-negotiable rules
1. **The proto is the contract.** Never change `engine.proto` unilaterally. If you need a change, put
   the proposed diff + rationale in your PR description and stop at that boundary; the orchestrator
   decides. A proto change ripples to engine + UI + agent.
2. **TDD.** Write failing tests first. Table-driven tests per module; golden fixtures in `testdata/`;
   conservation checks as property tests over randomized valid inputs.
3. **Conservation is mandatory.** A feature is NOT done if any `ConservationCheck` fails on the golden
   fixtures. Time, land, capital, power, MW must balance (see `engine-design.md`).
4. **Determinism.** No wall-clock, no ambient RNG, no map-iteration-order dependence. All randomness is
   seeded from `run.monte_carlo.seed`. Same input+seed → byte-identical `Result`.
5. **Purity.** The engine core has no I/O, no globals. `Analyze`/`Optimize` are pure functions of the
   input proto.
6. **Verbose diagnostics.** Every error/warning carries `code`, `proto_path`, `expected`, `actual`,
   `hint` so the agent can self-correct. Add a stable `code` for each new failure mode and a test for it.
7. **UI goes through the command bus.** No control (human, Copilot, or harness) bypasses it. The agent
   states no number that isn't from a `Result`.
8. **Idiomatic Go / strict TS.** `gofmt`, `go vet`, `staticcheck` clean; `tsc --strict`, ESLint clean.
   Match the layouts in `engine-design.md` and `implementation-plan.md`.
9. **Stub honestly.** It is fine to stub low-level detail for the POC, but a stub must be visible: a
   `// STUB:` comment, a diagnostic `INFO` where it affects results, and a line in your PR description.
   Never hide a simplification inside a plausible-looking number.

## Per-task workflow (worktree → PR)
1. You are in your own git worktree on a fresh branch `ws<N>-<slug>` from `main`. Read your GitHub issue
   (`gh issue view <N>`) and the docs above.
2. Write the failing test(s) first.
3. Implement the smallest change that passes; stay inside your workstream's directories.
4. Run the full check: `make check` (lint + tests, engine and web) — and `make wasm` if you touched the engine.
5. If you touched a shared interface, update the relevant doc in the same PR.
6. Commit in small, well-described commits. Push and open a PR: `gh pr create --fill --base main`, body
   = what changed · tests added · checks passing · stubs · anything the orchestrator or another
   workstream must know · `Closes #<issue>`. Append the attribution line the session provides.
7. Report back to the orchestrator with the PR number and that same summary. Do not merge.
8. If the orchestrator requests changes, push follow-up commits to the same branch and reply.

## Definition of Done
- [ ] Tests written first and passing; `go test -race` clean; coverage not reduced.
- [ ] `gofmt`/`go vet`/`staticcheck` (Go) and `tsc`/ESLint (TS) clean; `make check` green.
- [ ] Conservation + determinism tests pass (engine work).
- [ ] Every error path handled and surfaced (diagnostic, wrapped error, or tool_result error).
- [ ] New failure modes have coded, `proto_path`'d diagnostics with tests.
- [ ] Stubs are visible and listed in the PR.
- [ ] Docs updated if any contract/interface changed; no proto change without orchestrator sign-off.
- [ ] Scoped to the assigned workstream; no drive-by edits elsewhere. Playbook entry added if you learned something.

## Commands (keep this list current)
- Once: `make deps` (npm ci in `web/` and `harness/`). Everything: `make check` (= `make lint` + `make test`, exactly what CI runs).
- Engine: `go test -race ./engine/...` · lint: `go vet ./engine/... && staticcheck ./engine/...` (always `./engine/...`, never `./...` — `web/node_modules` contains stray Go code).
- Proto: `make gen` (runs `buf generate` in `proto/`; regenerates `engine/pb` + `web/src/gen`, which are committed — CI fails if they are stale). `make lint` runs `buf lint`.
- WASM: `make wasm` → `web/public/engine.wasm` + `web/public/wasm_exec.js` (both gitignored).
- Web: `cd web && npm run typecheck && npm run lint && npm test && npm run dev`
- Harness: `make harness` (or `cd harness && npm run smoke`; `make wasm` first for the real engine; see `harness/README.md`) · acceptance: `npm run acceptance -- --copilot=scripted` (WS10)

## Improve this skill (living doc)
When you learn something reusable — a gotcha, a better pattern, a command that works — **append a dated
bullet to the Playbook below.** Keep entries short and factual. Do not delete or rewrite others' entries.
If a rule here is wrong or outdated, say so in your PR rather than silently changing a non-negotiable.

### Playbook (append-only, dated)
- 2026-09-15 (orchestrator) — Initial skill. Proto contract + conservation-first + TDD are the backbone;
  keep the engine core pure so Monte Carlo (1k iters) and the optimizer stay fast in WASM.
- 2026-09-15 (orchestrator) — Added the code-quality bar (concise/maintainable, fail early, all errors
  bubble to the agent, no data races) and the worktree→PR workflow. Engine has no goroutines by rule.
- 2026-09-15 (WS3) — Risk composes over the core without hooks: `risk.SetNumeric` writes dotted
  `input_path`s via protoreflect (`Mutable` creates unset parents; int fields are rounded). Draw from
  `(0,1)` open (`uniform01`) so `math.Erfinv` never returns ±Inf. 1k Monte Carlo iterations cost ~125 ms
  native and are dominated by `core.Analyze` rendering tables/charts every draw — a render-free core
  entry point would roughly halve it if WASM needs the headroom. LCOC is a *cost* metric: a tornado on
  `gpu_hour_price` is ~flat (only the EGR-linked mgmt fee moves), which is why the tornado is reported
  for both LCOC and NPV (one `SensitivityVar` per path × target, LCOC block first).
- 2026-09-15 (WS1) — Proto enum values share the *package* scope: two enums in one file cannot both
  define `OPTIMIZE`. `RunMode` values are therefore `RUN_ANALYZE`/`RUN_OPTIMIZE`. `buf lint` passes
  with `ENUM_VALUE_PREFIX`/`ENUM_ZERO_VALUE_SUFFIX` excepted; do not rename enum values to "fix" lint.
- 2026-09-15 (WS1) — If `buf generate` fails with "Buf API token ... invalid", a stale `~/.netrc`
  entry for buf.build is being sent; run `NETRC=/dev/null make gen`. Remote plugins need no login.
- 2026-09-15 (WS1) — `@bufbuild/protobuf` v2 API: `fromJsonString(SitePlanSchema, s)`, `toBinary`,
  `fromBinary`, `equals(Schema, a, b)`; messages are plain objects, schemas are `*Schema` exports.
- 2026-09-15 (WS5) — WASM gotchas: keep `syscall/js` code to a thin adapter; put the logic in a plain
  package so it runs under `-race` (js/wasm can't). Vite module workers have no `importScripts`, so load
  Go's `wasm_exec.js` with a dynamic `import()` of a *variable* URL (a literal path makes `tsc` try to
  resolve it). `go.run(instance)` registers the exports synchronously before it awaits, so don't await
  it (main blocks in `select{}`). Node ≥ 22 runs `wasm_exec.js` + `WebAssembly.instantiate` directly —
  no jsdom needed for the integration test. `js.CopyBytesToGo` panics on non-Uint8Array args: check
  `InstanceOf` first. Add build outputs in `web/public` to ESLint ignores.
- 2026-09-15 (WS6) — `toJson()` from @bufbuild/protobuf emits lowerCamel keys by default; pass
  `{ useProtoFieldName: true }` wherever the JSON must line up with dotted bus paths or diagnostics'
  `proto_path` (snake_case). Validate bus paths against `SitePlanSchema.fields` (`fieldKind` +
  `listKind`, match `name` or `jsonName`); int64 fields are `bigint` in generated types. Under
  `vi.useFakeTimers()` never flush with `setTimeout` — drain microtasks with `await Promise.resolve()`.
- 2026-09-15 (WS4) — `core.Analyze` costs ~130 µs on the fixture, so the optimizer's 400-evaluation
  budget is ~50 ms worst case; a full T3 Optimize converges in ~40 evaluations (~8 ms). Core rejects
  `run.mode=RUN_OPTIMIZE`, so every cloned candidate must set `RUN_ANALYZE`. Core checks *pooled* firm
  supply and a phase's source readiness only — it does not cap load per source, and energy is dispatched
  cheapest-first regardless of `power_source_id`; anything that must respect per-source capacity has to
  enforce it itself. `phasing.policy.max_shortfall_mw` is applied to the hold-average shortfall
  (instantaneous is unsatisfiable whenever demand starts before any source is ready).
- 2026-09-15 (WS9) — Vite dev rewrites non-static dynamic imports to `?import` and then refuses files from `public/`; import a public asset via an absolute `new URL(path, self.location.origin).href` instead (engine.worker.ts). The harness caught this — `make harness` is the quickest end-to-end check of dev-server + worker + wasm. Harness runs archive per-step plan/result/command-log/console-errors under `harness/runs/<ts>/`; read those before guessing.
- 2026-09-15 (WS8) — Copilot/SDK gotchas: `betaZodTool` already installs a zod `parse` the tool runner
  calls inside its try/catch, so a schema failure or a thrown `Error`/`ToolError` becomes an `is_error`
  tool_result for free — throw `ToolError(message)` to control the exact content. `strict`/
  `eager_input_streaming` are not `betaZodTool` options: spread them onto the returned tool. The most
  faithful API mock is the real `Anthropic` client with an injected `fetch` that answers scripted SSE
  (`web/src/copilot/testApi.ts`) — it exercises the SDK's stream parser, runner and validation and lets
  tests assert on the actual request bodies (cache_control, tool schemas, message order). Under the
  jsdom environment `import.meta.url` is `http:`, so fs-based fixture loaders (`loadAbilene`) fail —
  import the fixture with `?raw` there. Files outside `web/` (docs, research) import fine at build time
  but need `server.fs.allow` for the dev server.
- 2026-09-15 (WS2) — `Result` carries maps (chart `meta`, `summary.extra`), so byte-identical output needs
  `proto.MarshalOptions{Deterministic: true}` — the WASM bridge and any golden/determinism test must use it.
  Power supply is checked against *facility* MW (IT × PUE), not IT MW; size fixture sources accordingly.
  Golden `Result` regenerates with `go test ./engine/core -run TestAbileneGolden -update`; review the diff.
- 2026-09-15 (WS2) — **FMA gotcha:** Go fuses `a*b+c` on arm64 but not amd64, so doubles differ in the
  last bits between a Mac and CI. Never compare golden Results with `proto.Equal`; use
  `requireProtoClose` (engine/core/helpers_test.go — protoreflect walk, 1e-9 relative on floats, exact
  otherwise, reports the first differing field path). Same for any WS3/WS4 golden.
- 2026-09-15 (WS7) — Component tests: put `// @vitest-environment jsdom` at the top of the test file
  (the global env stays `node`); `@testing-library/react` + `jsdom` are dev deps. A label that wraps an
  `Explainer` includes the tooltip text, so query controls with `getByRole(..., { name: /label/ })`
  or `[data-path="..."]`, not `getByLabelText`. Fixture JSON imports with `?raw` work in both Vite and
  Vitest, so one loader serves tests and the `/dev-site.html` dev route.
- 2026-09-15 (WS11) — A fresh worktree has no `node_modules`: run `make deps` before `vitest`, or Vite
  fails resolving `@vitejs/plugin-react` from a stray parent. Component tests that dispatch straight to
  the store (not via a click) must wrap the dispatch in `act()`; an app error renders two `role="alert"`
  nodes (Canvas banner + site view), so query with `getAllByRole`. `client.test.ts` pins the full Copilot
  tool-name list — extend it when adding a tool. Cross-Result overlays: keep one `useCompareBaseline()`
  hook (null when compare is off) so every chart's baseline prop is simply omitted, never branched on.
- 2026-09-15 (WS12) — Grounding against an external model: mirror its *inputs* field by field in a table
  (source cell → our field → value → note) and compare outputs on the basis the source itself
  computes (A.CRE's untrended column, Epoch's per-gross-MW), restating each structural difference
  explicitly (our equity-only cost basis vs K76, energy at nameplate vs utilization) instead of tuning
  inputs; pin the known gap's direction/band so the test flips when the engine changes. Gitignored
  sources (`research/sources/*.zip`) live only in the main checkout, not worktrees — unzip to the
  scratchpad; openpyxl `data_only=True` gives the cached values (the workbook's own results).
  `fixtures/*.json` are enumerated by `web/src/fixtures.ts` (Vite glob) — a new fixture needs no code,
  but `meta.plan_id` must equal the file name and it must be added to `engine/scenarios_test.go`'s
  MC/optimize table and `engine/core/fixture_test.go`'s `fixtureNames`.
