# UI / Interaction Spec

**Status:** v0.1 — 2026-09-15. The wireframe (Claude Design canvas) is the visual reference; this doc is
the behavioral spec. POC surface = **Site Feasibility**.

## Global principles
- **Persistent, view-aware Copilot.** One conversation across all tabs. A `ViewContext` (active tab,
  selected site id, current `SitePlan`, last `Result`, current selection/hover) is always available to
  the agent, so it can explain what's on screen and operate any control on it.
- **One command bus, three drivers.** Human, embedded Copilot, and the remote-control harness all emit
  the same typed commands (see `architecture.md`). No control path bypasses it.
- **Real-time & bidirectional.** Every control reads/writes the in-memory `SitePlan`; any change re-runs
  `Analyze` (WASM) and re-renders (target < 100 ms). Agent-initiated changes appear as **accept/undo
  "proposed change" cards**, so the human stays in control.
- **Assistive.** Hover explainers on every metric and control: concept + formula + benchmark + source
  (keyed to a shared glossary sourced from `research/`). Inline validation surfaces `Result.diagnostics`
  at the offending control.
- **Delightful.** Instant recompute, smooth transitions, the schematic + map animate as inputs change;
  Monte Carlo bands fade in; the phasing timeline scrubs.

## Site Feasibility view (POC)
Layout = persistent Copilot rail (left) + canvas. Canvas regions, each tagged by dimension
(Space/Time/Capital/Risk):

1. **Context map (Space).** The site in geographic context with overlays for **power** (grid/BTM/PPA
   availability), **water** (stress index), **latency** (zone to the demand it serves). Schematic in the
   artifact mock; real tile provider in production. Hover a layer → explainer.
2. **Site schematic (Space + Time).** Parametric 2D model from `Result.schematic` — data halls,
   substation, cooling yard, gas pad, expansion pads, parcel bounds, `footprint_used_pct`. **Phase-aware:
   a time scrubber reveals blocks by `energize_month`**, so the user comprehends scale + staging.
3. **Phasing lever (Time — first-class).** The primary control: add/size/schedule phases, or hit
   **"Optimize phasing"** to run the flagship optimizer against a demand ramp. Shows the demand ramp vs.
   the phased capacity step, with the shortfall/stranded areas shaded.
4. **Critical-path timeline (Time).** Gantt with the interconnection/transformer critical path and the
   energize marker; revenue starts at energization.
5. **Pro forma / LCOC (Capital).** Capex stack, LCOC, yield-on-cost; the three master levers
   (GPU-hour price, energization date, depreciation life) are prominent sliders.
6. **Risk (Risk).** Radar + **Monte Carlo bands (P10/P50/P90)** on LCOC/NPV; sensitivity tornado.
7. **Optimization panel.** Set objective + constraints + decision vars → run `Optimize` → frontier plot;
   "Apply best plan" writes the winning `SitePlan` (as an accept/undo card).

### Controls (all on the command bus)
Sliders/inputs for: target IT MW, rack density, cooling mode, PUE, power sources + availability,
phase plan, GPU-hour price, depreciation years, utilization, discount rate. Each has a hover explainer
and emits a command → re-analyze.

## Copilot behaviors
- Interprets `Result.summary` in plain language, always relating back to the big picture (the strategic
  loop in `research/02-kpi-architecture.md`: timing → moat → economics; shortage vs. underutilization).
- Guides the workflow: proposes next steps, flags the binding constraint, explains diagnostics, and
  offers to optimize.
- Operates controls on request ("bridge with gas so we energize by Q3-27") → emits commands → shows an
  accept/undo card.
- Never fabricates numbers — everything numeric comes from a `Result`.

## Remote-control harness (dev/test)
Guarded `window.__harness` over the command bus (stripped in prod):
`loadPlan(protojson)`, `getPlan()`, `getResult()`, `setControl(path,value)`, `listControls()`,
`sendCopilot(text)`, `getViewContext()`, `getCommandLog()`, `screenshot()`. This session drives it via
Playwright to run the validation cases and debug.

## Tech (to finalize in implementation)
- SPA framework choice deferred to the UI workstream (must: run WASM, command-bus architecture, protojson
  bridge to the agent, theme-aware, responsive to ~1280px min for a desktop tool).
- Charts render from `Result.charts` specs; schematic from `Result.schematic`; tables from `Result.tables`.
