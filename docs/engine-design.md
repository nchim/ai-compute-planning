# Engine Design — Go / WASM Analytical Core

**Status:** v0.2 — 2026-09-15. Updated to the engine as built (WS2–WS5, PR #26). Implements the
`SitePlan → Result` contract in `proto/capplanner/v1/engine.proto`. Scope: single site, deterministic
core + Monte Carlo + sensitivity + phasing-to-demand optimizer.

## Principles
1. **Pure function.** `Analyze(*SitePlan) *Result` and `Optimize(*SitePlan) *Result` have no I/O, no
   globals, no wall-clock, no ambient RNG. Output depends only on input bytes. This is the whole
   testability + WASM + reproducibility story.
2. **Determinism.** All randomness is seeded from `run.monte_carlo.seed`. Iterate maps in sorted key
   order; marshal with `proto.MarshalOptions{Deterministic: true}` (a `Result` carries maps). No
   `time.Now()`, no goroutines anywhere in the engine.
3. **Conservation-first.** Every derived quantity that represents a conserved resource (time, land,
   capital, power, MW) is cross-checked; a violation is a bug, surfaced as a diagnostic + a failed
   `ConservationCheck`. The model is not "done" until all checks pass on the golden fixtures.
4. **Verbose, instructive diagnostics.** Errors/warnings carry `code`, `proto_path`, `expected`,
   `actual`, `hint` so the agent can correct the input without guessing.

## Package layout (as built)
```
engine/
  engine.go         // public entry: Analyze = core, then risk (MC + sensitivity) on a valid plan; Optimize
  pb/               // generated from proto/capplanner/v1/engine.proto (buf; committed)
  core/             // pure analytical model
    doc.go          // model notes: LCOC formula + worked example, other metrics, the STUBS list
    validate.go     // input validation → ERROR diagnostics (collect all, then stop)
    sizing.go       // power/cooling/rack/space sizing
    schedule.go     // phasing + energization; construction lead time
    demand.go       // DemandAt: linear interpolation of the demand ramp (exported for the optimizer)
    capex.go / opex.go / revenue.go / cashflow.go / metrics.go
    schematic.go    // block layout for Result.schematic
    conserve.go     // the thirteen conservation checks
    render.go       // Tables, Charts assembly
    analyze.go      // orchestrates the pipeline
    diag.go         // diagnostic codes + helpers
    testdata/       // golden Results (abilene-1; nova-colo + epoch-100mw in PR #31)
  risk/
    risk.go         // Validate, MonteCarlo, Sensitivity entry points + codes
    sample.go       // seeded inverse-CDF samplers (NORMAL/TRIANGULAR/UNIFORM)
    path.go         // SetNumeric: dotted input_path writes via protoreflect
    stats.go        // P10/P50/P90/mean/sd + histogram
    montecarlo.go / sensitivity.go
  optimize/
    optimize.go     // policy/objective/constraint validation, result assembly, codes
    phasing.go      // the staged search (see Optimizer)
  bridge/           // Bridge.Call(op, bytes) bytes — plain Go, tested under -race
  wasm/main.go      // //go:build js,wasm — Uint8Array ↔ []byte adapter over bridge
```

## Analytical core pipeline (`core.Analyze`)
Monthly grid of `finance.hold_period_months` (t = 0 is decision time). Percent fields are whole
percents (`80` = 80%); discount and cap rates are fractions.
1. **validate** — structural + semantic checks; collect ALL errors. If any ERROR, return early with
   `status=INVALID_INPUT` and diagnostics. `run.mode=RUN_OPTIMIZE` is rejected here (`USE_OPTIMIZE`).
2. **sizing** — IT load → facility power (× PUE) → racks (= it_load / kw_per_rack) → white space →
   cooling load; density vs cooling mode; floor loading.
3. **schedule** — explicit or single-shot phases (OPTIMIZE handled by the optimizer); each phase's
   `energize = max(power_ready, construction_ready)`, where construction-ready is
   `ConstructionLeadMonths` (18) for a single shot and the phase's own `energize_month` in EXPLICIT
   mode; power-ready is the named source's readiness (grid waits for
   `interconnection.grid_energize_month`) or the first month pooled firm supply covers the cumulative
   load; per-source load is validated in EXPLICIT mode (`SOURCE_OVERLOADED`).
4. **capex** — per-MW components × MW (+ land + GPUs + agility premium) → phase capex → total.
5. **opex** — staffing/maintenance/insurance/mgmt-fee/tax over time.
6. **revenue** — colo ($/kW/mo × online MW) or compute (gpu_hour_price × GPU-hours × utilization),
   phased by energization; decay/escalation applied.
