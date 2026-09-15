# Validation Use Cases (Simulated User Sessions)

**Status:** v0.1 — 2026-09-15. Acceptance criteria for the engine + agent loop. Each case is a scripted
session run through the **remote-control harness** (Playwright + `window.__harness`) driving the real
agent + WASM engine iteratively until behavior and output quality meet the expectations below. Run these
once the basic engine is complete; treat failures as debugging targets for this session.

Shared setup: single site (Abilene-1, ERCOT / W. Texas), mock but internally-consistent inputs.

---

## Case 1 — Phasing to a demand ramp (flagship)
**Goal:** validate the flagship optimizer + phasing + conservation.
**Session:**
1. Load a SitePlan: 200 MW target, air-cooled default, grid-only power (grid energize ~2029), a demand
   ramp rising 40→200 MW over 2027–2030.
2. User asks Copilot: "We can't wait until 2029 — phase this to track demand and keep cost sane."
3. Agent sets `objective=MIN_STRANDED_PLUS_LCOC`, decision vars = phase sizes/timing + power source,
   constraints = `max_shortfall ≤ 20 MW`, `total_capex ≤ $8B`; runs `Optimize`.
4. Agent interprets the frontier, proposes the best plan (expects a gas-bridge first phase + staged grid
   phases), surfaces it as an accept/undo card.
**Expected / assertions:**
- Optimizer returns a **feasible** plan beating naive single-shot on the objective; `converged=true`.
- **All conservation checks pass** on the winning plan (`conservation.all_passed=true`).
- `demand_capture_pct` materially higher and `stranded_capacity_mw_months` lower than the grid-only base.
- Agent's narration names the binding constraint (energization) and the tradeoff (gas premium vs. earlier
  revenue) and ties it to the shortage/underutilization asymmetry.
- Schematic shows phased blocks with increasing `energize_month`; timeline scrubber reveals them.

## Case 2 — Self-correcting from diagnostics
**Goal:** validate verbose diagnostics + the agent's proto-correction loop.
**Session:**
1. Load a SitePlan that is **infeasible**: 130 kW/rack density with `cooling=AIR` and floor loading below
   the liquid threshold; a phase that energizes before its power source is available.
2. User: "Analyze this site."
3. Engine returns ERROR diagnostics (`DENSITY_EXCEEDS_COOLING`, `FLOOR_LOAD_INSUFFICIENT`,
   `PHASE_BEFORE_POWER`) with `proto_path`/`expected`/`actual`/`hint`.
4. Agent reads diagnostics, explains them, and proposes corrections (switch to LIQUID_DTC + slab upgrade
   with its agility-premium cost; move the phase or add a gas source), applies them, re-runs.
**Expected / assertions:**
- Each diagnostic has a stable `code`, correct `proto_path`, and an actionable `hint`.
- After the agent's corrections, `status` improves to `OK`/`OK_WITH_WARNINGS` and conservation passes.
- The agent fixed the exact fields named by `proto_path` (assert via command log) — no flailing.

## Case 3 — Risk-aware what-if with Monte Carlo
**Goal:** validate Monte Carlo + sensitivity + the master levers.
**Session:**
1. Load the Case-1 winning plan (COMPUTE_SALES revenue). Declare distributions on `gpu_hour_price`
   (triangular), `utilization_pct` (normal), `depreciation_years` (discrete).
2. User: "How robust is our LCOC and where's the downside?"
3. Agent runs Analyze with `monte_carlo.enabled` (seed fixed) + sensitivity; interprets P10/P50/P90 and
   the tornado.
4. User: "What if utilization is only 65%?" → agent sets utilization, re-runs, compares.
**Expected / assertions:**
- Monte Carlo is **reproducible** (same seed → identical Distribution); P10<P50<P90; histogram sums to
  iterations.
- Tornado ranks GPU-hour price and energization/utilization at the top (matches research).
- At 65% utilization the agent correctly flags proximity to the ~70–75% **utilization-breakeven** and
  frames it via the shortage-vs-underutilization asymmetry.
- All numbers the agent states trace to a `Result` field (no fabrication) — assert by diffing narration
  against `Result`.

---

## Quality bar (all cases)
- **Correctness:** conservation passes; deterministic re-runs are byte-identical.
- **Agent quality:** interpretations are accurate, tied to the big-picture framing, and every number is
  sourced from a `Result`.
- **Loop convergence:** diagnostic-driven correction reaches a valid plan without oscillating.
- **Performance:** single Analyze < 100 ms; 1,000-iteration Monte Carlo < ~1 s in-browser.
- Harness captures screenshots + command log for each case for this session to review/debug.
