# Acceptance Session — "Abilene-1 planning session"

**Status:** v0.1 — 2026-09-15. **This is the overall acceptance criterion for the POC.** One continuous,
hypothetical planning session in the app — human + Copilot + engine, over multiple iterations — that
exercises every key feature end-to-end. It subsumes the three cases in `validation-cases.md` (which
remain as unit-level assertions) and adds the connective arc a real planner would follow.

It runs through the remote-control harness (`harness/`) in two modes:

| Mode | Copilot | Purpose |
|---|---|---|
| `live` | Real `claude-sonnet-5` tool loop (BYO key via `ANTHROPIC_API_KEY`) | **The acceptance run.** Judged on behavior + narration quality; artifacts archived under `harness/runs/<ts>/`. |
| `scripted` | Harness issues the same tool calls the Copilot is expected to make | **CI gate.** No key needed; validates engine + bus + UI + harness deterministically. |

Both modes drive the same `window.__harness` API and assert the same engine/UI facts. Only `live` asserts
narration quality (numbers traceable to a `Result`, framing present).

## Setup
Reference plan `fixtures/abilene-1.json` (protojson `SitePlan`): Abilene-1, ERCOT / W. Texas,
200 MW target IT load, GB300 GPUs at 22 per 40 kW air-cooled rack (deliberately conservative density), grid-only
power (`grid_energize_month = 30`, i.e. ~2029), `SINGLE_SHOT` phasing, `COMPUTE_SALES` revenue, demand
ramp 40 → 200 MW over months 6–42, 7-year hold. Internally consistent so the baseline analyzes `OK`.

## The session (turns are numbered; `H` = human, `C` = Copilot, `E` = engine)

### T1 — Orientation (Analyze, narration, four dimensions)
- H: *"Give me the picture on Abilene-1."*
- C → `run_analyze` → E returns `OK`, conservation all green.
- C narrates: LCOC, total capex, `time_to_energize_months` as the **binding constraint**, and the
  demand-capture / shortfall numbers; frames it across Space/Time/Capital/Risk.
- **Assert:** `status=OK`; `conservation.all_passed`; `demand_capture_pct` is low (grid comes late vs.
  the ramp); every number in C's narration appears in `Result.summary` (live mode).

### T2 — A bad idea, caught early (diagnostics → self-correction)
- H: *"Push density to 130 kW/rack so we shrink the footprint."*
- C → `propose_change` (kw_per_rack=130) → user accepts (harness auto-accepts) → E returns
  `INVALID_INPUT` with `DENSITY_EXCEEDS_COOLING` (+ `FLOOR_LOAD_INSUFFICIENT` if the slab is below the
  liquid threshold), each with `proto_path`/`expected`/`actual`/`hint`.
- C explains the diagnostics, then fixes **exactly the named fields**: `compute.cooling=LIQUID_DTC`,
  `site.floor_load_psf` raised to the liquid threshold, and (because 130 kW/rack is an NVL72-class
  rack) `compute.gpus_per_rack=72` so the GPU count stays ≈ constant; the agility premium in
  `costs.agility_premium_pct` now applies; re-runs → `OK`.
- **Assert:** first Result has the expected codes; the command log shows edits only on the
  `proto_path`s named plus `compute.gpus_per_rack`; second Result `OK` with conservation green;
  footprint (`schematic.footprint_used_pct`) decreased vs. T1; `capex_per_mw` increased (the agility
  premium is a visible capex line, not silent).

### T3 — The flagship: phase to the demand ramp (Optimize)
- H: *"We can't wait until 2029. Phase this to track demand and keep cost sane. Cap capex at $8B and
  never be short more than 20 MW."*
- C → `run_optimize` with `objective=MIN_STRANDED_PLUS_LCOC`, decision vars = phase count/size/timing +
  power source (grid | BTM gas), constraints `total_capex ≤ 8e9`, `shortfall ≤ 20 MW` (via policy).
- E returns `OptimizationResult{converged=true}` + frontier. C interprets the frontier, names the
  tradeoff (gas premium vs. earlier revenue) via the shortage-vs-underutilization asymmetry, and
  proposes the best plan as an accept/undo card. Harness accepts → plan applied → re-analyzed.
- **Assert:** `converged=true`; best plan `feasible` and `conservation.all_passed`; objective strictly
  better than the single-shot baseline; `demand_capture_pct` up and `stranded_capacity_mw_months` down
  vs. T2; first phase uses a BTM gas source with `energize_month` < grid month; schematic blocks have
  strictly increasing `energize_month` per phase; the timeline scrubber reveals them (screenshot).

### T4 — How robust is it? (Monte Carlo + sensitivity)
- H: *"How robust is our LCOC, and where's the downside?"*
- C adds distributions on `gpu_hour_price` (triangular), `utilization_pct` (normal),
  `gpu.depreciation_years` (uniform over 3–7 → rounded) and enables Monte Carlo (seed fixed, 1,000
  iterations) + sensitivity on the master levers; runs Analyze.
- **Assert:** P10 < P50 < P90 for LCOC and NPV; histogram counts sum to iterations; re-running with the
  same seed yields a byte-identical `MonteCarloResult`; tornado top-2 ⊂ {gpu_hour_price, utilization,
  energization}; Monte Carlo bands render on the risk panel (screenshot).

### T5 — What-if on the linchpin (set_control, compare)
- H: *"What if utilization is only 65%?"*
- C → `set_control("revenue.compute.utilization_pct", 65)` → re-run; compares LCOC/NPV to T4 and flags
  proximity to `utilization_breakeven_pct`, framed as a two-sided risk (not a floor).
- **Assert:** the command log has exactly one plan mutation for this turn; LCOC rises vs. T4; C's
  narration cites `utilization_breakeven_pct` from the Result (live).

### T6 — Undo, then a human-driven lever (bidirectional controls)
- Harness (as the human) hits **undo** on T5's card, then drags the **depreciation-years** slider 5 → 4.
- **Assert:** after undo the plan equals the T4 plan byte-for-byte; the slider change dispatches one
  command, re-analyzes in < 100 ms, LCOC rises; C, unprompted, sees the new ViewContext and can answer
  *"what just changed?"* correctly (live).

### T7 — Steering-committee summary (grounding + research)
- H: *"Summarize the recommendation for the steering committee across space, time, capital and risk,
  and remind me why a gas bridge is worth the premium."*
- C answers from the current Result; calls `query_research` (speed-to-market / power topics) for the
  "why"; every number traces to a `Result` field.
- **Assert (live):** narration mentions all four dimensions; ≥1 `query_research` call; number-trace
  check passes; conversation persisted to localStorage and restored after a page reload with the
  same plan/Result.

## Cross-cutting assertions
- **Determinism:** every `Analyze` on identical bytes is byte-identical; the whole scripted session
  replays to identical Results.
- **Errors bubble:** no uncaught exception in the page console; a malformed plan passed to
  `loadPlan` yields a diagnostic, not a crash; a WASM panic surfaces as `INTERNAL_ERROR`.
- **Performance:** single Analyze < 100 ms (WASM); 1,000-iteration Monte Carlo < ~1 s.
- **Prompt caching (live):** `cache_read_input_tokens > 0` from T2 onward.
- **Artifacts:** per turn, a screenshot + the command log + the Result JSON under `harness/runs/<ts>/`.

## Definition of done for the POC
`scripted` mode green in CI **and** one archived `live` run reviewed by the orchestrator against the
narration assertions above, with the run's artifacts linked from the closing PR.
