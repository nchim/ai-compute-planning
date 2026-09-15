# Landscape Synthesis — Shallow Pass (2026-09-15)

Consolidation of the first shallow-pass wave across all 18 topics. This is the "so what" layer:
the cross-cutting themes, a master KPI table, tool implications, and ranked deep-dive candidates.
Individual topic files under `topics/NN-slug/` hold the detail and sources.

---

## The big picture in ten themes

1. **Power *timing* is the master constraint — and it's invisible in standard benchmarks.**
   Grid interconnection runs 5–7+ yr (PJM/N. Virginia ~7 yr), transformers 128–160 wk, generator
   step-ups 144 wk. A ~2,600 GW national interconnection backlog has an ~80% withdrawal rate. The
   binding variable in AI DC development is *when you can energize*, not when you can build. Answers
   the "why not 30 days" question directly. See [[04-deployment-velocity]], [[06-power-energy]].

2. **The capex mix has flipped: hardware now dominates $/MW.** Standard shell ~$10–12M/MW;
   AI-optimized shell $15–20M/MW; **fully-built AI facility with GPUs $30–40M/MW** — i.e. the
   compute is now the majority of the asset, and the building is the minority. Electrical systems
   are 40–45% of the *build* capex, cooling 15–25%. See [[01-lifecycle-pro-forma]].

3. **Two asset lives collide.** Facility shell/electrical/mechanical last 15–30 yr; GPUs last
   3–6 yr (economically arguably 2–3). This mismatch is the central lifecycle problem for
   developers *and* the hidden margin lever for operators. See [[05-facility-lifecycle]].

4. **Depreciation is the hidden margin lever and a systemic risk.** Hyperscalers stretched GPU
   useful life from 3–4 → 5–6 yr (Meta to 11–12 yr in places), ~$18B/yr earnings effect. Burry
   estimates ~$176B of understated depreciation 2026–2028. This connects directly to GPU-backed
   debt collateral quality and bubble risk. See [[05-facility-lifecycle]], [[15-demand-bubble-risk]].

5. **Training and inference are diverging into two different economic problems.** Training:
   capex-intensive, remote-tolerant, batch, latency-insensitive → frontier markets (W. Texas,
   Ohio, Iowa). Inference: opex-like, latency-sensitive, distributed → near demand/legacy hubs.
   They want different sites and different pro formas. See [[03-unit-economics]], [[09-site-selection]].

6. **The market has bifurcated into "landlords" and "asset-light resellers," and NVIDIA is
   vertically integrating across the stack.** Colo/REITs (and increasingly neoclouds) own the real
   estate; neoclouds resell compute owning almost none. NVIDIA is now chip vendor + investor +
   (reportedly) landlord — circular financing that creates correlated risk. See [[13-market-structure]].

7. **Commitment is "sticky" but execution is slipping.** Self-build capex forecasts moved only ~1%
   even as an estimated **30–50% of planned 2026 capacity slips to 2028** on power/interconnection
   bottlenecks. The gap between committed GW and buildable GW is the story. See [[14-speed-to-market]],
   [[15-demand-bubble-risk]].

8. **Regulatory friction escalated from local zoning to state moratoriums, and is fusing with the
   sustainability backlash.** NY 50MW+ permitting freeze; Texas statewide grid-connection audit
   (Aug 2026); 100+ local moratoriums; 71% of Americans oppose a nearby DC (Gallup, Mar 2026).
   Ratepayer impact is now political (PJM capacity cost +$9.3B; +$16–18/mo residential bills).
   Interconnection access and permitting are now *decoupled* and both gate. See [[10-regulatory-community]],
   [[12-sustainability]].

9. **"Sovereign AI" in the Gulf is chip-dependent and geopolitically contingent — a hedge, not
   independence.** UAE elevated to export Country Group A:5 (Jul 2026); Saudi HUMAIN/G42 capped at
   ~35k GB300-equivalents under a bilateral deal. All of it rests on US NVIDIA silicon and a
   negotiated diplomatic posture. See [[11-sovereignty-geopolitics]].

