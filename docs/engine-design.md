# Engine Design — Go / WASM Analytical Core

**Status:** v0.1 — 2026-09-15. Implements the `SitePlan → Result` contract in `docs/proto/engine.proto`.
Scope: single site, deterministic core + Monte Carlo + sensitivity + phasing-to-demand optimizer.

## Principles
1. **Pure function.** `Analyze(*SitePlan) *Result` and `Optimize(*SitePlan) *Result` have no I/O, no
   globals, no wall-clock, no ambient RNG. Output depends only on input bytes. This is the whole
   testability + WASM + reproducibility story.
2. **Determinism.** All randomness is seeded from `run.monte_carlo.seed`. Iterate maps in sorted key
   order. No `time.Now()`, no goroutine-scheduling-dependent results.
3. **Conservation-first.** Every derived quantity that represents a conserved resource (time, land,
   capital, power, MW) is cross-checked; a violation is a bug, surfaced as a diagnostic + a failed
   `ConservationCheck`. The model is not "done" until all checks pass on the golden fixtures.
4. **Verbose, instructive diagnostics.** Errors/warnings carry `code`, `proto_path`, `expected`,
   `actual`, `hint` so the agent can correct the input without guessing.

## Package layout (idiomatic Go)
```
engine/
  proto/            // generated from docs/proto/engine.proto (buf)
  core/             // pure analytical model
    validate.go     // input validation → ERROR diagnostics (fail fast, but collect all)
    sizing.go       // power/cooling/rack/space sizing
    schedule.go     // phasing + critical-path timeline, energization
    capex.go        // capex build (per-MW components → totals, per phase)
    opex.go         // opex build
    revenue.go      // colo or compute-sales revenue over time
    cashflow.go     // monthly → annual cashflow, NPV/IRR
    metrics.go      // SummaryMetrics (incl. LCOC)
    conserve.go     // conservation checks (see below)
    render.go       // Tables, Charts, Schematic assembly
    analyze.go      // orchestrates the pipeline
  risk/
    montecarlo.go   // seeded draws over InputDistributions → Distributions
    sensitivity.go  // one-at-a-time ± delta → tornado
  optimize/
    optimize.go     // objective/constraint/decision-var search loop over core.Analyze
    phasing.go      // flagship: phasing-to-demand-ramp search
  wasm/
    main.go         // //go:build js,wasm — exports Analyze/Optimize to JS
  testdata/         // golden SitePlan/Result fixtures (JSON)
```

