# UI / Interaction Spec

**Status:** v0.2 — 2026-09-15. Updated to the SPA as built (WS6, WS7, WS8, WS11, WS13). The wireframe
(Claude Design canvas) was the visual reference; this doc is the behavioral spec. POC surface =
**Site Feasibility**.

## Global principles
- **Persistent, view-aware Copilot.** One conversation across tabs. A `ViewContext` (active tab,
  selected site id, current `SitePlan`, last `Result` summary + diagnostics, selection, baseline label
  + summary, compare flag) is derived from the store and sent with every turn, so the Copilot can explain
  what is on screen and operate any control on it.
- **One command bus, three drivers.** Human, embedded Copilot, and the remote-control harness all emit
  the same typed commands (see `architecture.md`). No control path bypasses it.
- **Real-time & bidirectional.** Every control reads/writes the in-memory `SitePlan`; any change re-runs
  `Analyze` (WASM in a worker, debounced 16 ms; sub-100 ms budget) and re-renders. Agent-initiated
  material changes appear as **accept/undo "proposed change" cards**, so the human stays in control.
- **Assistive.** Hover explainers (`Explainer`) on every metric, control, chart and toolbar action from
  the glossary in `views/site/glossary.ts` (concept + formula + benchmark + source). Inline validation
  renders `Result.diagnostics` at the offending control (matched on `proto_path`); diagnostics with no
  control on the canvas render at the top of the view.
- **Honest engine badge.** The toolbar shows `engine: wasm` or `engine: fake`; the fake engine also
  stamps a `FAKE_ENGINE` diagnostic into every Result so no screenshot can pass for a real one.

## Layout
Two regions: the **Copilot rail** (left, `aside[aria-label="Copilot"]`) and the **canvas**. The canvas
is a slim toolbar, an error banner when a command is rejected or the engine fails, the pending proposal
cards, the active tab's view (only `site` is built; the other tabs show "not part of the POC"), and a
collapsible **Result inspector** (diagnostics list + JSON trees for `summary`, `diagnostics`,
`conservation` with proto field names).

