# Implementation Plan — Fan-out Work Breakdown

**Status:** v0.1 — 2026-09-15. Built for a Fable-orchestrated fan-out to subagent workers after this
session is compacted. Every worker follows the **`development` skill** (`.claude/skills/development/`).
Source of truth: `docs/architecture.md`, `docs/proto/engine.proto`, `docs/engine-design.md`,
`docs/ui-spec.md`. Scope: single-site Site-Feasibility POC.

## Orchestration rules
- **Proto is gated.** Only the orchestrator approves `engine.proto` changes; workers flag via SendMessage.
- **Two parallel tracks** after the shared foundation: **Engine track** (Go/WASM) and **UI track**
  (SPA). They meet at the proto contract and the WASM boundary.
- Workers write tests first, keep to their package/dir boundary, and report against the Definition of Done.
- Recommended concurrency: ~3–5 workers at a time; capable model for Go/TDD + optimizer work.

## Dependency graph
```
WS0 scaffold ─▶ WS1 proto ─┬─▶ WS2 core ─┬─▶ WS3 risk ─┐
                           │             ├─▶ WS4 optimizer ─┤
                           │             └─▶ WS5 wasm bridge ┼─▶ WS10 validation
                           └─▶ WS6 SPA+bus ─┬─▶ WS7 site view ┤
                                            ├─▶ WS8 copilot   ┤
                                            └─▶ WS9 harness ──┘
```

## Workstreams

### WS0 — Repo & toolchain scaffold  *(serial, first; blocks all)*
- Go module, dir layout per `engine-design.md`, `buf` config, `Makefile`/scripts, CI (test+vet+staticcheck
  +coverage), WASM build target, SPA scaffold placeholder.
- **DoD:** `go test ./...` runs green on an empty skeleton; WASM target builds; CI green.

### WS1 — Proto & generated types  *(serial, after WS0; blocks WS2, WS6)*
- Finalize `engine.proto`, `buf generate` Go types, and a JS/TS binding for the SPA (protobuf-es or
  protojson helpers). Round-trip test (marshal/unmarshal).
- **DoD:** generated types compile in Go + JS; golden protojson fixture round-trips.

### WS2 — Engine core  *(engine track; after WS1)*
- Implement `core`: validate → sizing → schedule/phasing → capex → opex → revenue → cashflow → metrics →
  **conserve** → render (tables/charts/schematic). LCOC per `engine-design.md`.
- **DoD:** all conservation checks pass on golden fixtures; table-driven tests per module; deterministic;
  `Analyze` < 100 ms on the reference plan.

### WS3 — Risk: Monte Carlo + sensitivity  *(engine track; after WS2)*
- Seeded MC over `InputDistribution`s → P10/P50/P90 + histograms; one-at-a-time sensitivity → tornado.
- **DoD:** reproducible (seed → identical); 1k iters < ~1 s in WASM; tornado ordering test.

### WS4 — Optimizer: phasing-to-demand (flagship)  *(engine track; after WS2)*
- `Optimize` loop over decision vars/constraints; staged search (categorical enumerate + continuous
  refine) with a demand-tracking heuristic seed; objectives incl. `MIN_STRANDED_PLUS_LCOC`.
- **DoD:** beats naive single-shot on the objective; feasible + conservation-valid winner; deterministic;
  frontier returned.

### WS5 — WASM boundary + JS bridge  *(engine track; after WS2, parallel with WS3/WS4 using a core stub)*
- Export `Analyze`/`Optimize` (bytes→bytes) via `syscall/js`; panic-recover→diagnostic; JS loader.
- **DoD:** SPA can call the engine and get a `Result`; error path returns a diagnostic, not a crash.

### WS6 — SPA scaffold + command bus + WASM integration  *(UI track; after WS1)*
- SPA framework decision; the **command bus** (typed commands over in-memory `SitePlan` + selection +
  event log); WASM load + re-analyze cycle; protojson bridge; ViewContext.
- **DoD:** a control change dispatches a command → re-analyzes → re-renders a raw `Result`; command log works.

### WS7 — Site Feasibility view  *(UI track; after WS6 + engine outputs)*
- Render map (schematic overlays: power/water/latency), parametric **site schematic** with phase-reveal
  scrubber, phasing lever + demand-ramp chart, critical-path timeline, pro forma/LCOC with master-lever
  sliders, risk radar + **Monte Carlo bands** + tornado, optimization panel + frontier. Hover explainers.
- **DoD:** every canvas region renders from `Result`; controls live + bidirectional; explainers present;
  matches `ui-spec.md`.

### WS8 — Embedded Copilot integration  *(UI track; after WS6)* — see `agent-integration.md`
- `@anthropic-ai/sdk` in-browser, **`claude-sonnet-5`**, client-side tool-use loop (beta tool runner);
  tools over the command bus (`edit_site_plan`, `run_analyze`/`run_optimize`, `set_control`,
  `propose_change`, `explain`); accept/undo cards; view-aware context; "numbers only from Result";
  prompt caching (stable system prefix cached, volatile ViewContext after the breakpoint).
- **Inference transport: BYO-key dev mode** (`dangerouslyAllowBrowser`) for the POC; relay deferred.
- **DoD:** agent operates the visible view, interprets results, self-corrects from diagnostics; cache
  reads confirmed (`cache_read_input_tokens > 0`).

### WS9 — Remote-control harness  *(UI track; after WS6)*
- `window.__harness` over the command bus (dev build only); Playwright driver runnable from a session;
  screenshot + command-log capture.
- **DoD:** this session can load a plan, drive controls, read results, and screenshot headlessly.

### WS10 — Validation cases  *(last; after WS4, WS7, WS8, WS9)*
- Implement the 3 sessions in `validation-cases.md` as harness scripts; iterate agent+engine until the
  quality bar is met.
- **DoD:** all 3 cases pass their assertions; screenshots + logs archived.

## Milestones
- **M1** — WS0+WS1+WS2: engine analyzes the reference plan, conservation green.
- **M2** — WS3+WS4: risk + flagship optimizer working.
- **M3** — WS5+WS6+WS7: SPA renders Site Feasibility live from the WASM engine.
- **M4** — WS8+WS9: Copilot operates the view; this session can remote-drive it.
- **M5** — WS10: validation cases pass; POC demo-ready.

## First fan-out wave (suggested)
WS0 (serial) → then WS1 → then launch **WS2 (engine)** and **WS6 (SPA scaffold)** in parallel; WS5 bridges
early with a core stub so the UI track isn't blocked. WS3/WS4 follow WS2; WS7/WS8/WS9 follow WS6.
