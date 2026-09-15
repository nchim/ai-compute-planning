// STUB: WS7 owns the real glossary (`web/src/views/site/glossary.ts`). Until it merges, `explain`
// answers from this small local one; swap the import when the real file lands.
const entries: Record<string, string> = {
  lcoc:
    "Levelized cost of compute ($/GPU-hour): all-in lifetime cost (capex incl. GPUs, opex, power) divided by " +
    "delivered GPU-hours. The engine reports it as summary.lcoc_per_gpu_hour.",
  energization:
    "The month power is actually delivered to the IT load; revenue starts here, not at construction start. " +
    "summary.time_to_energize_months is usually the binding constraint.",
  pue: "Power usage effectiveness: facility power / IT power. ~1.1–1.2 for modern AI halls.",
  "yield on cost": "Stabilized NOI / total capex. Benchmark ~10–12% for AI facilities.",
  "stranded capacity":
    "MW-months of built capacity with no demand to serve (summary.stranded_capacity_mw_months). The bounded, " +
    "partly recoverable side of the capacity-risk asymmetry.",
  shortfall:
    "MW-months of demand the site could not serve (summary.shortfall_mw_months). The competitive, partly " +
    "irreversible side of the asymmetry.",
  "demand capture":
    "Share of the demand ramp actually served over the hold (summary.demand_capture_pct).",
  "utilization breakeven":
    "The utilization at which the site's returns hit the hurdle (summary.utilization_breakeven_pct). A " +
    "two-sided risk, not a floor.",
  "agility premium":
    "costs.agility_premium_pct: capex uplift for designs that can be re-fitted (e.g. liquid-ready slabs, " +
    "higher floor load) — paid explicitly, never hidden in a blended number.",
  "btm gas":
    "Behind-the-meter gas generation as a bridge source (PowerType BTM_GAS): ~18–30 months to power versus " +
    "5–7 years for grid interconnection, at a $/MWh premium.",
  interconnection:
    "The grid connection process; power.interconnection.grid_energize_month is when the utility delivers.",
  "depreciation life":
    "costs.gpu.depreciation_years (3–7): the accounting life of the GPUs; a contested margin lever.",
  density:
    "compute.kw_per_rack. Air cooling supports roughly ≤40 kW/rack; above that the plan needs LIQUID_DTC or " +
    "IMMERSION cooling and a slab rated for it (site.floor_load_psf).",
  "floor load": "site.floor_load_psf: slab rating; liquid-cooled racks need a higher rating than air-cooled.",
  phasing:
    "phasing.mode: SINGLE_SHOT (all at once), EXPLICIT (phases listed in phasing.phases) or OPTIMIZE " +
    "(the optimizer chooses count/size/timing subject to phasing.policy).",
  conservation:
    "Result.conservation: the engine's balance checks (time, land, capital, power, MW). all_passed must be true " +
    "for a Result to be trusted.",
};

function key(topic: string): string {
  return topic.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function explainTopic(topic: string): string {
  const k = key(topic);
  const hit = entries[k] ?? Object.entries(entries).find(([name]) => k.includes(name))?.[1];
  if (hit === undefined) {
    throw new Error(`no glossary entry for "${topic}"; known topics: ${Object.keys(entries).join(", ")}`);
  }
  return hit;
}