10. **Alternatives probably won't cap centralized demand; the needle-movers are efficiency and
    custom silicon.** Edge/on-prem/personal-AI substitute *ownership*, not aggregate demand;
    Jevons paradox dominates (cheaper inference → more tokens consumed). The real efficiency reserve
    is utilization — inference decode MFU is only **8–12%**. Custom ASICs (Trainium3, TPU v7, Maia,
    MTIA) and co-packaged optics (60–70% link-power savings) are the biggest economic levers, but
    ASICs are *captive* (not rentable), splitting insiders from everyone paying NVIDIA margins.
    The one genuine decentralization wildcard is DiLoCo-style distributed training.
    See [[16-innovation-frontier]], [[17-competing-deployment]].

---

## Master KPI table (shallow-pass values — verify before use)

### Power, grid & lead times
| Metric | Value | Topic |
|---|---|---|
| PJM / N. Virginia interconnection wait | ~7 yr | 06 |
| ERCOT large-load wait | 3–4 yr | 06 |
| National interconnection queue backlog | ~2,600 GW (~80% withdrawal rate) | 10 |
| ERCOT large-load queue | ~410–474 GW (73–90% data centers) | 06/10 |
| Large power transformer lead time | 128–160 wk | 04/06 |
| Generator step-up unit lead time | 144 wk | 06 |
| Behind-the-meter gas plant build | 18–30 mo (12–15 mo aeroderivative) | 04/06 |
| Nuclear PPAs signed (mid-2026) | ~9.8 GW across 13 deals; >92% capacity factor | 06/12 |
| Electricity as % of AI training opex | ~32% | 06 |
| Electricity as % of full GPU TCO | ~11% | 06 |

### Capex, cooling & density
| Metric | Value | Topic |
|---|---|---|
| Standard shell-and-core capex | ~$10–12M/MW | 01 |
| AI-optimized shell-and-core | $15–20M/MW | 01 |
| Fully-built AI facility incl. GPUs | $30–40M/MW | 01 |
| Electrical systems / cooling share of build capex | 40–45% / 15–25% | 01 |
| Tier IV redundancy premium | up to +40% | 01 |
| Rack density: H100 air-cooled | ~40 kW | 08 |
| Rack density: GB200 NVL72 | 120 kW | 08 |
| Rack density: Vera Rubin NVL144 (target) | ~600 kW | 08 |
| Air-cooling ceiling / direct-to-chip liquid | 30–40 / 60–120 kW/rack | 08 |
| Liquid cooling adoption | ~22% of DCs | 08 |
| WUE (water use effectiveness) | 0.2–1.8 L/kWh | 12 |

### Compute supply & hardware lifecycle
| Metric | Value | Topic |
|---|---|---|
| CoWoS advanced-packaging lead time | >12 mo | 07 |
| HBM demand met (Micron) | ~55–60%; HBM3E price +~20% (2026) | 07 |
| NVIDIA share of TSMC 2026 CoWoS | ~60% | 07 |
| GPU depreciation life (assumed) | stretched 3–4 → 5–6 yr (~$18B/yr effect) | 05/15 |
| Est. understated depreciation 2026–2028 (Burry) | ~$176B | 05/15 |
| Used H100 price | $18–22K (was ~$50K peak); ~61% retained @2yr, 45–55% @3yr | 05 |

### Compute economics & efficiency
| Metric | Value | Topic |
|---|---|---|
| Frontier training cost | $200–500M (2026) → $1–3B (2027); compute = 65–75% | 03 |
| Inference, GPT-4-class | $0.40–0.80 / M tokens (was ~$30/M in 2023) | 03 |
| Inference, frontier reasoning | $15–25 / M output tokens | 03 |
| AI-native gross margin | ~52% avg (2026); Anthropic API reportedly >80% | 03 |
| MFU: training (dense / MoE) | 40–60% / 25–40% | 16 |
| MFU: inference decode | **8–12%** (large efficiency reserve) | 16 |
| Co-packaged optics link-power saving | 60–70% (1.6T link 30W→9W) | 16 |
| Trainium3 vs Trainium2 | ~4.4× | 16 |

