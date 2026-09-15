// Package core — model notes.
//
// # Pipeline
//
// Analyze runs validate → sizing → schedule → capex → opex → revenue → cashflow → metrics → layout →
// conserve → render on a monthly grid of finance.hold_period_months months (t = 0 is decision time).
// Every percent field in the proto is a whole percent (80 = 80%); discount and cap rates are fractions.
//
// # LCOC — levelized cost of compute ($/GPU-hour)
//
//	LCOC = PV(lifecycle cost) / PV(delivered GPU-hours)
//
//	PV(lifecycle cost)  = Σ_t (capex_t + opex_t + power_t) / (1+r)^t  −  terminal / (1+r)^(H−1)
//	PV(GPU-hours)       = Σ_t gpus_online_t × utilization × 730 / (1+r)^t
//
// where r is the monthly equivalent of finance.discount_rate, H the hold in months, and terminal is the
// exit value of the assets (GPUs at costs.gpu.residual_curve[years online], facility capex straight-line
// over a 25-year shell life, land at cost). Discounting both numerator and denominator is the LCOE
// convention: it charges early capex more than late GPU-hours, so a plan that energizes sooner earns a
// lower LCOC for the same total spend. GPU capex is only incurred (and only depreciated) under
// COMPUTE_SALES; a colo tenant buys its own GPUs, and colo GPU-hours are the leased capacity's hours.
//
// Worked example (fixtures/abilene-1.json, r = 10%/yr, H = 84):
//
//	200 MW IT at 40 kW/rack → 5,000 racks × 22 = 110,000 GPUs; facility 240 MW at PUE 1.2.
//	Facility capex (shell+electrical+cooling+network) $10M/MW × 200 = $2.0B at m0; grid capex $104M;
//	land $20M; GPUs 110,000 × $40k = $4.4B at energize (m30, when the grid arrives). Total $6.52B.
//	Delivered GPU-hours: 110,000 × 80% × 730 h × 54 months online ≈ 3.47B GPU-h; PV ≈ 2.23B.
//	Lifecycle cost: $6.52B capex + $0.87B opex + $0.43B power − $3.07B terminal (GPUs at 35% residual
//	after 4 full years, shell 82% undepreciated, land at cost) → PV ≈ $4.88B.
//	LCOC = 4.88B / 2.23B ≈ $2.19 per GPU-hour, against a $3.25 GB300-class opening price decaying
//	8%/yr; breakeven utilization 78% vs. 80% assumed — thin, because an air-cooled 22-GPU rack carries
//	the same shell and power as a dense one. T2's move to NVL72 racks is the fix the session finds.
//
// The exact figures are in testdata/abilene-1.result.json (summary.lcoc_per_gpu_hour, summary.extra).
//
// # Other metrics
//
//   - capex_per_mw: total capex / sized IT MW.
//   - yield_on_cost_pct: stabilized NOI (12 months from the last energization) / total capex.
//   - dev_spread_bps: (yield on cost − exit_cap_rate) in basis points.
//   - unlevered_irr_pct / npv: on the monthly net ledger including terminal value; IRR by bisection
//     (cashflow.go); undefined IRR is reported as 0 with an IRR_UNDEFINED INFO diagnostic.
//   - demand_capture_pct = ∫min(demand, capacity) / ∫demand over the hold (demand interpolated linearly
//     between points); shortfall/stranded are the MW-month integrals of the two gaps.
//   - utilization_breakeven_pct: utilization at which PV(revenue) = PV(cost) (occupancy for colo).
//   - composite_risk_score: mean of five 0..100 components rendered on the risk radar — timing
//     (100 − capture), power (headroom vs. a 20% target), utilization (breakeven / assumed), agility
//     (cooling class and floor load), water (site.water_stress_index).
//
// # Stubs (visible simplifications)
//
//   - ConstructionLeadMonths = 18 for every build; power-source capex attributed to the first phase
//     that can use it; capex paid as lumps (no S-curve); 100% equity (capital_uses_eq_sources);
//     storage (BESS) is not firm supply (STORAGE_NOT_FIRM INFO); PPAs count at nameplate;
//     land at cost at exit; schematic is a single-row block layout, not a site plan.
package core
