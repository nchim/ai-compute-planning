# Agility / Adaptability of a Facility to Shifts in Inference/Compute Technology (L2 Deep Dive)

**Status:** 🟡 L2 strategic deep dive — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer
**Level:** L2 (strategic) — sits above L0 (parcel underwriting) and L1 (compute-asset economics) in the
KPI architecture; grounds "Layer 1b — Agility/adaptability." Companion to `05-facility-lifecycle.md`
(lifecycle mismatch overview) and `depreciation-gpu-residuals-deep-dive.md` (GPU-side depreciation).
Do not duplicate those — this file is about the *building's* capacity to absorb technology shifts, and
the price of that capacity.

## Framing

The core tension: **flexibility costs money now to save money (or avoid write-offs) later.** A facility
built to a single rigid spec (fixed rack density, fixed cooling type, fixed power topology) is cheaper
per MW today but bets that the current hardware generation's requirements will hold for the building's
economic life. A facility built with headroom (liquid-ready plumbing, over-provisioned power/cooling,
higher floor loading, modular electrical topology) costs more per MW today but preserves the option to
absorb 2–4 more hardware generations without a second capital event. The job of this layer is to price
that option — not just note that "flexibility is good."

Two separate technology shifts are colliding on the same buildings simultaneously:
1. **Density shift** — 40 kW (H100 air) → 120 kW (GB200 NVL72, liquid) → ~300–600 kW (Vera
   Rubin/Rubin Ultra) per rack, forcing a cooling-mode change (air → direct-to-chip liquid) that is not
   a simple retrofit.
2. **Workload-mix shift** — training (remote, power-optimized, latency-tolerant to ~100ms) is projected
   to cede share to inference (metro-proximate, latency-sensitive, smaller per-site power draw) by
   ~2027, which changes *where* and *how big* facilities should be built, independent of cooling.

## 1. Retrofit economics: air → high-density liquid

**Can it be done?** Yes, but the cost and feasibility depend entirely on what's already in the shell —
power capacity, floor structure, and ceiling/underfloor congestion — not just the cooling loop itself.