7. **cashflow** — monthly net ledger incl. terminal value → NPV/IRR at `discount_rate` (IRR by bisection).
8. **metrics** — `SummaryMetrics` incl. **LCOC**, yield-on-cost, dev spread, demand capture,
   stranded/shortfall MW-months, composite risk score, utilization breakeven (`core/doc.go` has the
   formulas and a worked example on `abilene-1`).
9. **layout** — `Result.schematic` blocks.
10. **conserve** — run all checks; attach the report; downgrade status if any fail.
11. **render** — assemble Tables and Charts.

**LCOC (anchor metric):** `PV(lifecycle cost) / PV(delivered GPU-hours)` — capex + opex + power,
less terminal value, both sides discounted at the monthly equivalent of `discount_rate` (LCOE
convention: earlier energization earns a lower LCOC for the same spend). GPU capex is only incurred
under `COMPUTE_SALES`.

## Conservation checks (`core/conserve.go`) — model-correctness invariants
Each returns a `ConservationCheck{name, passed, residual, tolerance}`; residual must be ~0.

| Check | Invariant |
|---|---|
| `capital_components_sum` | Σ(capex components) = total_capex |
| `capital_phases_sum` | Σ(phase capex) = total_capex |
| `capital_uses_eq_sources` | equity = total uses (100% equity STUB) |
| `land_footprint_le_parcel` | Σ(block acres) ≤ `site.land_acres` |
| `whitespace_le_gross` | white space ≤ gross buildable |
| `power_load_eq_racks` | it_load = racks × kw_per_rack / 1000 |
| `facility_power_pue` | facility_power = it_load × pue |
| `power_supply_ge_demand_t` | at every month, firm supply ≥ energized facility load |
| `cooling_ge_heat` | cooling capacity ≥ heat load |
| `schedule_energize_consistency` | energize = max(power_ready, construction_ready); revenue ≤ energize |
| `phase_precedence` | phases energize in order; timeline monotonic |
| `mw_online_monotonic` | Σ energized MW(t) non-decreasing; ≤ target |
| `demand_capture_identity` | capture = ∫min(demand,capacity)dt / ∫demand dt ∈ [0,1] |

Tolerance: relative 1e-6 for money and MW, exact for counts and ordering. A failed check sets
`all_passed=false`, downgrades the status and emits a `CONSERVATION_FAILED` diagnostic.

## Diagnostic codes (as implemented)
Stable strings; the agent and the harness match on them.

| Package | Codes |
|---|---|
| `core` | `MISSING_REQUIRED`, `OUT_OF_RANGE`, `UNKNOWN_POWER_SOURCE`, `DENSITY_EXCEEDS_COOLING`, `FLOOR_LOAD_INSUFFICIENT`, `PHASE_BEFORE_POWER`, `POWER_UNDERSUPPLY`, `SOURCE_OVERLOADED`, `FOOTPRINT_OVER_PARCEL`, `USE_OPTIMIZE`, `PHASES_NE_TARGET`, `ENERGIZE_AFTER_HOLD`, `IRR_UNDEFINED` (INFO), `STORAGE_NOT_FIRM` (INFO), `CONSERVATION_FAILED` |
| `risk` | `UNKNOWN_INPUT_PATH`, `OUT_OF_RANGE`, `MC_INVALID_DRAWS`, `MC_NO_DISTRIBUTIONS`, `SENSITIVITY_INVALID_DRAW` |
| `optimize` | `USE_ANALYZE`, `MISSING_REQUIRED`, `OUT_OF_RANGE`, `UNKNOWN_METRIC`, `NO_FEASIBLE_CANDIDATE`, `OBJECTIVE_DEFAULTED` (INFO), `DECISION_VARS_IGNORED` (INFO, STUB), `PHASE_COUNT_SKIPPED`, `SEARCH_TRUNCATED` |
| `bridge` | `MALFORMED_INPUT`, `UNKNOWN_OP`, `INTERNAL_ERROR` |
| `web` fake engine | `FAKE_ENGINE` (INFO, announces the non-WASM engine in every Result) |

Every diagnostic: `severity`, `code`, `message`, `proto_path`, `expected`, `actual`, `hint`. Example:
`{ERROR, POWER_UNDERSUPPLY, "Phase 2 energizes month 18 but only 120 MW available vs 200 MW load",
"phasing.phases[1].energize_month", "≥200 MW by m18", "120 MW", "delay phase 2 to m24 or add a BTM gas
source"}`. The agent reads these to correct the SitePlan; the acceptance session asserts the loop
converges (T2).

