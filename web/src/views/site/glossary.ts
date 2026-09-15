/**
 * Hover-explainer copy for every metric, control and region on the Site Feasibility canvas, keyed by
 * `Result.summary` field name, SitePlan proto path, or `region.<id>`. Sources point into `research/`.
 */
export interface GlossaryEntry {
  readonly concept: string;
  readonly formula: string;
  readonly benchmark: string;
  readonly source: string;
  /** Metrics only: which direction is an improvement, so a Δ vs. baseline can be coloured. */
  readonly betterWhen?: "lower" | "higher";
}

const kpi = "research/02-kpi-architecture.md";
const proForma = "research/topics/01-lifecycle-pro-forma/";
const power = "research/topics/06-power-energy/";
const lifecycle = "research/topics/05-facility-lifecycle/";
const speed = "research/topics/14-speed-to-market/";
const bubble = "research/topics/15-demand-bubble-risk/";
const siting = "research/topics/09-site-selection/";

export const glossary: Record<string, GlossaryEntry> = {
  // --- Result.summary metrics ---
  lcoc_per_gpu_hour: {
    concept: "Levelized Cost of Compute: lifecycle cost per delivered GPU-hour.",
    formula: "(capex + PV(opex + power)) / PV(GPU-hours delivered)",
    benchmark: "~$1.5–2 / GPU-hr",
    source: kpi, betterWhen: "lower",
  },
  total_capex: { concept: "All-in development cost.", formula: "Σ capex stack components", benchmark: "~$30–40M/MW full capex", source: proForma, betterWhen: "lower" },
  capex_per_mw: { concept: "Capex intensity per MW of IT load.", formula: "total_capex / target_it_load_mw", benchmark: "~$30–40M/MW", source: proForma, betterWhen: "lower" },
  yield_on_cost_pct: { concept: "Stabilized NOI over total cost.", formula: "stabilized NOI / total_capex", benchmark: "~10–12%", source: proForma, betterWhen: "higher" },
  npv: { concept: "Net present value of the hold-period cash flows.", formula: "Σ CF_t / (1+r)^t − capex", benchmark: "> 0 at the discount rate", source: proForma, betterWhen: "higher" },
  unlevered_irr_pct: { concept: "Unlevered internal rate of return.", formula: "r such that NPV = 0", benchmark: "12–16% unlevered", source: proForma, betterWhen: "higher" },
  time_to_energize_months: { concept: "Months until the first revenue-bearing MW.", formula: "min(phase.energize_month)", benchmark: "grid 5–7 yr · BTM gas 18–30 mo", source: speed, betterWhen: "lower" },
  demand_capture_pct: { concept: "Share of addressable demand actually served.", formula: "∫min(demand, capacity) / ∫demand", benchmark: "> 85% for a well-phased site", source: kpi, betterWhen: "higher" },
  stranded_capacity_mw_months: { concept: "Capacity built ahead of demand (underutilization).", formula: "∫max(capacity − demand, 0)", benchmark: "cheaper than shortfall, not free", source: bubble, betterWhen: "lower" },
  shortfall_mw_months: { concept: "Demand you could not serve (shortage).", formula: "∫max(demand − capacity, 0)", benchmark: "asymmetric: shortage costs more than surplus", source: kpi, betterWhen: "lower" },
  composite_risk_score: { concept: "Blended 0–100 risk across the radar axes.", formula: "weighted mean of axis scores", benchmark: "< 40 investable", source: kpi, betterWhen: "lower" },
  utilization_breakeven_pct: { concept: "Utilization at which NPV = 0.", formula: "solve NPV(utilization) = 0", benchmark: "keep ≥ 15 pts below plan", source: bubble, betterWhen: "lower" },
  mw_online_final: { concept: "IT load online at the end of the hold.", formula: "Σ phase.it_load_mw", benchmark: "= target_it_load_mw", source: kpi, betterWhen: "higher" },

  // --- SitePlan controls ---
  "revenue.compute.gpu_hour_price": { concept: "Contracted $/GPU-hour (master lever).", formula: "revenue = price × GPUs × 8760 × utilization", benchmark: "20–60% premium for speed", source: speed },
  "revenue.compute.utilization_pct": { concept: "Share of GPU-hours sold; the least observable input.", formula: "sold GPU-hours / available GPU-hours", benchmark: "60–85% self-reported", source: bubble },
  "power.interconnection.grid_energize_month": { concept: "When the grid tie can carry load (master lever, usually the binding constraint).", formula: "queue + transformer lead time", benchmark: "interconnection 5–7 yr", source: power },
  "costs.gpu.depreciation_years": { concept: "Accounting life of the accelerators (master lever, contested).", formula: "annual depreciation = unit_cost / years", benchmark: "3–7 yr; used-H100 retains ~50–60% at 3 yr", source: lifecycle },
  "compute.kw_per_rack": { concept: "Rack density; gates the cooling mode.", formula: "racks = target_it_load_mw × 1000 / kw_per_rack", benchmark: "40 (air) → 120 (liquid) → 600 kW/rack", source: lifecycle },
  "compute.cooling": { concept: "Cooling technology; air tops out ~40 kW/rack.", formula: "feasible iff kw_per_rack ≤ ceiling(cooling)", benchmark: "AIR ≤ 40 · LIQUID_DTC 60–120+", source: lifecycle },
  "compute.pue": { concept: "Power usage effectiveness.", formula: "facility_mw = it_load_mw × pue", benchmark: "~1.1–1.2", source: power },
  "compute.target_it_load_mw": { concept: "Total critical IT load the site is planned for.", formula: "Σ phases", benchmark: "100–1000 MW campuses", source: siting },
  "phasing.mode": { concept: "How capacity is staged over time.", formula: "SINGLE_SHOT | EXPLICIT | OPTIMIZE", benchmark: "phase to the demand ramp", source: kpi },
  "phasing.phases": { concept: "Explicit phases: size, start, energize, power source.", formula: "capacity(t) = Σ it_load_mw · [t ≥ energize_month]", benchmark: "≥ 12 months between phases", source: kpi },
  "phasing.policy": { concept: "Bounds the optimizer's phase design (used when it runs with mode=OPTIMIZE).", formula: "count ≤ max_phases · min ≤ MW ≤ max · spacing ≥ min months · shortfall ≤ max", benchmark: "4 · 25–100 MW · 6 mo · 20 MW", source: kpi },
  "phasing.policy.max_phases": { concept: "Upper bound on the number of phases.", formula: "count ≤ max_phases", benchmark: "3–5", source: kpi },
  "phasing.policy.min_phase_mw": { concept: "Smallest phase worth building.", formula: "it_load_mw ≥ min", benchmark: "≥ 25 MW", source: kpi },
  "phasing.policy.max_phase_mw": { concept: "Largest single phase.", formula: "it_load_mw ≤ max", benchmark: "≤ 100 MW", source: kpi },
  "phasing.policy.min_months_between_phases": { concept: "Minimum spacing between energizations.", formula: "energize[i+1] − energize[i] ≥ min", benchmark: "6–12 mo", source: kpi },
  "phasing.policy.max_shortfall_mw": { concept: "Never be short of demand by more than this.", formula: "max(demand − capacity) ≤ value", benchmark: "20 MW", source: kpi },
  "run.monte_carlo.enabled": { concept: "Sample the declared input distributions to get P10/P50/P90 bands.", formula: "seeded, N = iterations", benchmark: "1,000 iterations < ~1 s", source: kpi },
  "optimization.objective.type": { concept: "What the optimizer minimizes or maximizes.", formula: "argmin f(plan) s.t. constraints", benchmark: "MIN_STRANDED_PLUS_LCOC is the flagship", source: kpi },
  "optimization.constraints": { concept: "Hard limits on summary metrics.", formula: "metric op value", benchmark: "e.g. total_capex ≤ 8e9", source: kpi },
  "optimization.decision_vars": { concept: "Plan paths the optimizer may vary.", formula: "min ≤ value ≤ max, in steps", benchmark: "phase count/size/timing + power source", source: kpi },

  // --- regions / overlays ---
  "region.context_map": { concept: "The site on a real basemap (Esri Gray Canvas, OpenStreetMap-derived) with a scale bar; zoom and pan to judge distance.", formula: "overlays: power · water · latency, drawn at true km scale", benchmark: "—", source: siting },
  "overlay.power": { concept: "One marker per power source with a dashed tie to the site. The plan has no source coordinates, so placement is illustrative (not surveyed): BTM assets next to the parcel, a grid tie ~25 km, a PPA further out.", formula: "sources by type · available_month", benchmark: "BTM gas 18–30 mo", source: power },
  "overlay.water": { concept: "Water stress index 0..1 (cooling constraint) as a tint over the ~60 km region the site draws on; darker = more stressed.", formula: "fill opacity = 0.1 + 0.5 × site.water_stress_index", benchmark: "> 0.6 favors dry / liquid cooling", source: siting },
  "overlay.latency": { concept: "How far the site can serve each demand class, as rings at real distances. Assumes ~1 ms RTT per 100 km of fibre with a 1.5× route factor.", formula: "metro ≲ 2 ms → ≈80 km · regional ≲ 10 ms → ≈400 km · training (≳ 30 ms, tolerant) → ≈1,500 km", benchmark: "training is latency-tolerant", source: siting },
  "region.site_schematic": { concept: "Parametric parcel model; scrub time to see phases land.", formula: "Result.schematic blocks by energize_month", benchmark: "footprint < 60% keeps expansion optionality", source: siting },
  "region.phasing": { concept: "The first-class lever: stage capacity against the demand ramp.", formula: "shortfall vs stranded areas", benchmark: "track demand within 20 MW", source: kpi },
  "region.critical_path": { concept: "Revenue starts at energization; the longest chain sets the date.", formula: "max(interconnection, transformers, construction)", benchmark: "transformers 128–160 wk", source: power },
  "region.pro_forma": { concept: "Lifecycle economics and the three master levers.", formula: "LCOC · yield-on-cost · NPV", benchmark: "see each tile", source: proForma },
  "region.risk": { concept: "Where the downside is.", formula: "radar · Monte Carlo bands · tornado", benchmark: "P10/P50/P90", source: kpi },
  "region.optimization": { concept: "Objective + constraints + decision vars → frontier → apply best plan.", formula: "Result.optimization", benchmark: "converged=true", source: kpi },
  "chart.risk_radar": { concept: "Risk score per axis, 0 (none) to 100.", formula: "Result.charts[risk_radar]", benchmark: "< 40 per axis", source: kpi },
  "chart.frontier": { concept: "Every candidate the optimizer evaluated.", formula: "x = LCOC, y = stranded MW-months", benchmark: "best = lowest-left feasible", source: kpi },
  "toolbar.set_baseline": { concept: "Pin the current plan and its Result as the baseline scenario.", formula: "baseline = clone(plan, Result); undo/redo never touch it", benchmark: "pin before an optimize or a what-if", source: kpi },
  "toolbar.compare": { concept: "Juxtapose the current Result against the baseline: Δ on every tile, ghosted baseline series on the charts.", formula: "Δ = current − baseline (and % of baseline)", benchmark: "green = better in that metric's direction", source: kpi },
  "chart.tornado": { concept: "Swing of the target metric when each input moves ±delta.", formula: "(high − base, low − base) / base", benchmark: "top-2 usually price + utilization", source: bubble },
};

/** Never throws: an unknown key yields a visible placeholder so a missing entry is noticed, not hidden. */
export function explain(key: string): GlossaryEntry {
  return glossary[key] ?? { concept: `No glossary entry for "${key}"`, formula: "—", benchmark: "—", source: "—" };
}
