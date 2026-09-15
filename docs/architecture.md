# System Architecture — AI-Lab Capacity Planner

**Status:** v0.1 — 2026-09-15. Authored before implementation. This doc + the proto contract are the
source of truth for the fan-out build. Read `product-brief.md` for the product framing and
`research/02-kpi-architecture.md` for the analytical spine.

## Locked decisions (2026-09-15)

| Decision | Choice |
|---|---|
| Flagship optimization | **Phasing-to-demand-ramp** (minimize stranded-capacity carry + LCOC) |
| v1 engine scope | **Single site** (feasibility + phasing + optimizer). Portfolio deferred. |
| Fidelity | **Deterministic + sensitivity + Monte Carlo** risk (P10/P50/P90) |
| Map | **Real tile provider in the production SPA**; schematic-only in the artifact mock |
| POC surface | **Site Feasibility** view (where the engine POC lands) |

## Components & the stable seam

```
┌────────────────────────────── SPA (browser) ──────────────────────────────┐
│  Persistent, view-aware Copilot rail   │   Canvas (per view)               │
│  - one conversation across all views   │   - Site Feasibility (POC):       │
│  - knows: active tab, selected site,   │       map · schematic · timeline  │
│    current SitePlan, last Result       │       · pro forma · risk · phasing│
│  - proposes changes as accept/undo     │   - live, bidirectional controls  │
│    cards; interprets Result metrics    │   - hover explainers on metrics   │
└─────────────┬──────────────────────────────────────┬──────────────────────┘
              │ protojson (agent edits SitePlan)      │ SitePlan (binary proto)
              ▼                                        ▼
      ┌───────────────┐                     ┌────────────────────────────┐
      │  Agent runtime │  ──── calls ───▶    │  Engine (Go → WASM)        │
      │  (LLM + tools) │                     │  Analyze(SitePlan)→Result  │
      │                │  ◀── Result ────    │  Optimize(...)→candidates  │
      └───────────────┘   summary metrics    │  pure · deterministic core │
                          + diagnostics       │  + Monte Carlo + optimizer │
                                              └────────────────────────────┘
```

**The seam is `engine.proto`:** `SitePlan` in → `Result` out. Everything the UI renders and everything
the agent interprets is a field of `Result`. This is what lets the engine team and the UI team build in
parallel against a frozen contract.

### SPA (view layer)
- **Persistent Copilot** across all tabs; a `ViewContext` object (active tab, selected site id, current
  `SitePlan`, last `Result`, current selection) is always in the agent's context so guidance is
  contextual and it can operate any control on the visible view.
- **Bidirectional, real-time controls:** every control reads/writes the in-memory `SitePlan`; a human
  edit and an agent tool-call are the same mutation → the SPA re-runs `Analyze` (WASM, sub-100ms target)
  and re-renders. Agent changes surface as **accept/undo "proposed change" cards**.
- **Assistive & delightful:** hover explainers on every metric (concept + formula + source, pulled from
  a shared glossary keyed to `research/`), inline validation from `Result.diagnostics`, smooth
  recompute, live-updating schematic + map.

### Engine (compute layer)
- **Pure function**, no I/O, no globals, no clock/RNG except via the proto (seed passed in). Output is a
  deterministic function of the input bytes. This is what makes it testable, WASM-safe, and reproducible.
- **Three layers:** (1) deterministic analytical **core** with conservation checks; (2) **Monte Carlo**
  wrapper (N seeded draws over declared input distributions → P10/P50/P90 + histograms); (3)
  **optimizer** wrapper (searches declared decision vars for the declared objective under constraints,
  calling the core repeatedly).
- **WASM**: `Analyze(bytes) []byte` and `Optimize(bytes) []byte` exported to JS; binary proto across the
  boundary; protojson used only agent-side.

### Agent ↔ engine protocol
- Agent maintains the `SitePlan` as **protojson**, edits it in response to user goals, calls the WASM
  engine, and reads `Result.summary_metrics` + `Result.diagnostics`.
- **Diagnostics are the correction channel:** every error/warning carries a `proto_path`, `expected`,
  `actual`, and human message so the agent can fix the exact field and re-run. See `engine-design.md`.

### The command bus (one mutation path for three drivers)
All state changes flow through a single **command bus** in the SPA — a typed dispatch layer over the
in-memory `SitePlan` + UI selection. Three drivers emit the same commands, so behavior is identical
however it's triggered:
1. **Human** — direct manipulation of controls.
2. **Embedded Copilot** — the in-app agent's tool calls.
3. **External remote-control harness** — this developer session (below).

Commands are named, serializable, and logged (an event log the harness can assert against and replay).
A mutation → re-run `Analyze` → re-render is the same cycle for all three.

### Developer remote-control & test harness (this session drives the app)
This Claude Code session must be able to **operate and debug the running SPA itself** — not just the
embedded Copilot. Design:
- The SPA (dev/test build) exposes a guarded **`window.__harness`** API over the command bus:
  `loadPlan(protojson)`, `getPlan()`, `getResult()`, `setControl(path, value)`, `listControls()`,
  `sendCopilot(text)`, `getViewContext()`, `getCommandLog()`, `screenshot()`.
- This session drives headless **Chromium via Playwright** (run through Bash) against the locally-served
  SPA, and can also call the engine WASM directly for lower-level checks.
- This is the substrate for the **validation use cases** (`validation-cases.md`): a script drives the
  real agent + engine loop end-to-end, captures results/screenshots, and asserts on behavior and output
  quality — the session can then debug failures by reading the command log and diagnostics.
- Same-origin, dev-only: `window.__harness` is stripped from production builds; it never bypasses the
  command bus (so tests exercise real code paths).

## Data flow (one interaction)
1. User (or agent) changes a control → SPA mutates `SitePlan`.
2. SPA serializes to binary proto → `wasm.Analyze` → `Result` bytes → deserialize.
3. SPA renders `Result.tables/charts/schematic/summary_metrics`; agent narrates `summary_metrics` and
   surfaces any `diagnostics`.
4. For "optimize this," agent sets `objective`/`constraints`/`decision_vars`, calls `wasm.Optimize`,
   interprets the returned frontier, and proposes the best plan as an accept/undo card.

## Non-goals for v1
Portfolio roll-up; real financing waterfall; real map tiles in the mock; server-side compute; multi-user
live co-editing; persistence beyond the SPA's own state.

## Tech choices
- **Engine:** Go (idiomatic, TDD), `google.golang.org/protobuf`, compiled with `GOOS=js GOARCH=wasm`.
- **Proto:** proto3, `buf` for lint/generate. Single `engine.proto` (see `docs/proto/`).
- **SPA:** framework TBD in `ui-spec.md`; must run the WASM module, route all state through the command
  bus, and speak protojson to the agent.
- **Remote-control harness:** Playwright (Node) driving headless Chromium against the locally-served SPA,
  plus the `window.__harness` API over the command bus. Runs from this session via Bash.
- **Determinism:** all randomness seeded via `RunOptions.monte_carlo.seed`; no wall-clock in the core —
  which is also what makes harness-driven validation runs reproducible.