## Monte Carlo (`risk`)
- `risk.Validate` checks distributions and sensitivity vars up front (unknown paths, bad ranges) and
  returns ERROR diagnostics the root `engine.Analyze` turns into `INVALID_INPUT`.
- Seeded PRNG from `run.monte_carlo.seed`; draws from the open interval (0,1) so `Erfinv` is finite.
  For each iteration: sample every `InputDistribution`, clone the plan, write the value by dotted
  `input_path` (`risk.SetNumeric`, protoreflect; int fields rounded), run `core.Analyze`, collect the
  chosen metrics. Output: P10/P50/P90/mean/sd + histogram per metric; invalid draws are counted and
  reported (`MC_INVALID_DRAWS`).
- Same seed → byte-identical `MonteCarloResult`. 1,000 iterations ≈ 125 ms native, dominated by the
  core's render step (a render-free entry point would roughly halve it if WASM needs headroom).

## Sensitivity (`risk`) — two targets
One-at-a-time: for each `input_path`, run at −delta and +delta and record the target metric. Because
LCOC is a *cost* metric, a tornado on `gpu_hour_price` is ~flat; the tornado is therefore reported for
**both LCOC and NPV** — one `SensitivityVar` per path × target, LCOC block first, each block ordered
by |high − low|. The UI renders both tornados; T4 asserts price and utilization rank top-3 on NPV.

## Optimizer (`optimize`) — flagship: phasing-to-demand-ramp
- **Entry:** `phasing.mode=OPTIMIZE` with a `phasing.policy` (`max_phases` ≤ 8, `min/max_phase_mw`,
  `min_months_between_phases`, `max_shortfall_mw`); anything else is `USE_ANALYZE`. The result is the
  winner as an **EXPLICIT** plan re-analyzed by the core (so conservation holds), plus `converged`,
  `evaluations`, `best_metrics` and a `frontier` of every evaluated candidate with its decision-var
  values (`phases`, `p<k>.mw/energize/source`, `objective`, `avg_shortfall_mw`, `baseline`, `invalid`).
- **Objective:** `MIN_STRANDED_PLUS_LCOC` (default; `OBJECTIVE_DEFAULTED` when unset) or `MIN_LCOC`,
  `MIN_TIME_TO_REVENUE`, `MAX_MW_CAPTURED`, `MIN_RISK`, ranked on the corresponding `SummaryMetrics`.