## Analytical core pipeline (`core.Analyze`)
1. **validate** — structural + semantic checks; collect ALL errors (don't stop at first). If any ERROR,
   return early with `status=INVALID_INPUT` and diagnostics.
2. **sizing** — IT load → facility power (× PUE) → racks (= it_load / kw_per_rack) → white-space area →
   cooling load; check cooling mode supports density; check floor loading.
3. **schedule** — build the phasing plan (explicit or single-shot; OPTIMIZE handled in optimizer),
   compute each phase's `energize_month = max(power_ready, construction_ready)`; critical path =
   interconnection/transformer vs. gas-bridge availability.
4. **capex** — per-MW components × MW (+ land + GPU + agility premium) → phase capex → total.
5. **opex** — staffing/maintenance/insurance/mgmt-fee/tax over time.
6. **revenue** — colo ($/kW/mo × online MW) or compute (gpu_hour_price × GPU-hours × utilization),
   phased by energization; apply decay/escalation.
7. **cashflow** — monthly net → annual roll-up → NPV/IRR at `discount_rate`.
8. **metrics** — `SummaryMetrics` incl. **LCOC** (see below), yield-on-cost, dev spread, demand-capture,
   stranded/shortfall MW-months, composite risk, utilization-breakeven.
9. **conserve** — run all conservation checks; attach report; downgrade status if any fail.
10. **render** — assemble Tables, Charts, Schematic.

**LCOC (anchor metric):** total lifecycle cost (amortized capex incl. GPU depreciation + opex + power)
÷ delivered GPU-hours (capacity × utilization × hours), levelized over the hold. Documented formula +
worked example lives beside the code and in `research/02-kpi-architecture.md`.

## Conservation checks (`core.conserve`) — model-correctness invariants
Each returns a `ConservationCheck{name, passed, residual, tolerance}`; residual must be ~0.

| Check | Invariant |
|---|---|
| `capital_components_sum` | Σ(capex components) = total_capex |
| `capital_phases_sum` | Σ(phase capex) = total_capex |
| `capital_uses_eq_sources` | equity + debt (+ other) = total uses |
| `land_footprint_le_parcel` | Σ(block footprints + setbacks) ≤ usable_acres |
| `whitespace_le_gross` | white space ≤ gross buildable |
| `power_load_eq_racks` | it_load = Σ(racks × kw_per_rack)/1000 |
| `facility_power_pue` | facility_power = it_load × pue |
| `power_supply_ge_demand_t` | at every month, available power ≥ energized load |
| `cooling_ge_heat` | cooling capacity ≥ heat load |
| `schedule_energize_consistency` | energize = max(power_ready, construction_ready); revenue ≤ energize |
| `phase_precedence` | no phase starts before its dependency; timeline monotonic |
| `mw_online_monotonic` | Σ energized MW(t) non-decreasing; ≤ target |
| `demand_capture_identity` | capture = ∫min(demand,capacity)dt / ∫demand dt ∈ [0,1] |

Tolerance: relative 1e-6 for money/MW, exact for counts. A failed check with `all_passed=false`
sets `status=OK_WITH_WARNINGS` (or ERROR if it indicates invalid input) and emits a diagnostic.

## Monte Carlo (`risk.montecarlo`)
- Seeded PRNG from `seed`. For `iterations` draws: sample each `InputDistribution`, clone the SitePlan,
  overwrite the `input_path`, run `core.Analyze` (validation + conservation still apply), collect chosen
  metrics. Produce P10/P50/P90/mean/stddev + histogram per metric.
- Reproducible: same seed → same result. Iterations default 1,000 (perf-bounded in WASM; core must be
  fast — target < 100 µs/analysis so 1k draws < 100 ms).
- Sampling uses inverse-CDF; document each distribution's sampler with tests.

## Sensitivity (`risk.sensitivity`)
- One-at-a-time: for each `input_path`, run at −delta and +delta, record output metric → `TORNADO`
  chart ordered by |high−low|. Cheap (2 runs per var).

## Optimizer (`optimize`) — flagship: phasing-to-demand-ramp
- **Objective:** `MIN_STRANDED_PLUS_LCOC` = w1·stranded_capacity_mw_months + w2·LCOC (weights in meta;
  default normalizes both). Other objectives (MIN_LCOC, MIN_TIME_TO_REVENUE, MAX_MW_CAPTURED, MIN_RISK)
  share the same loop.
- **Decision variables:** phase count, per-phase MW, per-phase start/energize month, power source per
  phase, density/cooling — bounded by `PhasingPolicy` + `DecisionVar` specs.
- **Constraints:** hard constraints (capital ≤ cap, energize ≤ date, max_shortfall) filter infeasible
  candidates; the objective ranks feasible ones.
- **Algorithm (v1):** because the core is a fast pure function, use **staged search**: (1) enumerate
  phase-count and power-source (small categorical space); (2) for each, optimize continuous vars (phase
  sizes/timing) with a deterministic method (coordinate descent / bounded Nelder-Mead) seeded from a
  demand-tracking heuristic (size phase k to close the projected gap). Return best + a frontier of
  explored candidates. Deterministic given the seed. Document convergence + evaluation budget.
- **Conservation still enforced** on the winning plan; an "optimal" plan that violates a check is a bug.

## Diagnostics (`core.validate` + throughout)
- Stable `code`s (e.g. `POWER_UNDERSUPPLY`, `DENSITY_EXCEEDS_COOLING`, `FLOOR_LOAD_INSUFFICIENT`,
  `FOOTPRINT_OVER_PARCEL`, `CAPITAL_CONSTRAINT_VIOLATED`, `PHASE_BEFORE_POWER`).
- Every diagnostic: `severity`, `code`, `message` (instructive), `proto_path`, `expected`, `actual`,
  `hint`. Example: `{ERROR, POWER_UNDERSUPPLY, "Phase 2 energizes month 18 but only 120 MW available
  vs 200 MW load", "phasing.phases[1].energize_month", "≥200 MW by m18", "120 MW", "delay phase 2 to
  m24 or add a BTM gas source"}`.
- The agent reads these to correct the SitePlan; validation cases assert the loop converges.

## WASM boundary (`wasm/main.go`)
- Build `GOOS=js GOARCH=wasm`. Export `Analyze(bytes) bytes` and `Optimize(bytes) bytes` via `syscall/js`
  (or a thin JSON bridge). Binary proto in/out; the SPA marshals. Keep the exported surface tiny.
- No panics escape: recover → `Result{status=INVALID_INPUT, diagnostic INTERNAL_ERROR}`.

## TDD approach
- **Table-driven unit tests** per core module (sizing, capex, schedule, revenue, metrics).
- **Golden fixtures** in `testdata/`: SitePlan → expected Result (regenerated intentionally, reviewed).
- **Conservation as property tests**: for randomized valid inputs, ALL conservation checks must pass —
  this is the primary correctness guarantee.
- **Diagnostic tests**: malformed inputs produce the expected `code` + `proto_path`.
- **Determinism test**: same input+seed → byte-identical Result across runs.
- **Optimizer tests**: on a known demand ramp, the returned plan beats naive single-shot on the objective
  and satisfies all constraints + conservation.
- Coverage gate + `go vet`/`staticcheck` in CI. Write tests first, per module.
