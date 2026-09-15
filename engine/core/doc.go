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
// exit value (§Terminal value: the asset basis for COMPUTE_SALES, NOI ÷ exit cap rate for COLO_LEASE —
// which is why a colo LCOC is small: the exit repays most of the shell). Discounting both is the LCOE
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
//	Lifecycle cost: $6.52B capex + $0.87B opex + $0.34B power − $2.41B terminal (GPUs at 20% residual
//	after 4 of 5 straight-line years — the fixture sets no residual_curve so depreciation_years is a
//	live lever; shell 82% undepreciated, land at cost) → PV ≈ $5.17B.
//	LCOC = 5.17B / 2.23B ≈ $2.32 per GPU-hour, against a $3.25 GB300-class opening price decaying
//	8%/yr; breakeven utilization 83% vs. 80% assumed — underwater, because an air-cooled 22-GPU rack
//	carries the same shell and power as a dense one. T2's move to NVL72 racks is the fix the session finds.
//
// The exact figures are in testdata/abilene-1.result.json (summary.lcoc_per_gpu_hour, summary.extra).
//
// # Energy
//
// Energy is dispatched cheapest-first across the firm sources that are ready, on the billed load:
//
//	COMPUTE_SALES  load = IT online × utilization × PUE   (the operator pays for what its GPUs draw)
//	COLO_LEASE     load = IT online × PUE                  (the tenant is billed on the leased load)
//
// STUB: no idle draw — a compute hall at 0% utilization bills zero energy. Real idle servers draw a
// material fraction of TDP and cooling has a fixed component, but the research corpus gives no idle
// fraction to anchor one on, and Epoch's TCO energy line (the reconciliation source) is itself linear
// in utilization. Under COLO_LEASE utilities are a pass-through on IT × PUE regardless of occupancy,
// which is how A.CRE bills them (Underwriting F153) and why nova-colo's NOI reconciles exactly.
//
// utilization_breakeven_pct accounts for the cost lines that move with utilization (energy under
// COMPUTE_SALES and the management fee, which is a share of revenue):
//
//	breakeven = assumed × (PV(cost) − PV(variable)) / (PV(revenue) − PV(variable))
//
// exact up to the kinks cheapest-first dispatch puts in energy where the load crosses a source's capacity.
//
// # Trending
//
// Rates are quoted in year-1-of-operations dollars and step once per year (no continuous growth):
//
//	colo rent      × (1 + annual_escalation_pct)^⌊(t − phase energize)/12⌋   per phase, from its lease start
//	opex rates     × (1 + opex_growth_pct_yr)^⌊(t − first energize)/12⌋       staffing, maintenance, insurance,
//	                                                                          property tax and energy $/MWh
//	management fee follows revenue; compute-sales price decays continuously from t0 (a market curve,
//	not a contract escalator).
//
// This is the A.CRE convention (escalation per tenant from lease start, growth on every opex line
// from the operations start), which is what makes nova-colo's trended NOI reconcile.
//
// # Terminal value
//
// Booked in the final month (metrics.go exitValue); both bases are in summary.extra so they can be
// compared (terminal_value is the one used, exit_value_asset_basis and exit_value_cap_rate the two).
//
//	COLO_LEASE     max(0, NOI at exit ÷ finance.exit_cap_rate)   — a developer sells a leased building
//	               on its income (A.CRE K204); the GPUs are the tenant's. NOI at exit is the final 12
//	               months of the hold (A.CRE capitalizes the 12 months after the sale, one year of
//	               trending later). exit_cap_rate 0 falls back to the asset basis with an
//	               EXIT_CAP_RATE_UNSET INFO. No selling costs (STUB; A.CRE deducts 2%).
//	COMPUTE_SALES  asset basis: GPUs at costs.gpu.residual_curve[years online], facility capex
//	               straight-line over a 25-year shell life, land at cost (STUB: no appreciation).
//	               A compute operator's exit is the hardware and shell it owns; capitalizing GPU-hour
//	               income at a real-estate cap rate would treat a 5-year asset as a perpetuity
//	               (abilene-1: $17.7B vs $3.1B), so exit_value_cap_rate is reported, not used.
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
//     land at cost at exit; no selling costs; no idle energy draw; schematic is a row-wrapped block
//     layout inside the usable rectangle, not a site plan.
package core