### Market size & commitments
| Metric | Value | Topic |
|---|---|---|
| Global AI spend | $1.5T (2025) → $2.5T (2026) | 17 |
| Hyperscaler capex | ~$410B (2025) → $700B+ (2026) | 13/15 |
| McKinsey global DC capacity by 2030 | 219 GW (156 GW AI); $5.2T AI capex | 15 |
| Goldman DC power demand growth by 2030 | +165–170%; US demand doubling by 2027 | 15 |
| Neocloud sector | >$150B combined valuation; ~$48B run-rate → ~$300B by 2030 | 13 |
| CoreWeave backlog | $99.4B; 49 DCs (Mar 2026) | 13 |
| Stargate | $500B / ~10 GW target; >$400B committed / >8 GW (Feb 2026) | 14 |
| Oracle–OpenAI | $300B / 5 yr (from 2027) + up to 4.5 GW | 14 |
| Anthropic | ~$52B, 1M TPUv7, 1+ GW (Project Rainier) | 14 |
| Planned 2026 capacity slipping to 2028 | 30–50% | 14/15 |

### Regulatory, community & sovereignty
| Metric | Value | Topic |
|---|---|---|
| Public opposition to a nearby DC | 71% (Gallup, Mar 2026); 100+ local moratoriums | 10 |
| PJM 2025–26 capacity cost increase / bill impact | +$9.3B; ~+$16–18/mo residential | 10 |
| Loudoun County noise limit | 55 dBA at residential property line | 10 |
| Saudi HUMAIN/G42 chip cap | ~35,000 GB300-equivalents each (bilateral) | 11 |
| UAE export status | Country Group A:5 (Jul 2026, license-free for validated users) | 11 |
| Gulf sovereign capital | HUMAIN $100B+/11 DCs/2.2 GW; Stargate UAE 1 GW target | 11 |

---

## Implications for the tools we want to build

- **Pro forma / underwriting tool:** revenue start must be keyed to **energization date**, not
  construction completion — the interconnection/power timeline is the critical path and the single
  biggest swing factor. Treat transformer/switchgear/generator lead times as first-class inputs.
- **Depreciation must be a first-class, scenario-able lever** (3/4/5/6-yr toggles) — it swings
  reported margins and collateral quality more than almost anything else.
- **Separate training vs inference modes** — different utilization, siting, latency, and revenue
  assumptions; a single template will mislead.
- **Data gap = opportunity:** no *free/public* real AI pro forma surfaced. Credible public models
  are paywalled (SemiAnalysis TCO, Thunder Said Energy, Flevy Excel packs). A defensible,
  transparent pro forma is itself a differentiated first artifact.

---

## Ranked deep-dive candidates (next wave)

1. **Reconstruct a real AI-specific pro forma** with a power-timing-linked revenue trigger and a
   training-vs-inference split; triangulate against the paywalled models (SemiAnalysis TCO,
   Thunder Said Energy, Flevy). *Highest tool value.* [01/03/04/F]
2. **GPU depreciation vs. real residual value + the redeployment "waterfall,"** tied to GPU-backed
   debt and bubble risk; replace blog figures with primary 10-K disclosures. [05/15]
3. **Power-market deep dive:** $/MWh across PPA types, BTM-gas economics, which markets drive the
   30–50% 2026→2028 slippage, the Texas Aug-2026 audit outcome, and realistic nuclear-PPA delivery
   timing (existing-plant uprates vs slow SMR new-build). [06/01/12]
4. **Backlog quality:** what fraction of lab/neocloud backlog is binding take-or-pay vs cancellable,
   and how exposed is it to NVIDIA-style circular financing. [13/14/15]
5. **Cost-per-token and MFU by workload** across GB200/GB300 vs H100, incl. the captive-ASIC vs
   rented-NVIDIA cost delta. [03/16]
6. **Distributed training (DiLoCo-style) feasibility** as the one plausible genuine decentralization
   threat to centralized DCs. [17]

---

## Wave 2 — Deep-dive findings (2026-09-15)

