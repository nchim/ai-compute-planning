---
name: development
description: Shared feature-development process for the AI-Lab Capacity Planner (Go/WASM engine, protobuf contract, SPA, remote-control harness). Invoke or read before doing ANY implementation work on this project — it defines the TDD + conservation + proto-contract discipline every worker follows. Also a LIVING doc: contribute improvements as you learn.
---

# Development Skill — AI-Lab Capacity Planner

Shared process for everyone building this project (orchestrator + subagent workers). Follow it for every
feature. **This file is living: improve it as you learn (see "Improve this skill").**

## Read first (source of truth)
- `docs/architecture.md` — components + the command-bus seam + remote-control harness.
- `docs/proto/engine.proto` — THE contract (`SitePlan → Result`). Do not diverge from it.
- `docs/engine-design.md` — engine internals, conservation checks, Monte Carlo, optimizer.
- `docs/ui-spec.md` — UI behavior, command bus, Copilot, `window.__harness`.
- `docs/implementation-plan.md` — workstreams, tasks, dependencies, your assignment.
- `research/02-kpi-architecture.md` — the analytical/strategic spine (LCOC, the four dimensions,
  shortage-vs-underutilization). `docs/product-brief.md` for product framing.

## Non-negotiable rules
1. **The proto is the contract.** Never change `engine.proto` unilaterally. If a change is needed, STOP
   and flag the orchestrator (SendMessage to `main`) — a proto change ripples to engine + UI + agent.
   When approved, update the proto doc, regenerate, and note it in the plan.
2. **TDD.** Write failing tests first. Table-driven tests per module; golden fixtures in `testdata/`;
   conservation checks as property tests over randomized valid inputs.
3. **Conservation is mandatory.** A feature is NOT done if any `ConservationCheck` fails on the golden
   fixtures. Time, land, capital, power, MW must balance (see `engine-design.md`).
4. **Determinism.** No wall-clock, no ambient RNG, no map-iteration-order dependence. All randomness is
   seeded from `run.monte_carlo.seed`. Same input+seed → byte-identical `Result`.
5. **Purity.** The engine core has no I/O, no globals. `Analyze`/`Optimize` are pure functions of the
   input proto. No panics cross the WASM boundary (recover → diagnostic).
6. **Verbose diagnostics.** Every error/warning carries `code`, `proto_path`, `expected`, `actual`,
   `hint` so the agent can self-correct. Add a stable `code` for each new failure mode.
7. **UI goes through the command bus.** No control (human, Copilot, or harness) bypasses it. The agent
   states no number that isn't from a `Result`.
8. **Idiomatic Go.** `gofmt`, `go vet`, `staticcheck` clean. Small packages, wrapped errors, no premature
   abstraction. Match the layout in `engine-design.md`.

## Per-task workflow
1. Read your task in `implementation-plan.md` + the relevant docs above.
2. Write the failing test(s) first.
3. Implement the smallest change that passes; keep within your workstream's package boundaries.
4. Run: `go test ./...`, `go vet ./...`, `staticcheck ./...`; for engine changes also run the
   conservation + determinism tests.
5. If you touched the contract or a shared interface: update the relevant doc in the same change.
6. Self-review against the Definition of Done.
7. Report back concisely: what changed, tests added, checks passing, and anything the orchestrator or
   another workstream needs to know.

## Definition of Done
- [ ] Tests written first and passing; coverage not reduced.
- [ ] `gofmt`/`go vet`/`staticcheck` clean.
- [ ] Conservation checks pass; determinism test passes (engine work).
- [ ] New failure modes have coded, `proto_path`'d diagnostics.
- [ ] Docs updated if any contract/interface changed.
- [ ] No proto change without orchestrator sign-off.
- [ ] Change is scoped to the assigned workstream; no drive-by edits elsewhere.

## Commands (fill in as the toolchain lands)
- Engine tests: `go test ./engine/...`
- Lint: `go vet ./... && staticcheck ./...`
- WASM build: `GOOS=js GOARCH=wasm go build -o web/engine.wasm ./engine/wasm`
- Proto regen: `buf generate` (config in the engine workstream)
- Harness/validation: (added by the harness workstream)

## Improve this skill (living doc)
When you learn something reusable — a gotcha, a better pattern, a command that works — **append a dated
bullet to the Playbook below.** Keep entries short and factual. Do not delete or rewrite others' entries;
add yours. If you find a rule here is wrong or outdated, flag the orchestrator rather than silently
changing a non-negotiable rule.

### Playbook (append-only, dated)
- 2026-09-15 (orchestrator) — Initial skill. Proto contract + conservation-first + TDD are the backbone;
  keep the engine core pure so Monte Carlo (1k iters) and the optimizer stay fast in WASM.