- **Constraints:** `optimization.constraints[]` on summary metrics (`UNKNOWN_METRIC` otherwise) filter
  candidates; infeasible candidates are ranked by total relative violation so the descent is pulled
  towards feasibility. `phasing.policy.max_shortfall_mw` is a **hold-average** bound:
  `shortfall_mw_months / hold_period_months ≤ max_shortfall_mw` — an instantaneous cap is unsatisfiable
  whenever demand starts before the earliest source is ready (an instantaneous mode is #23's open half).
- **Core hooks (PR #26):** `core.DemandAt` (the interpolation the core scores against) and
  `core.ConstructionLeadMonths` are exported; per-source load is validated in EXPLICIT mode
  (`SOURCE_OVERLOADED`), so the optimizer's own per-source check is only a cheap pre-filter.
- **Algorithm (as built, `phasing.go`):** staged deterministic search with a fixed budget —
  1. evaluate the single-shot **baseline** (the reference the objective must beat; if the core rejects
     the plan independently of phasing, fail with its diagnostics);
  2. enumerate **phase count × power-source assignment** over the firm sources sorted by readiness
     (BESS excluded; grid waits for the interconnection), capped at 64 assignments
     (`PHASE_COUNT_SKIPPED` when a count cannot fit the policy);
  3. seed each with a **demand-tracking heuristic** (size phase k to close the projected gap at its
     source's ready month);
  4. refine the best 3 seeds by **bounded coordinate descent**: per phase, shift energization by
     ±6/±3/±2/±1 months and move `min_phase_mw` of capacity to or from a neighbour, accepting only
     strict improvements (memoized by candidate key; a full pass with no improvement = converged);
  5. stop at convergence or at the **400-evaluation budget** (`SEARCH_TRUNCATED`, `converged=false`).
  `core.Analyze` costs ~130 µs on the fixture, so the worst case is ~50 ms; T3 converges in ~40
  evaluations. `optimization.decision_vars` are **not honoured** (`DECISION_VARS_IGNORED` INFO): the
  policy alone bounds the search.
- **Conservation still enforced** on the winning plan; an "optimal" plan that violates a check is a bug.

## Stubs (visible simplifications, from `core/doc.go`)
- `ConstructionLeadMonths` = 18 for every build.
- Power-source capex attributed to the first phase that can use it.
- Capex paid as lumps (no S-curve).
- 100% equity (`capital_uses_eq_sources` is equity = uses).
- Storage (BESS) is not firm supply (`STORAGE_NOT_FIRM` INFO).
- PPAs count at nameplate.
- Land at cost at exit; terminal value is asset-based (#30: `exit_cap_rate` only feeds dev spread).
- Schematic is a single-row block layout, not a site plan.
- Energy billed at nameplate facility load, not utilization (#28); colo escalation compounds from t0
  and opex never grows (#29). The fidelity PR for #28–#30 is in flight.

## Grounding fixtures and reconciliation (WS12, PR #31)
Three fixtures ground the engine against external models:
- `fixtures/abilene-1.json` — the acceptance reference plan (ERCOT, 200 MW, `COMPUTE_SALES`, grid at m30,
  demand ramp 40→200 MW). Golden `core/testdata/abilene-1.result.json`.
- `fixtures/nova-colo.json` — A.CRE's data-center development model (L0 lens, `COLO_LEASE`, PJM/NoVA,
  EXPLICIT 2 × 10 MW phases on a BTM gas bridge then grid). Reconciled on the workbook's untrended
  basis: total capex exact, stabilized NOI and yield-on-cost within 1%, dev spread ±5 bps; the trended
  gap (+25%) is pinned as a band (#29).
- `fixtures/epoch-100mw.json` — Epoch AI's 100 MW GB200 campus reconstruction (`COMPUTE_SALES`,
  SINGLE_SHOT, grid + nuclear PPA). Capex lines within 1–2%, non-energy opex exact; energy is +21%
  unadjusted because the engine bills nameplate (#28), pinned as a +10..+30% band.
**Method:** mirror the source's *inputs* field by field (a source cell → our field → value → note
table in the README), compare outputs on the basis the source itself computes, restate each structural
difference explicitly rather than tuning inputs, and pin every known gap's direction and band so the
test flips when the engine changes. Each fixture gets a golden, a determinism test, a Go + TS round
trip, and Monte Carlo + optimize smoke (`engine/scenarios_test.go`).

## WASM boundary (`bridge` + `wasm/main.go`)
- Build `GOOS=js GOARCH=wasm`. `main.go` publishes `globalThis.capplanner = {analyze, optimize}`, each
  `(Uint8Array) → Uint8Array` of binary proto; it only converts `Uint8Array` ↔ `[]byte`
  (`js.CopyBytesToGo` after an `InstanceOf` check).
- The logic is `engine/bridge` (`Bridge.Call(op, bytes) bytes`, injectable models, tested under `-race`).
  Nothing escapes: every failure is `Result{INVALID_INPUT}` with one ERROR diagnostic —
  `MALFORMED_INPUT` (bytes are not a SitePlan / argument not a Uint8Array; decode error in `actual`),
  `UNKNOWN_OP`, `INTERNAL_ERROR` (recovered panic or nil Result; panic text in `actual`).
- SPA side (`web/src/engine`): a module Web Worker loads `wasm_exec.js` + `engine.wasm` once and serves
  `{id, op, bytes}` → `{id, ok, bytes | error}`; `createEngine()` gives `analyze/optimize(plan): Promise<Result>`
  with per-request ids (stale replies dropped), a timeout, and a typed `EngineError` (`load | encode |
  decode | worker | timeout`). `VITE_ENGINE=fake` substitutes an in-page fake engine for UI work.

## Testing (as built)
- **Table-driven unit tests** per core module; **golden Results** in `testdata/` regenerated with
  `go test ./engine/core -run TestAbileneGolden -update` (WS12 adds `-update` for the other scenarios)
  and reviewed as a diff.
- **Cross-platform goldens:** never `proto.Equal`; `requireProtoClose` (`core/helpers_test.go`) walks
  protoreflect with 1e-9 relative tolerance on floats, exact otherwise, and names the first differing
  field. arm64 fuses multiply-adds, amd64 does not.
- **Conservation as property tests** over randomized valid inputs; **diagnostic tests** per code;
  **determinism tests** (same bytes → identical bytes); **optimizer tests** (T3 scenario beats
  single-shot, deterministic, infeasible, input errors); **integration** through the real WASM module
  from Node (`web/src/engine/wasm.integration.test.ts`, incl. a real Optimize).
- `go test -race ./engine/... ./deploy/...`, `go vet`, `staticcheck`, `gofmt` in CI (`make check`).