Three deep dives completed on free/public sources. Detail in the respective topic folders:
`01-lifecycle-pro-forma/pro-forma-reconstruction.md`, `05-facility-lifecycle/depreciation-gpu-residuals-deep-dive.md`,
`06-power-energy/power-market-economics-deep-dive.md`.

### Pro forma reconstruction (100 MW AI campus, GB200-class, PUE 1.14)
- **Full-stack capex $3.79B ($37.9M/MW)** — servers 56%, facility 30%, network 13%, land/utility ~1%
  (anchored to Epoch AI's public 1 GW TCO model).
- **Colo/lease mode:** shell capex ~$1.23B ($12.3M/MW); NOI ~$151.7M/yr → **yield-on-cost ~12.4%**,
  which matches Digital Realty's disclosed 10.6–12.3% stabilized development yields — independent
  cross-validation that the model is in the right zip code.
- **Compute-sales mode:** full $3.79B capex; ~80% EBITDA margin but **EBIT ≈ breakeven** once 4-yr
  GPU depreciation (~$743M/yr) applies — mirrors CoreWeave (56% adj. EBITDA, net loss). ±$1/GPU-hr ≈
  ±$270–280M EBIT.
- **Energization delay:** 12-mo delay destroys ~23% of shell development value; 24-mo ~47% (illustrative).
- **Swing factors (ranked):** (1) GPU-hour contracted price, (2) energization delay, (3) depreciation
  life (3 vs 7 yr swings annualized cost ~70%), (4) colo lease rate ($150 vs $235/kW/mo → yield ~12%
  vs 20%+), (5) network fabric (InfiniBand vs Ethernet ~2× that line).
- **Open reconciliation:** CoreWeave's implied ~$19–21M/MW vs Epoch's $37.9M/MW full-stack — needs a
  10-Q footnote review before the model is treated as authoritative.

### Depreciation & GPU residuals (primary 10-K data)
- Useful-life assumptions: **Google 4→6 yr** (FY2023, +$3.0B NI), **Microsoft 4→6** (FY2023),
  **Meta 4–5→5.5** (Jan 2025, +$2.59B), **Oracle 5→6** (FY2025, +$573M), **CoreWeave 6** (from IPO).
  **Amazon is the outlier — it *reversed* 6→5 yr (Jan 2025) citing AI's pace of change, cutting NI
  $677M over 9 months.** The only public walk-back.
- **Assumed vs. real life:** used H100 ~$18–22K (from ~$40–50K); competitive/frontier life ~2–3 yr vs
  5.5–6 yr accounting — a ~2–3× gap, consistent with Burry's ~$176B (2026–28) estimate.
- **Redeployment waterfall** (frontier→inference→fine-tune→dev) is partly real but breaks on
  perf/watt jumps (energy ~40–50% of 5-yr TCO), memory/architecture obsolescence, and insufficient
  lower-tier demand growth.
- **Credit risk:** GPU-backed debt (e.g., CoreWeave's $8.5B facility) has loan-maturity > customer-
  contract mismatch — "aircraft leasing without residual-value data," correlated across neoclouds.
- **Key limitation:** no hyperscaler discloses GPU-specific depreciation separately, so the entire
  debate runs on proxy data (resale/rental prices, aggregate PP&E notes).

### Power-market economics ($/MWh + build timeline by procurement type)
| Source | All-in $/MWh | Capex $/kW | Timeline |
|---|---|---|---|
| Grid industrial retail | ~$85–87 (wide state spread) | — | — (queue-gated) |
| Solar PPA | $30–65 | — | 12–24 mo |
| Wind PPA | $25–79 | — | 18–30 mo |
| Grid CCGT (new) | $40–90 | $1,116–2,000+ | turbine lead-time dominated |
| Behind-the-meter gas | $100–165 | $836–2,365 | 18–30 mo |
| Nuclear uprate (existing) | ~wholesale +$15 (45U) | $200–7,000 | 1–3 yr |
| Nuclear restart | ~$110–115 | ~$1,860–1,920 | ~3 yr |
| New SMR (FOAK) | $80–150 | $4,500–9,000 | 2029–2035 |

- **BTM gas time-value:** a ~$10–75/MWh premium buys **4–5 years of schedule compression** vs the
  ~7-yr PJM queue — tens of $M/yr in power vs billions in otherwise-stranded GPU capex. But the
  turbine backlog (GE Vernova booked to 2031) is eroding even this escape valve.
- **Bottleneck markets:** PJM/N. Virginia (biggest absolute — 220 GW Cycle-1 queue, 6.6 GW 2027–28
  deficit) and ERCOT/Texas (fastest-growing — ~410–474 GW queue, 77–90% data centers; now gated by
  the Aug-2026 state audit that pauses "Batch Zero" ~362 large loads).
- **Nuclear reality check:** of ~9.8 GW signed PPAs, only **~1.5–2.5 GW is deliverable 2026–2028**
  (TMI restart, Palisades, Susquehanna uprate); the other ~7 GW+ is SMR new-build (2030–2035, real
  cancellation risk). Read 9.8 GW as a *commitment* number, not a delivery-by-2028 number.

### What the deep dives change for tool-building
- The pro forma is **credibly reconstructable from free sources** (Epoch AI backbone, Digital Realty
  & CoreWeave for validation) — building it as an interactive tool is now de-risked.
- The **three master levers** to expose in any tool: GPU-hour price (revenue), energization date
  (timeline/critical path), and depreciation life (cost) — these dominate returns.
- Two documented data gaps to flag in the tool: no public signed GPU-hour contract price, and the
  CoreWeave-vs-Epoch capex-intensity discrepancy.

---

## Directional reframe — "a level or two above the physical development process" (2026-09-15)

Prompted by a user-supplied reference model (the **A.CRE Data Center Development Model** — teardown in
`topics/01-lifecycle-pro-forma/reference-model-teardown.md`). That model is a well-built **L0 parcel
underwriter**: it treats a data center as specialized real estate (land/hard/soft costs, construction +
mezz + perm debt, colo lease-up at $/kW/month, PUE, exit cap → yield-on-cost, development spread, IRR).
Its most telling feature is what it omits — **no compute layer whatsoever** (no GPU capex, depreciation,
compute-sales revenue, utilization, or obsolescence; power is just a PUE-scaled opex line). **The
AI-specific economics begin exactly where that model ends.** Our work should sit here:

- **L0 — Parcel underwriting** (A.CRE lives here): does *this build* pencil for a developer/lender? Real
  estate frame. *Not our differentiated target — already solved.*
- **L1 — Compute-asset economics** (our reconstructed pro forma already reaches here): the facility as a
  compute-production asset. Adds the layers A.CRE lacks — GPU capex, depreciation/obsolescence,
  utilization, revenue mode (lease vs compute-sales vs self-use), training-vs-inference. Master levers:
  GPU-hour price, energization date, depreciation life.
- **L2 — Strategic / market / portfolio** (where the user is pointing): build-vs-buy-vs-lease for a
  compute buyer; speed-to-market *value* & opportunity cost of delay; portfolio siting/staging across
  power markets; where value accrues in the stack (chip↔landlord↔operator↔lab); demand/overbuild/bubble
  scenario exposure; fleet-level financing & correlated obsolescence risk.

**Tooling stance:** don't rebuild an L0 parcel underwriter. Borrow A.CRE's good bones (power-based
pricing, yield-on-cost/development-spread discipline, trended-vs-untrended honesty, source-flagging) and
build **up** — an L1 compute-asset layer feeding an L2 decision layer that serves both the developer's
portfolio strategy and the lab's compute strategy.

---

## L2 strategic deep-dive findings (2026-09-15)

The three user-chosen L2 spine topics. Detail in `topics/14-speed-to-market/speed-to-market-value-L2.md`,
`topics/09-site-selection/portfolio-siting-staging-L2.md`, `topics/15-demand-bubble-risk/value-capture-overbuild-L2.md`.

### Speed-to-market value
- **Compute no longer buys a durable *capability* moat.** Frontier release cadence compressed 37.5 d
  (2023) → ~11 d (2026); DeepSeek-V3 reached frontier-comparable quality on ~2.79M GPU-hours vs.
  Llama-3.1-405B's ~30.8M (10× efficiency). Capability leads decay in **2–6 months**.
- **Yet labs pay 20–60% premiums for speed-to-power** — of which only ~9% is "rational" delay-avoidance
  in the worked example. **Split the concept:** speed-to-*capacity-access* (rational, quantifiable) vs.
  speed-to-*capability-lead* (largely not durable). A large premium is only justified under a long
  capability-lead half-life — which the evidence says is short.
- **Framework variables:** capability-lead half-life, revenue-per-capability-month, delay probability &
  magnitude, speed premium, stranding & lock-in cost, option value foregone, competitive intensity.

### Portfolio siting & staging
- **Real pattern is "concentrate-first, diversify-under-duress," not proactive balancing.** N. Virginia
  alone = ~13% of global / ~25% of Americas operational capacity (~3.5× all secondary US markets
  combined). Overflow to secondary markets is driven by primary-market saturation, not risk management.
- **Training and inference are becoming two sub-portfolios:** training stays remote/power-optimized;
  inference moves metro-proximate and is projected to overtake training as the dominant mode (~2027).
- **Correlated risks:** regulatory/ratepayer (23 states have large-load tariffs as of Aug 2026),
  single-ISO interconnection/curtailment, latency mismatch, water/climate. **Hedges:** land banking
  (now ~30% of dev spend, >60% of hyperscaler acquisitions), powered shells (lock queue position, defer
  fit-out), modular/phased build (~30% TCO savings), BTM-gas bridges on demand-certain sites.
- **Framework variables:** per-ISO energization time & variance, power cost & structure, regulatory-risk
  score & trajectory, latency class, concentration/correlation caps, water/climate risk, demand-certainty
  phasing triggers, rack-density trajectory.

### Value capture & overbuild risk
- **Margin stack — the ends are fat, the middle is thin.** Fat: NVIDIA GM ~75%, TSMC 67.7% (CoWoS ~80%,
  booked through 2026), SK hynix HBM 79–83%, Anthropic inference margin 38%→70% in a year. Thin: server
  OEMs (Dell AI mid-single-digit; Supermicro 15–17% GM), neoclouds (CoreWeave 56% adj. EBITDA but net
  loss after depreciation), colo/REIT (~10.6–12.3% dev yield). Chokepoints (chips/packaging/memory) and
  pricing-power app layers capture margin; commoditized capital-intensive middle layers bear the
  depreciation/obsolescence risk.
- **Overbuild, plainly:** ~62 GW installed (YE2025) vs. an 85.4 GW active pipeline (~138% of installed);
  only ~5 GW of the 16 GW US 2026 pipeline is under construction; 30–50% expected to slip/cancel.
  **~70% utilization is the breakeven line** (need 70–75%): a 1,024-GPU H100 cluster swings from
  −$80–130k/mo at 70% to +$170–220k/mo at 90%. Almost no system slack.
- **Bull:** Jevons — agentic/coding tokens rose from ~11% to >50% of platform volume (early 2025 → Mar
  2026). **Bear:** telecom fiber-glut analogy, worsened by fast GPU depreciation and >$800B of circular
  NVIDIA↔labs↔clouds financing inflating the apparent demand signal.
- **Framework variables:** utilization, price decay, depreciation life, demand growth, financing structure,
  value-capture position (which layer you occupy).

### The KPI signal running through all three
**Utilization is the linchpin** — it is simultaneously the LCOC denominator (unit economics), the
overbuild guardrail (~70–75% breakeven), and the least observable number in the system. Every L2 dive
independently flagged the *same* data gap: **there is no reliable, independent measure of *actual utilized*
compute vs. installed/committed capacity** (public figures are self-reported and entangled with circular
financing). Any proprietary model must treat utilization as a first-class, explicitly-assumed, stress-tested
input — and wear that assumption on its sleeve.