### Toolbar
| Control | Behavior |
|---|---|
| **Load fixture** | Loads a protojson `SitePlan` from `fixtures/`. On `main` this is the single "Load Abilene-1 fixture" button; PR #31 (WS12) turns it into a dropdown over every `fixtures/*.json` (`data-action="load-fixture"`). |
| **Undo / Redo** | Replay over the plan history; disabled when empty. Undo/redo never touch the baseline. |
| **Set as baseline** | Snapshots the current plan + Result as the baseline (label = the plan's `scenario_name`, else "Baseline n"); disabled without a Result. A chip shows the pinned label with a clear ×. |
| **Compare** | Toggle (`aria-pressed`), enabled only with a baseline; see Compare mode. |
| `engine:` badge | Build-time engine choice (`VITE_ENGINE`). |

## Site Feasibility view (as built, `web/src/views/site/`)
Header: site name, market · target MW · scenario, "vs. baseline: <label>" when comparing, a status
score (`OK` / `OK with warnings` / `invalid input` / `infeasible` · conservation green/FAILED), and the
four dimension chips. Regions, each a `Region` tagged by dimension (Space/Time/Capital/Risk):

1. **Context map (Space)** — a real basemap: `leafletMapProvider` (`LeafletMap.tsx`) renders
   **Esri World Light Gray Canvas** raster tiles (`World_Dark_Gray_Base` under
   `prefers-color-scheme: dark`; no API key; max zoom 16; "Tiles © Esri — Esri, HERE, Garmin,
   © OpenStreetMap contributors" attribution) under Leaflet with zoom/pan, an
   `L.control.scale()` bar and the site as a marker whose popup shows site name, market · ISO and
   lat/lng; clicking it dispatches `select` with path `site`. The toggleable **power / water /
   latency** overlays (segmented control with explainers) are drawn in real geography:
   - *latency* — nested rings at true kilometre radii for every tier the site can serve
     (metro ≈ 80 km, regional ≈ 400 km, training-remote ≈ 1,500 km; assumes ~1 ms RTT per 100 km
     of fibre with a 1.5× route factor — see `glossary.ts` `overlay.latency`); the view fits the
     outer ring.
   - *water* — a translucent tint over the ~60 km region, opacity scaled by `water_stress_index`,
     with a legend chip.
   - *power* — one marker per `power.sources[]` plus a dashed tie to the site. The plan carries no
     source coordinates, so placement is a documented schematic offset (`geo.ts`
     `powerSourcePlacement`: bearings NE/SE/SW/NW, distance by type) and every label reads
     "location illustrative"; the legend says "not surveyed".
   Tiles are fetched cross-origin by the browser; on a Leaflet `tileerror` the region shows a one-line
   notice and keeps the vector overlays on a blank map. (CARTO Positron was the intended style, but
   since 2025 every keyless CARTO tile carries an "API KEY REQUIRED" watermark — no localhost or
   non-commercial exemption — so the Positron-like Esri canvas is used instead; swapping is one URL.) `schematicMapProvider` (tile-free SVG) stays
   behind the same `MapProvider` seam for injection. Tests mock the `leaflet` module
   (`testdata/fakeLeaflet.ts`) because jsdom cannot lay a map out.
2. **Site schematic · phase reveal (Space + Time)** — parcel + blocks from `Result.schematic` (data
   halls, substation, cooling yard, gas pad, expansion pads), `footprint_used_pct`, and a **time
   scrubber** (`input[type=range]`, "time scrubber (month)") that writes `selection.month` so blocks
   reveal by `energize_month`. In compare mode the baseline's blocks are ghosted.
3. **Phasing — demand ramp vs. staged capacity (Time; first-class)** — mode select (`phasing.mode`),
   per-phase editors (`id`, IT MW, start month, energize month, power source) for EXPLICIT plans, and the
   `demand_vs_capacity` step chart with shortfall/stranded shading; tiles for demand capture,
   stranded and shortfall MW-months. The baseline's demand and capacity series are ghosted underneath
   in compare mode.
4. **Critical path — revenue starts at energization (Time)** — Gantt of the interconnection /
   transformer / construction / gas-bridge bars with the energize marker per phase.
5. **Pro forma · LCOC · master levers (Capital)** — capex stack bar, cashflow line, LCOC /
   capex / capex-per-MW / yield / NPV / IRR tiles, and the slider deck: GPU-hour price, grid energize
   month, depreciation life (the three master levers), utilization, rack density, cooling mode, PUE,
   target IT load. Each slider is a bus `setField` on its dotted path (`data-path`).
6. **Risk · Monte Carlo (P10/P50/P90) (Risk)** — risk radar from the composite score components, an
   "Enable Monte Carlo" toggle (`run.monte_carlo.enabled`), P10/P50/P90 bands on LCOC and NPV (baseline
   bands ghosted when comparing), and the sensitivity tornados for **both LCOC and NPV**.
7. **Optimization · frontier** — "Run optimize" (calls `store.optimize()`; the live plan's
   `phasing.mode` is untouched), a default-policy shortcut, objective/constraint editors, the frontier
   scatter of every evaluated candidate, `converged` / `evaluations`, and **"Apply best plan"**, which
   files an accept/undo card carrying the winner's phasing rather than applying it silently.

### Controls (all on the command bus)
Every control is a `Field` with a `data-path`, an explainer and inline diagnostics; it dispatches
`setField` (scalars/enums) so a human edit, `set_control` from the Copilot and `setControl` from the
harness are indistinguishable in the command log.

## Compare mode (WS11)
With a baseline pinned and Compare on:
- every `MetricTile` shows a signed Δ = **current − baseline** (absolute and %), coloured by the
  glossary's `betterWhen` (better / worse / same);
- charts take a `baseline` prop from one `useCompareBaseline()` hook (null when compare is off) and
  draw the baseline series **ghosted**: demand/capacity step chart, capex stack, cashflow line, Monte
  Carlo bands, schematic blocks;
- the header shows "vs. baseline: <label>"; ViewContext carries `baselineLabel`, `baselineSummary`,
  `compare`, so the Copilot cites deltas from the two summaries;
- undo/redo never change the baseline; clearing the baseline switches compare off.

## Copilot rail (WS8, WS13)
- **Header:** "Copilot", a dev-only usage line for the last turn (`cache read n · in n · out n`), and
  "viewing: <tab> · <site id>" from ViewContext.
- **Key panel / relay mode:** in BYO-key builds a masked key input ("Dev only — the key lives in this
  tab's sessionStorage… Never ship this."), with Use key / Clear. In relay builds
  (`VITE_COPILOT_RELAY`) the panel is replaced by the notice "Relay mode — key held server-side" and
  the Copilot is always enabled.
- **Thread:** user messages (the injected `<view_context>` block is hidden), assistant text rendered
  with a light markdown subset, tool calls as status chips (`name · running|done|error`, error detail
  on hover), streaming text while a turn runs, notices (transcript truncated, reply cut off, stopped)
  and a `role="alert"` banner for API errors (401/429 messages are transport-aware).
- **Proposal cards:** every pending `proposeChange` renders in the rail (and on the canvas) with the
  summary, the patch preview, and **Accept** / **Undo** (reject). Accepting applies the patch through
  the bus and re-analyzes.
- **Composer:** disabled until a key (BYO mode) and a plan exist; Send / Stop (abort).
- Transcripts persist per plan id in localStorage (size-capped; oldest turns dropped with a notice) and
  are restored on load.

## Copilot behaviors
- Interprets `Result.summary` in plain language, always relating back to the big picture (the strategic
  loop in `research/02-kpi-architecture.md`: timing → moat → economics; shortage vs. underutilization).
- Guides the workflow: proposes next steps, flags the binding constraint, explains diagnostics, and
  offers to optimize.
- Operates controls on request ("bridge with gas so we energize by Q3-27") → emits commands → shows an
  accept/undo card for material changes, edits small things directly.
- Never fabricates numbers — everything numeric comes from a `Result`; in compare mode deltas are
  computed from `resultSummary` and `baselineSummary`.

## Remote-control harness (dev/test)
Guarded `window.__harness` over the command bus (dev builds or `VITE_HARNESS=1`; absent in production):
`loadPlan`, `getPlan`, `getResult`, `setControl(path, value)`, `listControls`, `sendCopilot` /
`setCopilot`, `acceptCard` / `rejectCard`, `undo` / `redo`, `setBaseline` / `clearBaseline` /
`toggleCompare` / `getBaseline`, `getViewContext`, `getCommandLog`, `waitIdle`, `getConsoleErrors`
(`web/src/harness/api.ts`); the WS10/WS12 branches add `optimize`, `proposeChange`,
`getCopilotSnapshot` and `loadFixture`. Playwright drives it through `harness/src/session.ts`; see
`harness/README.md` and `acceptance-session.md`.

## Tech (as built)
- Vite + React 18 + TypeScript strict; `@bufbuild/protobuf` v2; charts are plain SVG components under
  `views/site/charts/` (`StepChart`, `Gantt`, `StackBar`, `LineChart`, `Bands`, `Radar`, `Tornado`,
  `Scatter`) rendering `Result.charts` specs; the schematic from `Result.schematic`; tables from
  `Result.tables`. Component tests run under Vitest + jsdom against a golden `Result` fixture.
- Desktop tool, ~1280 px minimum; theme follows the system.
