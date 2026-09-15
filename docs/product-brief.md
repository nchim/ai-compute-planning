# Product Brief — AI-Lab Data Center Capacity Decision-Support Tool

**Status:** v0.2 — 2026-09-15. Framework-first. The single-site POC is built and deployed for testers
(WS1–WS9, WS11, WS13 merged; the acceptance session WS10 and the grounding scenarios WS12 are open
PRs; fidelity follow-ups #28–#30 in flight). Portfolio, scenario and demand tabs remain greyed.

## One-liner
A decision-support cockpit that helps an **AI lab** plan data-center capacity, run **site feasibility
studies**, and explore **what-if scenarios at site and portfolio level** — as a collaboration between
the user and an **embedded, research-literate agent** that calls custom math tools (pro formas, system
sizing, floor planning).

## Primary user & job
- **User:** an AI-lab capacity/infrastructure planner (strategy + real-estate + compute).
- **Job-to-be-done:** decide *where, when, how much, and how flexibly* to add compute capacity — and
  defend it — against demand projections and the shortage/underutilization asymmetry.

## The agent (embedded copilot)
- Carries the accumulated research knowledge (see `research/`) — power/energization, supply chain,
  cooling/density, unit economics, depreciation, siting, speed-to-market, value-capture/overbuild,
  agility, demand-moat/capacity-risk asymmetry.
- Calls **custom tools** for the actual math: pro forma / LCOC, system sizing (power/cooling/rack),
  floor planning, scenario & sensitivity, portfolio roll-up. (Engine is a *separate component* — spec
  later.)
- Aware of context: the customer's **existing portfolio**, **demand projections by geography** (latency
  is a key location driver), and **compute design/architecture** specifics.

## The four dimensions the UI must make legible
1. **Space** — geography & latency zones; site floor plan; power/cooling system sizing; rack layout.
2. **Time** — energization critical path; development & phasing timeline; demand ramp; refresh cycles.
3. **Capital** — capex/opex, LCOC, yield-on-cost/returns, financing; per-MW and per-fleet.
4. **Risk** — energization/interconnection risk, utilization vs. shortage asymmetry, obsolescence/
   agility, demand-moat/credit quality, concentration/correlation.

## Core analytical spine (from research → KPI architecture `research/02-kpi-architecture.md`)
- **Anchor economics:** LCOC (levelized cost of compute) + yield/dev-spread; utilization as linchpin.
- **Competitive layer (dominant):** timing/demand-capture, agility/adaptability, demand-moat durability.
- **Capacity-risk asymmetry:** cost of being short (competitive, large, irreversible) vs. long
  (economic, bounded, recoverable via merchant sell-down); capacity measured *relative to own demand*.

## UI concept
- **SPA**, two-region layout: a **primary agent chat rail** + a **canvas** that renders metrics,
  underlying computations (inspectable), and graphical site/portfolio representations.
- Canvas is the shared workspace the agent draws into (tables, charts, maps, floor plans, timelines).

## Proposed v1 artboards (wireframe — low-fi, grey out future modules)
1. **Portfolio dashboard** — map (space/latency) + portfolio scorecard across Space/Time/Capital/Risk +
   site list + demand-vs-capacity gap summary.
2. **Site feasibility** — one site scored on all four dimensions: energization timeline, system sizing +
   floor plan, pro forma/LCOC, risk radar; agent drives the analysis.
3. **Scenario / what-if** — build & compare scenarios (e.g., BTM gas vs grid; phased vs full build)
   across the four dimensions; sensitivity/tornado; time-based ramp.
4. **Demand & portfolio planning** *(may be partially greyed)* — demand by geography/latency, portfolio
   staging across markets, concentration/correlation.

## Explicit non-goals for v1
- Not real data (mock), not the real engine (spec later), not financing-waterfall depth, not L0 parcel
  underwriting (that's the A.CRE reference model's job — we sit above it).

## Locked decisions (2026-09-15)
- Flagship optimization: **phasing-to-demand-ramp**; v1 engine scope: **single site**; fidelity:
  **deterministic + sensitivity + Monte Carlo**; map: **schematic provider behind a `MapProvider`
  seam**, real tiles deferred.
- Engine = **pure Go function → WASM**, proto contract in/out; SPA routes all state through a **command
  bus** shared by human, embedded Copilot, and a **developer remote-control harness** (a Claude Code
  session drives + debugs the app via Playwright + `window.__harness`).
- Copilot = `claude-sonnet-5` tool loop in the browser; **relay mode** for the deployed build (key held
  by our Cloud Run server behind a shared password + daily cap), BYO key in dev only.
- Scenario comparison in v1 = **baseline pin + compare mode** on the Site Feasibility view (Δ tiles,
  ghosted baseline series, Copilot narrates deltas) rather than a separate scenario tab.
- Fidelity is grounded, not tuned: three fixtures (`abilene-1`, A.CRE `nova-colo`, Epoch
  `epoch-100mw`) with reconciliation tests that pin every known gap (#28–#30).

## Document map (source of truth for the build)
- `docs/architecture.md` — components, command bus, harness, locked decisions.
- `proto/capplanner/v1/engine.proto` — the `SitePlan → Result` contract (the seam).
- `docs/engine-design.md` — engine internals, conservation checks, Monte Carlo, optimizer, TDD.
- `docs/ui-spec.md` — UI behavior + Site Feasibility view.
- `docs/agent-integration.md` + `docs/agent-system-prompt.md` — the embedded Copilot and its prompt.
- `docs/acceptance-session.md` — the acceptance criterion (T1–T7); `docs/validation-cases.md` — the
  three unit-level cases it embeds.
- `docs/implementation-plan.md` — workstreams, status, merge process, deferred list.
- `deploy/cloudrun.md` — the tester deployment runbook; `harness/README.md` — driving the app.
- `.claude/skills/development/` — shared, living dev process every worker follows.
- `research/` — grounding research; `research/02-kpi-architecture.md` is the analytical spine.

## Process
Research → KPI/model architecture → Claude Design wireframe → design + scoping docs → **fan-out
implementation** (Fable orchestrator + subagent workers in worktrees, one PR per workstream merged
through a queue, per `implementation-plan.md`) → **acceptance session** (scripted in CI, live run
reviewed) → **grounding against external models** (A.CRE, Epoch) → **tester deployment** (Cloud Run)
→ stakeholder demo. Status: implementation and deployment done; acceptance and grounding PRs open;
docs are kept current with each PR that changes a contract, process or scope.
