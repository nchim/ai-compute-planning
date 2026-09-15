# UI / Interaction Spec

**Status:** v0.3 — 2026-09-15. Updated to the SPA as built (WS6–WS8, WS11–WS13 and the UX batch
PRs #40–#52). The wireframe (Claude Design canvas) was the visual reference; this doc is the
behavioral spec. POC surface = **Site Feasibility**.

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
  stamps a `FAKE_ENGINE` diagnostic into every Result so no screenshot can pass for a real one. The
  same badge is the **global engine activity indicator** (below).
- **One error banner.** A rejected command, an engine failure or a refused/infeasible optimization
  shows once, in the canvas toolbar banner (`role="alert"`, with Dismiss); the site view renders no
  copy of its own (PR #50).

## Layout
Two regions: the **Copilot rail** (left, `aside[aria-label="Copilot"]`) and the **canvas**, separated
by a **drag handle** (`role="separator"`, `RailResizer`): the rail is 280–720 px wide (default 320),
double-click resets, arrow keys nudge by 16 px, and the width persists per browser in
`localStorage["rail.width"]` (read through the `--rail-width` CSS variable). The canvas is a slim
toolbar, the error banner, the **latest proposal's headline** (see Proposal placement), the active
tab's view (only `site` is built; the other tabs show "not part of the POC"), and a collapsible
**Result inspector** (diagnostics list + JSON trees for `summary`, `diagnostics`, `conservation` with
proto field names).

### Toolbar
| Control | Behavior |
|---|---|
| **Load fixture** | Dropdown over every `fixtures/*.json` (`data-action="load-fixture"`); loads the protojson `SitePlan`. |
| **Undo / Redo** | Replay over the plan history; disabled when empty. Undo/redo never touch the baseline. |
| **Set as baseline** | Snapshots the current plan + Result as the baseline (label = the plan's `scenario_name`, else "Baseline n"); disabled without a Result. A chip shows the pinned label with a clear ×. |
| **Compare** | Toggle (`aria-pressed`), enabled only with a baseline; see Compare mode. |
| `engine:` badge | Build-time engine choice (`VITE_ENGINE`) plus live activity: `engine: wasm · analyzing…` / `· optimizing…` with a spinner (`data-activity`), and a 2 px progress sweep under the toolbar while either runs. It is driven by `state.engine` (derived store state, never in the command log), so a control edit, a Copilot tool and the optimize buttons all light it the same way. |
| **Reset** (in the rail header) | `data-action="reset-session"`; shown whenever a plan is loaded, disabled mid-turn. After a confirm it forgets the Copilot conversation for this plan (memory + localStorage), dispatches the `reset` command (plan edits, results, proposals, baseline/compare, selection, undo history all go) and reloads the pristine fixture when the plan id names one (`web/src/session/reset.ts`). |

## Site Feasibility view (as built, `web/src/views/site/`)
Header: site name, market · target MW · scenario, "vs. baseline: <label>" when comparing, a status
score (`OK` / `OK with warnings` / `invalid input` / `infeasible` · conservation green/FAILED), and the
four dimension chips. Regions, each a `Region` tagged by dimension (Space/Time/Capital/Risk):

1. **Context map (Space)** — a real basemap: `leafletMapProvider` (`LeafletMap.tsx`) renders
   **Esri World Light Gray Canvas** raster tiles (`World_Dark_Gray_Base` under
   `prefers-color-scheme: dark`; no API key; max zoom 16; "Tiles © Esri — Esri, HERE, Garmin,
   © OpenStreetMap contributors" attribution) under Leaflet with zoom/pan, an
   `L.control.scale()` bar and the site as a marker whose popup shows site name, market · ISO and
   lat/lng; clicking it dispatches `select` with path `site`. The **power / water / latency**
   overlays are **always on** (no toggles: the map is a picture of the site's context, not a layer
   editor) and drawn in real geography, with a **legend** under the map carrying one `Explainer` per
   layer:
   - *latency* — nested rings at true kilometre radii for every tier the site can serve
     (metro ≈ 80 km, regional ≈ 400 km, training-remote ≈ 1,500 km; assumes ~1 ms RTT per 100 km
     of fibre with a 1.5× route factor — see `glossary.ts` `overlay.latency`); the view fits the
     outer ring. Legend: "serves <tier> · ≈<km>".
   - *water* — a translucent tint over the ~60 km region, opacity scaled by `water_stress_index`.
     Legend: "stress index n.nn" with a swatch at the same opacity.
   - *power* — one marker per `power.sources[]` plus a dashed tie to the site. The plan carries no
     source coordinates, so placement is a documented schematic offset (`geo.ts`
     `powerSourcePlacement`: bearings NE/SE/SW/NW, distance by type) and every label reads
     "location illustrative"; the legend says "locations not surveyed; placement illustrative".
   The map **recenters on every fixture switch** (`invalidateSize()` before `fitBounds`, because
   Leaflet caches the container size) and a `ResizeObserver` refits to the last bounds whenever the
   canvas reflows (rail resize, window resize). Tiles are fetched cross-origin by the browser; on a
   Leaflet `tileerror` the region shows a one-line notice and keeps the vector overlays on a blank
   map. (CARTO Positron was the intended style, but since 2025 every keyless CARTO tile carries an
   "API KEY REQUIRED" watermark — no localhost or non-commercial exemption — so the Positron-like Esri
   canvas is used instead; swapping is one URL.) `schematicMapProvider` (tile-free SVG) stays behind
   the same `MapProvider` seam for injection. Tests mock the `leaflet` module
   (`testdata/fakeLeaflet.ts`) because jsdom cannot lay a map out.
2. **Site schematic · phase reveal (Space + Time)** — parcel + blocks from `Result.schematic` (data
   halls, substation, cooling yard, gas pad, expansion pads; the engine wraps them into rows inside
   the usable rectangle, see `engine-design.md`), a header with the **parcel chip** ("400 acres ·
   300 usable", `data-metric="parcel_acres"`) and the `footprint_used_pct` chip, and a **time
   scrubber** (`input[type=range]`, "time scrubber (month)") that writes `selection.month` so blocks
   reveal by `energize_month`. In compare mode the baseline's blocks are ghosted. The SVG's user unit
   is the metre, so strokes are `non-scaling-stroke`, labels live in a group counter-scaled to 1 px
   units (constant 11 px on any parcel; measured via ResizeObserver) and are dropped when the block
   is narrower than the text; setbacks are hatched strips. **Block card:** hovering a block previews
   a card, clicking pins it (× unpins): kind, phase + IT MW, energize month/quarter, footprint in
   m and acres (% of parcel), an estimated rack count for halls, and an **Explain →** button that
   sends a ready-made question about that block to the Copilot through `useCopilotSend()`
   (disabled while no Copilot is available).
3. **Phasing — demand ramp vs. staged capacity (Time; first-class)** — mode select (`phasing.mode`,
   offering `SINGLE_SHOT` and `EXPLICIT` only: optimizing is an action, not a plan state; a plan
   that still carries `OPTIMIZE` gets a notice with a "run the optimizer" way out), per-phase editors
   ("Phase id", "IT load (MW)", "Construction start (month)", "Energize (month)", "Power source id")
   each with a **× delete** (`removeAt("phasing.phases", i)`, undoable) and **+ Add phase**, and the
   `demand_vs_capacity` step chart with shortfall/stranded shading; tiles for demand capture,
   stranded and shortfall MW-months. The baseline's demand and capacity series are ghosted underneath
   in compare mode. Two more states: a **blank state** when the Result has no phasing chart
   ("No phasing plan yet" — add phases by hand or optimize, with a button) and a **running panel**
   (spinner + what the optimizer is doing) while `state.engine.optimizing`. The region header's
   **Optimize phasing** button calls `store.optimize()`.
4. **Critical path — revenue starts at energization (Time)** — Gantt of the interconnection /
   transformer / construction / gas-bridge bars with vertical month markers for `grid` (the plan's
   `grid_energize_month`) and `energize` (`summary.time_to_energize_months`). **Marker labels never
   overlap** (`layoutMarkers`): markers on the same month merge into one label ("grid · energize m30
   · Q3-28"), markers closer than 90 px stack on a second line, and a label within 80 px of the
   right edge is anchored to the left of its line.
5. **Pro forma · LCOC · master levers (Capital)** — LCOC / capex (with $/MW sub) / yield / NPV /
   IRR / time-to-energize tiles, capex stack bar, the annual net **cashflow line** (stroked in the
   Capital colour — it was invisible before #48), the capex table, and the slider deck: GPU-hour
   price, grid energize month, depreciation life (the three master levers), utilization, rack
   density, cooling mode, PUE, target IT load. Each slider is a bus `setField` on its dotted path
   (`data-path`). **Engine tables** are formatted by column unit suffix (`resultAccess.ts`
   `formatCell`: `_usd` → money, `_pct` → one-decimal percent, `_mw` → "n MW", `_month(s)` → "m n",
   else thousands separators) with humanized headers (`columnLabel`: "capex per MW", "share");
   numbers are right-aligned with tabular figures.
6. **Risk · Monte Carlo (P10/P50/P90) (Risk)** — risk radar from the composite score components, an
   "Enable Monte Carlo" toggle (`run.monte_carlo.enabled`), P10/P50/P90 bands on LCOC and NPV (baseline
   bands ghosted when comparing), and the sensitivity tornados for **both LCOC and NPV**.
7. **Optimization · frontier** — "Run optimize" (calls `store.optimize()`; the live plan is
   untouched), a **Set default policy** shortcut when the plan has none (4 phases · 25–100 MW · ≥ 6 mo
   apart · shortfall uncapped — the same default the store applies silently to the optimizer's
   candidate, so Optimize always yields a plan), objective/policy/constraint/decision-var editors,
   the frontier scatter of every evaluated candidate, `converged` / `evaluations`, and **"Apply best
   plan"**, which files an accept/undo card carrying the winner's phasing rather than applying it
   silently. A refused or infeasible run keeps the last good Result on screen and explains itself in
   the toolbar banner (first ERROR diagnostic's code, message and hint).

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

## Copilot rail (WS8, WS13, #41–#52)
- **Header:** "Copilot", a small dot while session sharing is on, a dev-only usage line for the last
  turn (`cache read n · in n · out n`), "viewing: <tab> · <site id>" from ViewContext, and the
  **Reset** button (see Toolbar).
- **Share session with developer:** a checkbox row under the header (only when a `SessionShare` is
  provided in `main.tsx`) with a "?" popover saying exactly what leaves the browser (plan edits,
  Copilot questions and answers, result summaries, errors — never the API key). Default **on in the
  relay build, off in BYO-key dev**; persisted in `localStorage["share.session"]`. See
  `deploy/cloudrun.md` "Observing tester sessions" and `web/src/telemetry/`.
- **Key panel / relay mode:** in BYO-key builds a masked key input ("Dev only — the key lives in this
  tab's sessionStorage… Never ship this."), with Use key / Clear. In relay builds
  (`VITE_COPILOT_RELAY`) the panel is replaced by the notice "Relay mode — key held server-side" and
  the Copilot is always enabled.
- **Thread:** user messages (the injected `<view_context>` block is hidden), assistant text rendered
  as **real markdown** (`Markdown.tsx`: react-markdown + remark-gfm — tables scroll horizontally
  inside the rail, headings, lists, code, blockquotes; links open in a new tab with
  `noopener`; raw HTML in model output is never rendered), tool calls as status chips
  (`name · running|done|error`, error detail on hover), streaming text while a turn runs, notices
  (transcript truncated, reply cut off, stopped, conversation cleared) and a `role="alert"` banner for
  API errors (401/429 messages are transport-aware).
- **Activity indicator:** while a turn runs and nothing is streaming yet, the last item in the thread
  is a pulsing "Thinking" / "Running <tool>" line (`role="status"`, `data-activity`) with the
  elapsed seconds after 3 s. It follows `snapshot.activity` (`idle | thinking | writing | tool`),
  which the client updates from stream events: a `tool_use` block start → `tool`, a finished tool →
  `thinking`, the first text delta → `writing`.
- **Proposal placement:** proposals are part of the conversation. In the rail every proposal renders
  **in order after the messages and before the activity indicator**: a pending one is a card with
  "Proposed: <summary>", the patch listing behind an "N changes" toggle, and **Accept** / **Undo**
  (reject); a settled one collapses to one line ("Accepted · summary" / "Undone · summary") with the
  same toggle. The **canvas shows only the newest proposal's headline** (summary, change count,
  Accept/Undo while pending, else its status) and notes how many earlier proposals live in the
  thread. Accepting applies the patch through the bus and re-analyzes.
- **Composer:** a textarea that **grows with the draft** (up to 8 lines, then scrolls); **Enter sends,
  Shift+Enter inserts a newline**; placeholder "Ask or instruct… (Shift+Enter for a new line)".
  Disabled until a key (BYO mode) and a plan exist; Send / Stop (abort).
- Transcripts persist per plan id in localStorage (size-capped; oldest turns dropped with a notice) and
  are restored on load; `Copilot.clear()` forgets the current plan's transcript (used by Reset; refuses
  mid-turn).

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
`loadPlan`, `loadFixture(name)`, `getPlan`, `getResult`, `setControl(path, value)`, `listControls`,
`optimize`, `proposeChange(summary, patch)`, `sendCopilot(text, {effort?})` / `setCopilot` /
`getCopilotSnapshot`, `acceptCard` / `rejectCard`, `undo` / `redo`, `setBaseline` / `clearBaseline` /
`toggleCompare` / `getBaseline`, `getViewContext`, `getCommandLog`, `waitIdle`, `getConsoleErrors`
(`web/src/harness/api.ts`). Playwright drives it through `harness/src/session.ts`; see
`harness/README.md` and `acceptance-session.md`. The rail registers the live Copilot both with the
harness (`setCopilot`) and with the in-app `CopilotHandleProvider`, so a harness `sendCopilot` and a
schematic "Explain →" click take the same path.

## Tech (as built)
- Vite + React 18 + TypeScript strict; `@bufbuild/protobuf` v2; charts are plain SVG components under
  `views/site/charts/` (`StepChart`, `Gantt`, `StackBar`, `LineChart`, `Bands`, `Radar`, `Tornado`,
  `Scatter`) rendering `Result.charts` specs; the schematic from `Result.schematic`; tables from
  `Result.tables`; Leaflet 1.9 for the map; react-markdown 10 + remark-gfm 4 for the chat. Component
  tests run under Vitest + jsdom against a golden `Result` fixture.
- Desktop tool, ~1280 px minimum; theme follows the system.