**Cost data (ranges, free sources):**
- Direct-to-chip retrofit capex: **$1–5 million per MW** in a standard facility, per industry estimates
  for a 10 MW facility conversion ([Global Data Center Hub / retrofit problem analysis](https://www.globaldatacenterhub.com/p/the-retrofit-problem-why-legacy-data)).
- Per-rack cooling hardware alone: direct-to-chip retrofit **$5,000–$15,000/rack**; full rack-level
  deployment including manifolds, CDUs, liquid-ready chassis **$30,000–$50,000/rack**; immersion
  **$20,000–$50,000/rack** in tank/fluid alone ([pixlodo, 2026 retrofit cost guide](https://pixlodo.com/liquid-cooling-retrofit-costs/)).
- Facility-level: **~$2M/MW retrofit vs. $11M+/MW greenfield liquid-cooled** on headline capex per one
  analysis ([STL Partners](https://stlpartners.com/press/liquid-cooling-retrofits-can-cost-roughly-80-less/)) —
  i.e., retrofits can run "roughly 80% less" than new AI-ready builds *when the shell/power/structure
  can absorb it*. A directional 20-rack retrofit example runs ~$3.3M all-in (equipment, electrical,
  labor, structural fixes, contingency) — enabling work (structural, electrical) often costs as much as
  the cooling hardware itself.
- One concrete case: a pharma company retrofitted a 2008-vintage facility to support 800 H100s for
  $4.2M vs. an estimated $35M for comparable new construction — "70% of new-construction performance at
  20% of the cost" ([Introl, retrofitting legacy DCs for AI](https://introl.com/blog/retrofitting-legacy-data-centers-ai-liquid-cooling-integration)).

**What strands a facility (retrofit is NOT viable) — the three failure modes:**
1. **Power.** Legacy facilities built for 5–8 kW/rack IT loads typically have utility service, switchgear,
   and busway sized for that envelope. Getting to 120+ kW/rack densities requires new utility
   interconnects, transformers, and distribution — this is effectively a greenfield electrical project
   layered onto an existing building, and it's the single most common blocker.
2. **Structure/floor loading.** Standard raised-floor design load per code (ASCE 7-22 / UFC 3-301-01) is
   **100–150 psf**; Intel recommends 350 psf for high-density DCs. A liquid-cooled 42U rack + CDU +
   filled manifold weighs **1,200–2,000 kg**, and local peak loads under CDUs can reach **~5,000 kg/m²**,
   requiring slabs rated ≥15 kN/m² and reinforced pedestal grids ([HuiYa floor loading guide 2026](https://www.huiyainc.com/news/data-center-raised-floor-loading-capacity-standards-weight-support-guide-2026); [Noxtel civil-works guide](https://noxtel.mx/liquid-cooling-in-existing-data-center-civil-works-and-technical-floor-you-need-before-installing-the-first-water-line/)). Typical legacy technical floors are sized for 500–800 kg/m² office loads — well
   short. Reinforcing an existing slab (vs. pouring new) is expensive, disruptive, and sometimes
   structurally infeasible without a shutdown.
3. **Legacy congestion.** Decades of underfloor cabling and raised-floor plenum congestion in older
   facilities leaves no clear path to run coolant piping/manifolds without a substantial gut ([DCD, retrofitting liquid cooling strategies](https://www.datacenterdynamics.com/en/opinions/retrofitting-liquid-cooling-for-ai-data-centers-strategies-for-success/)).

**When retrofit beats greenfield:** when the existing facility already has (a) adequate/expandable
power capacity or nearby substation headroom, (b) a slab that can be reinforced short of full teardown,
and (c) enough clear height/pathway for coolant distribution — i.e., essentially converted mining/crypto
sites and modern (post-2018) air-cooled halls with generous structural margin. Example: Microsoft's
$9.7B/5-yr, ~200MW lease of former Bitcoin-miner IREN capacity, and AiOnX's $500M deal to convert 15
Genesis Digital Assets crypto facilities to AI/HPC use ([TechTimes](https://www.techtimes.com/articles/318441/20260615/bitcoin-mining-pivots-ai-compute-aionx-acquires-13-gw-500m-deal.htm)). Even here, ASIC removal + GPU
install + liquid cooling + InfiniBand fabric is a near-total gut of the IT layer — the "retrofit" saves
the power infrastructure and shell/land entitlement, not the fit-out (crypto-to-AI conversions reportedly
run **50–70% less per MW** than new-build because the expensive, slow-to-permit power/land piece is
already done — [Measured AI](https://measuredai.substack.com/p/retrofit-premium-converting-data-centers)).

**When it's simply stranded:** ~68% of enterprise data centers built before 2015 reportedly lack the
power density and cooling capacity for modern AI workloads, and 82% of those have 10+ years remaining on
their leases — facilities built for 6–10kW/rack with no viable power upgrade path or floor capacity are
stranded for AI purposes regardless of retrofit spend, and remain usable only for legacy enterprise/non-
AI workloads ([Global Data Center Hub](https://www.globaldatacenterhub.com/p/the-retrofit-problem-why-legacy-data)). Separately, GPU-cluster-level obsolescence (H100/A100 vs. Blackwell-class
performance deltas) can strand *compute* even inside a perfectly good building — that's the
depreciation-side risk covered in the companion deep dive, not a facility-agility problem per se.

## 2. The "agility premium" — cost of building adaptable vs. fixed-spec

Quantified premiums found (treat as directional, not precise, since vendors rarely publish apples-to-
apples fixed-vs-flex comparisons):

- **Liquid-ready construction premium:** US liquid-cooled data centers carry an average construction
  premium of **~7–10%** over traditional air-cooled facilities ([irecruit.co 2026 cost benchmarks](https://www.irecruit.co/insights/data-center-construction-cost-per-mw-2026-benchmarks-owners)).
  This is the cost of building liquid-ready (piping, CDUs sized for it, structural allowance) from day
  one rather than air-only.
- **Powered shell vs. turnkey:** powered shell (structure + power + no IT fit-out, maximum flexibility
  for the tenant to choose cooling type/density later) runs **$4–8M/MW** vs. **$12–13M/MW** for a
  turnkey fully-fitted facility — but this isn't a pure "agility premium," it's shifting the fit-out
  capex and its associated technology risk onto the tenant, who then bears the retrofit-timing decision
  themselves ([datacenterHawk / dgtlinfra powered shell guides](https://dgtlinfra.com/powered-shell-data-centers/)).
- **Modular/phased build:** reported ~30% TCO savings vs. traditional builds, but importantly the
  mechanism is *avoiding oversized day-one shell/MEP* by phasing capacity in step with demand — i.e.,
  modularity buys agility (you're not locked into a single density spec built once) largely by deferring
  capital rather than by paying a premium ([Facilities Dive / Flex](https://www.facilitiesdive.com/news/modular-approach-can-speed-data-center-construction-by-30-flex/822815/)). This cuts against a naive
  "agility always costs more" framing: phased/modular design can make agility *cheaper* than a single
  big fixed-spec build, because it avoids stranding capacity you don't yet need, at the cost of some
  unit-cost inflation on later phases and multiple mobilization events.
- **Structural over-build (floor loading):** going from a 100–150 psf standard design to 350+ psf
  Intel-recommended high-density spec at time of initial construction is a marginal concrete/rebar cost
  (low single-digit % of shell cost) — cheap when done at greenfield, expensive-to-infeasible
  retrofitted later. This is the highest-leverage "buy now, don't pay later" agility lever because the
  cost asymmetry (cheap upfront, near-impossible after) is the most extreme of any lever here.
- **Power over-provisioning:** the search evidence here is more qualitative than quantified — datacenters
  commonly over-subscribe/over-provision distribution capacity below the switchboard level to allow
  flexible rack placement and workload scheduling, but no clean "$/MW premium for X% headroom" figure
  was found in free sources. Directionally: because the fixed cost of a facility is set by peak power
  delivery capacity, any headroom built in but not utilized raises effective $/kW-delivered until it's
  filled — so the "premium" shows up as a utilization-timing risk, not a fixed capex line item
  ([arXiv 2311.02651, Compute at Scale](https://arxiv.org/pdf/2311.02651)).

**Rough synthesis of the premium stack** (all directional, sourced above):
| Lever | Approx. upfront premium | Retrofit cost if skipped |
|---|---|---|
| Liquid-ready plumbing/CDU allowance | ~7–10% of construction cost | $1–5M/MW, or stranded if power/structure also inadequate |
| High floor loading (350 psf vs 100–150 psf) | low single-digit % of shell cost | often structurally infeasible without teardown |
| Powered shell (defer fit-out decision) | shifts $4–8M/MW to tenant later, saves ~$4–5M/MW upfront | tenant absorbs full fit-out risk/cost at time of technology choice |
| Modular/phased vs. single fixed build | can be cost-*negative* (~30% TCO savings) | re-fit each phase to new spec as needed; some mobilization overhead |
| Power distribution headroom | opportunity cost of unutilized capacity, not a clean %, hard to quantify from free sources | new utility interconnect/switchgear project, slow (multi-year) |

## 3. Refresh cadence vs. lease/financing terms — how it's actually reconciled

The mismatch is structural and explicit in the market now: hardware refresh cadence in disclosed
hyperscale deployments clusters at **42–66 months** (4-year floor set by MACRS depreciation norms and
residual-value compression; 6-year ceiling set by opex-vs-replacement-capex crossover), while facility
leases run **15-year initial terms with extension options** — e.g., CoreWeave's Helios leases are 15-year
base with two 5-year options (potential 25 years) ([Global Data Center Hub, valuation model](https://www.globaldatacenterhub.com/p/the-data-center-valuation-model-breaks); [electroneconomics, "everything under the GPU lasts longer than the contract"](https://electroneconomics.substack.com/p/everything-under-the-gpu-lasts-longer)).

Reconciliation mechanisms observed in the market:
- **Decouple the depreciation clock from the lease clock analytically.** The building's value is
  increasingly modeled on its ability to support the *next-generation* GPU density without structural
  change, not on the current tenant's hardware — i.e., underwriting treats "compute factories" as
  power/cooling/structure options, with the GPU refresh cycle as the primary depreciation variable
  layered on top, not baked into the real-estate cash flow model.
- **Shift from space+power leases to compute-output contracts.** Commercial terms are moving from
  leasing space/power to defined computational output (throughput, token generation under an SLA), and
  toward long-term capacity reservation / take-or-pay compute offtake structures — this re-prices the
  refresh risk into the compute contract rather than the real-estate lease, leaving the landlord exposed
  mainly to power/shell durability, not chip generation ([Clifford Chance, 2026 insights](https://www.cliffordchance.com/insights/thought_leadership/trends/2026/data-centres-and-ai-compute-infrastructure-insights-2026.html)).
- **Short-term GPU colocation/leases nested inside long-term facility leases.** Under ASC 842, GPU
  leases under 12 months can be treated as operating leases (off balance sheet-ish, more flexible),
  while the facility lease underneath is capitalized long-term debt — this lets the compute buyer
  refresh hardware on a 2–4 year cadence contractually distinct from the building's financing.
- **Neocloud leverage dynamic.** Neoclouds need long minimum-term customer commitments to secure
  creditworthiness for their own facility leases/debt, creating pressure toward longer AI-lab compute
  commitments than the labs would otherwise prefer given hardware refresh — a documented "structural
  deadlock" ([Compute Exchange, 2026 reserved GPU buyer's guide](https://compute.exchange/blogs/reserved-gpus-contract-length)).
- **Design-side hedge:** powered shell / liquid-ready / high floor-loading construction (Section 2) is
  the physical-asset-side answer to this same problem — building the shell so that a refresh cycle never
  requires re-doing the shell/electrical, only the IT layer, which is exactly what keeps the 15-year debt
  serviceable across 3–5 hardware generations.

## 4. Training → inference shift: facility implications

- **Latency budget determines siting tier**, per 2026 industry framing: 50–200ms (regional campuses,
  batch workloads) / 20–50ms (metro-proximate, live chat/copilots/agents) / <20ms (edge, ad-bidding/
  trading) — vs. training's ~100ms tolerance between regions, which lets it site remotely for cheap
  power ([Build.inc, training vs inference design differences](https://build.inc/insights/training-vs-inference-data-center-design-differences); [Netrality, edge DC guide](https://netrality.com/blog/edge-data-centers-complete-guide/)).
- **Per-site power scale shrinks:** inference campuses run **20–100 MW** vs. training's **500 MW+**,
  which structurally favors metro-adjacent/brownfield/smaller sites that wouldn't qualify for hyperscale
  training but are perfectly viable for inference — this reopens facilities and land parcels previously
  deprioritized for lacking gigawatt-scale power access.
- **Rack density profile differs but both are climbing:** training pushes 100–160 kW/rack today, headed
  to 300+ kW with Vera Rubin/Rubin Ultra; inference profiles vary more by model/batch size but trend
  toward similar liquid-cooling requirements as reasoning/agentic inference workloads grow more compute-
  intensive per query.
- **Which facilities adapt vs. strand:** training-era gigawatt remote campuses with liquid-ready,
  high-floor-loading design adapt well to *either* future training generations or a subsequent pivot to
  regional inference (if fiber/latency allows); metro colocation facilities with adequate power/floor
  capacity adapt well to inference; older sub-10kW/rack enterprise DCs strand for both. The strategic
  implication for developers: a "portfolio approach" — training-optimized campuses in high-power remote
  locations plus inference-optimized facilities in metros near cloud on-ramps — is emerging as the
  standard hedge against uncertainty in how the training/inference mix evolves ([DCD, "training built
  the campuses, inference will choose the markets"](https://www.datacenterdynamics.com/en/opinions/training-built-the-campuses-inference-will-choose-the-markets/)).

## 5. Decision framework

### Design levers for adaptability (ranked roughly by cost-asymmetry / leverage)
1. **Floor loading / structural allowance** — highest leverage: cheap at greenfield (~low single-digit %
   premium), often infeasible to retrofit. Build to 300–350 psf even if day-one density doesn't need it.
2. **Power capacity headroom + upgradable distribution topology** — utility interconnect and switchgear
   sizing for 2–3x day-one density; oversized conduit/duct bank pathways cost little extra at trench-dig
   time but are extremely expensive to add later.
3. **Liquid-ready plumbing (dry pipe / CDU stub-outs)** — ~7–10% construction premium; enables air→liquid
   conversion without re-opening the slab or ceiling.
4. **Modular/phased build sequencing** — defers capital and lets each phase match the current hardware
   generation's spec, avoiding a single fixed bet; ~30% TCO advantage over one-shot fixed builds when
   demand ramp is uncertain.
5. **Powered-shell / flexible fit-out contracting** — shifts technology-choice timing risk to whoever
   signs the fit-out (tenant or a later capital event), preserving the landlord's optionality on the
   underlying shell.
6. **Site/metro selection matched to workload type** — remote+power-rich for training-flexibility,
   metro-adjacent for inference-flexibility; a portfolio rather than a single-site bet hedges the
   training/inference mix uncertainty itself.
7. **Contract structure (compute-output / capacity-reservation contracts, short-tenor GPU sub-leases
   nested in long facility leases)** — doesn't change the physical building but re-prices refresh risk
   onto the party best positioned to bear it.

### Proposed variables to score a facility's adaptability (for tool/model use)
- `floor_load_capacity_psf` (vs. 100–150 baseline / 350 high-density target) → binary/scalar headroom
  ratio to the density trajectory
- `power_headroom_ratio` = provisioned switchgear/substation capacity ÷ current IT load (captures
  over-subscription capacity for future density)
- `cooling_mode` (air-only / liquid-ready-dry-pipe / liquid-installed) and `max_supportable_kw_per_rack`
  given current mode without structural work
- `structural_upgrade_cost_per_mw_if_needed` (est. $/MW to go from current to next-gen density —
  distinguish "retrofittable" $1–5M/MW cases from "stranded" ∞/NA cases)
- `modularity_index` — qualitative/ordinal: single fixed-spec build vs. phased/modular blocks (affects
  ability to re-spec later phases without touching earlier ones)
- `lease_tenor_vs_refresh_ratio` = facility lease term (yrs) ÷ expected hardware refresh cadence (~4–6
  yrs) — a high ratio signals more refresh cycles the shell must absorb without a capital event
  ("clocks-mismatch factor")
- `contract_flexibility_type` — space/power lease vs. compute-output/capacity-reservation contract
  (affects who bears refresh-timing risk)
- `latency_tier_fit` — categorize site by achievable latency to target population centers (sub-20ms /
  20–50ms / 50–200ms) against workload_mix (training-weighted vs. inference-weighted) to score exposure
  to the training→inference siting shift
- `site_power_scale_mw` relative to workload class (training campuses skew 500MW+, inference 20–100MW) —
  a mismatch (e.g., a 500MW remote campus in an inference-shifted future) signals stranding risk if the
  workload mix shifts faster than the facility can be repurposed or resold

### Pricing the agility-vs-economics tradeoff (approach, not a finished formula)
Treat the agility premium as a **real option value**: upfront premium (Section 2 numbers) is the option
premium; the payoff is avoiding a future retrofit-or-strand cost (Section 1 numbers) weighted by the
probability that the facility's initial spec becomes obsolete before the shell's useful life ends. A
workable framing:
`Expected value of building flexible = (P_obsolescence_before_shell_EOL × avoided_retrofit_or_strand_cost) − upfront_agility_premium`
where `P_obsolescence_before_shell_EOL` should be informed by the density trajectory cadence (roughly a
new density tier every 18–36 months per Nvidia's cycle) compared against the shell's 15–30 year life —
meaning most facilities will face at least 3–5 such decision points, making the option very likely to be
exercised at least once. This structurally favors paying the agility premium for the cheap, high-
asymmetry levers (floor loading, power headroom, liquid-ready stub-outs) and being more selective about
the expensive ones (full liquid fit-out, maximum modularity) where the "wait and retrofit" cost is closer
to the "build it flexible now" cost.

## What to expose as tool/model levers

For a KPI/underwriting tool operating at this L2 layer, expose:
- An **adaptability score** (composite of the variables above) alongside the standard $/MW and $/kW
  pro forma outputs, so a facility can be compared on cost *and* option value, not cost alone.
- A **retrofit-cost estimator** input/output: given current floor loading, power headroom, and cooling
  mode, estimate $/MW to reach the next density tier, with a flag for "structurally infeasible /
  stranded" when floor loading or power capacity cannot be remediated short of teardown.
- A **lease-tenor-vs-refresh mismatch flag**: surface `lease_tenor_vs_refresh_ratio` prominently since it
  is the clearest single proxy for how many capital events a given deal structure will force.
- A **workload-mix siting fit score**: latency tier vs. training/inference workload assumption, to flag
  facilities at risk of stranding if the training→inference mix shifts faster than modeled.
- Sensitivity toggles on `P_obsolescence_before_shell_EOL` and the density-cadence assumption (currently
  ~18–36 months per tier) so users can stress-test how aggressively to pay the agility premium under
  faster- or slower-than-expected hardware cycles.

## Open questions / unresolved
- No clean, apples-to-apples free-source figure exists for the **$/MW premium of power distribution
  over-provisioning** specifically (as distinct from liquid-readiness or floor loading) — this is the
  weakest-evidenced lever in the stack above and would benefit from a primary-source (10-K capex
  breakdown or vendor RFP data) deep dive.
- It's unclear from public sources how *loan covenants* on facility-level debt (as opposed to GPU-backed
  debt, covered in the companion depreciation deep dive) explicitly price in adaptability — i.e., do
  lenders underwrite floor loading / power headroom as collateral-value factors today, or is this an
  emerging practice not yet reflected in covenant structures?
- The real-option framing above is directionally sound but not calibrated with real probabilities;
  a rigorous version would need actual base rates on how often facilities built to a given generation's
  spec require a capital event before shell end-of-life — no public dataset was found for this.

## Sources
- [Liquid cooling retrofits can cost roughly 80% less than new AI-ready data centre builds](https://stlpartners.com/press/liquid-cooling-retrofits-can-cost-roughly-80-less/) — STL Partners.
- [Liquid Cooling Retrofit Costs 2026: Data Center ROI and Budget Guide](https://pixlodo.com/liquid-cooling-retrofit-costs/) — pixlodo, 2026.
- [Retrofitting Legacy Data Centers for AI](https://introl.com/blog/retrofitting-legacy-data-centers-ai-liquid-cooling-integration) — Introl.
- [The Retrofit Problem: Why Legacy Data Centers Cannot Serve AI Workloads](https://www.globaldatacenterhub.com/p/the-retrofit-problem-why-legacy-data) — Global Data Center Hub.
- [Retrofitting liquid cooling for AI data centers: Strategies for success](https://www.datacenterdynamics.com/en/opinions/retrofitting-liquid-cooling-for-ai-data-centers-strategies-for-success/) — DCD.
- [Why Converting Crypto Mines to AI Data Centers Costs 50–70% Less Per Megawatt Than Building New](https://measuredai.substack.com/p/retrofit-premium-converting-data-centers) — Measured AI.
- [Bitcoin Mining Pivots to AI Compute: AiOnX Acquires 1.3 GW in $500M Deal](https://www.techtimes.com/articles/318441/20260615/bitcoin-mining-pivots-ai-compute-aionx-acquires-13-gw-500m-deal.htm) — Tech Times.
- [Understanding Powered Shell Data Centers](https://datacenterhawk.com/resources/hawkpodcast/understanding-powered-shell-data-centers) — datacenterHawk.
- [Powered Shell Data Centers: A Comprehensive Guide](https://dgtlinfra.com/powered-shell-data-centers/) — dgtlinfra.
- [Data Center Construction Cost per MW in 2026 (2026 Benchmarks)](https://www.irecruit.co/insights/data-center-construction-cost-per-mw-2026-benchmarks-owners) — irecruit.
- [Modular approach can speed data center construction by 30%: Flex](https://www.facilitiesdive.com/news/modular-approach-can-speed-data-center-construction-by-30-flex/822815/) — Facilities Dive.
- [Modular Data Center for AI: NVL72 & Retrofits](https://www.moduledge.com/blog/modular-data-center-ai) — ModulEdge.
- [Data Center Raised Floor Loading Capacity Standards & Weight Support Guide 2026](https://www.huiyainc.com/news/data-center-raised-floor-loading-capacity-standards-weight-support-guide-2026) — HuiYa.
- [Liquid Cooling in an Existing Data Center: Civil Works](https://noxtel.mx/liquid-cooling-in-existing-data-center-civil-works-and-technical-floor-you-need-before-installing-the-first-water-line/) — Noxtel.
- [Design Parameters for Data Center Facilities](https://www.structuremag.org/article/design-parameters-for-data-center-facilities/) — Structure Magazine.
- [The Data Center Valuation Model Breaks on the Compute Factory](https://www.globaldatacenterhub.com/p/the-data-center-valuation-model-breaks) — Global Data Center Hub.
- [Everything under the GPU lasts longer than the contract that pays for it](https://electroneconomics.substack.com/p/everything-under-the-gpu-lasts-longer) — electroneconomics.
- [Reserved GPUs Contract Length: A Complete 2026 Buyer's Guide](https://compute.exchange/blogs/reserved-gpus-contract-length) — Compute Exchange.
- [Data Centres & AI Compute Infrastructure Insights 2026](https://www.cliffordchance.com/insights/thought_leadership/trends/2026/data-centres-and-ai-compute-infrastructure-insights-2026.html) — Clifford Chance.
- [Training built the campuses. Inference will choose the markets](https://www.datacenterdynamics.com/en/opinions/training-built-the-campuses-inference-will-choose-the-markets/) — DCD.
- [Training vs. Inference Data Centers: Two Different Buildings](https://build.inc/insights/training-vs-inference-data-center-design-differences) — Build.inc.
- [Edge Data Centers: The Complete Guide to Edge Computing Infrastructure in 2026](https://netrality.com/blog/edge-data-centers-complete-guide/) — Netrality.
- [Hyperscale Data Center Lease Terms in 2026: What Developers Need to Know](https://build.inc/insights/hyperscale-data-center-lease-terms-2026) — Build.inc.
- [Compute at Scale: A Broad Investigation into the Data Center Industry](https://arxiv.org/pdf/2311.02651) — arXiv 2311.02651.
- **Archive-worthy artifacts:** none identified this pass — best next step is primary-source 10-K/CapEx
  breakdowns (hyperscaler capex disclosures) and actual loan-covenant language on facility-level debt,
  neither of which is available via free web search.
