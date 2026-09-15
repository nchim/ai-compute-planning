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
- Harness: `cd harness && npm test` (placeholder until WS9; then `npx playwright test` · acceptance: `npm run acceptance -- --copilot=scripted`)

## Improve this skill (living doc)
When you learn something reusable — a gotcha, a better pattern, a command that works — **append a dated
bullet to the Playbook below.** Keep entries short and factual. Do not delete or rewrite others' entries.
If a rule here is wrong or outdated, say so in your PR rather than silently changing a non-negotiable.

### Playbook (append-only, dated)
- 2026-09-15 (orchestrator) — Initial skill. Proto contract + conservation-first + TDD are the backbone;
  keep the engine core pure so Monte Carlo (1k iters) and the optimizer stay fast in WASM.
- 2026-09-15 (orchestrator) — Added the code-quality bar (concise/maintainable, fail early, all errors
  bubble to the agent, no data races) and the worktree→PR workflow. Engine has no goroutines by rule.
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
- 2026-09-15 (WS7) — Component tests: put `// @vitest-environment jsdom` at the top of the test file
  (the global env stays `node`); `@testing-library/react` + `jsdom` are dev deps. A label that wraps an
  `Explainer` includes the tooltip text, so query controls with `getByRole(..., { name: /label/ })`
  or `[data-path="..."]`, not `getByLabelText`. Fixture JSON imports with `?raw` work in both Vite and
  Vitest, so one loader serves tests and the `/dev-site.html` dev route.
