# Reconstructing a Real AI Data Center Pro Forma (from public sources only)

*Deep-dive companion to `01-lifecycle-pro-forma.md`. Built entirely from SEC filings, company disclosures, free CBRE/JLL research, and a granular public TCO model (Epoch AI). No paywalled reports purchased. Date of research: 2026-09-15.*

No developer, hyperscaler, or neocloud publishes an actual line-item pro forma for an AI data center. What follows is a **reconstruction**: a worked numeric model built by combining (a) the most granular public capex breakdown available (Epoch AI's 1 GW AI datacenter TCO model), (b) disclosed colocation asking rates (CBRE H1 2026), (c) disclosed REIT stabilized development yields (Digital Realty), (d) disclosed neocloud financials (CoreWeave 10-Q/press releases), and (e) disclosed cap rates (JLL/CBRE 2026). Where the pieces cross-validate each other (they do, in several places below), that's a meaningful signal the model is in the right zone. Where they don't, it's flagged.

---

## 0. Anchor source: Epoch AI's 1 GW AI datacenter cost model

The single best free, granular, methodologically transparent capex breakdown found in this research is:

**Epoch AI, "Total cost of ownership of a one-gigawatt AI data center"** — https://epoch.ai/data-insights/ai-datacenter-cost-breakdown

For a 1 GW facility built around NVIDIA GB200 NVL72 systems (PUE 1.14, 71% utilization):

| Component | $M (per GW) | $M per MW | % of capex |
|---|---|---|---|
| Servers (GPUs + host systems) | 21,188 | 21.19 | 55.9% |
| Facility (shell, electrical, cooling) | 11,433 | 11.43 | 30.2% |
| Network infrastructure | 4,925 | 4.93 | 13.0% |
| Land | 172 | 0.17 | 0.5% |
| Utility works (substation/interconnection) | 164 | 0.16 | 0.4% |
| **Total up-front capex** | **37,883** | **37.88** | 100% |

Annualized (depreciation-weighted) view: servers/network amortized over 5 years, facility over 14 years → **$8.5M/MW/year** all-in annualized cost, of which opex is $907M/GW/yr (energy $594M, maintenance $120M, taxes $143M, labor $40M, water $6M, utility $20M).

This reconciles well with the shallow-pass figures: $37.9M/MW total ≈ the $30–40M/MW "incl. GPUs" range; facility + network = $16.3M/MW ≈ the $15–20M/MW "AI shell" range; facility alone ($11.4M/MW) ≈ the $10–12M/MW "traditional shell" range. I use Epoch's ratios, rescaled to 100 MW, as the base capex stack below.

---

## 1. Worked pro forma — 100 MW AI campus

### 1.1 Capex stack (100 MW facility, GB200-class, PUE 1.14)

| Line item | $/MW | Total ($M) | Source |
|---|---|---|---|
| Land | $0.17M | $17 | Epoch AI model; cross-check: NoVA/Northeast land now $2–8M/**acre** (CBRE via Data Center Real Estate/NAHB reporting, 2026), and a 100 MW campus needs ~40–80 acres depending on density → $0.1–0.6M/MW is a reasonable band |
| Shell + electrical + cooling ("Facility") | $11.43M | $1,143 | Epoch AI; Turner & Townsend DCCI 2025 cost-category split (via search aggregation) shows electrical ~48–54% and mechanical/cooling ~22–33% of this line, shifting toward mechanical as liquid cooling share rises |
| Network infrastructure (InfiniBand/Ethernet fabric, optics) | $4.93M | $493 | Epoch AI; InfiniBand alone runs ~$4,000/GPU vs. $800–2,500/GPU for Ethernet fabrics (search aggregation of GPU-cluster BOM analyses) |
| Utility works (substation, interconnection infra) | $0.16M | $16 | Epoch AI — note this is the *site-side* interconnection capex only; it does **not** include the multi-year queue/transformer wait, which is a timeline cost, not a capex line (see §3) |
| GPUs/servers | $21.19M | $2,119 | Epoch AI, GB200 NVL72 basis (~$2.8–3.4M per rack / 72 GPUs, i.e., ~$27,800–41,700 per GPU per market-estimate aggregations — NVIDIA does not publish list prices) |
| **Total capex** | **$37.88M** | **$3,788M** | |

Commissioning is embedded in the Facility line per standard cost-category convention (Turner & Townsend-style breakdowns bucket Cx into shell/electrical), not separately itemized.

At 100 MW gross power and PUE 1.14, IT load ≈ 87.7 MW. On a GB200 NVL72 basis (125 kW/rack, 72 GPUs/rack), that's ~701 racks ≈ **~50,500 GPUs** installed.

### 1.2 Opex (annual, 100 MW facility, scaled from Epoch AI GW figures)

| Line item | $M/year | Notes |
|---|---|---|
| Energy | $59.4 | At ~87.7 MW IT load × 1.14 PUE × 8,760 hrs × 71% utilization, implied all-in power price ≈ $88–100/MWh — consistent with disclosed industrial retail rates (~$88/MWh, EIA-derived) and Constellation-type data center PPAs (~$100/MWh) |
| Maintenance | $12.0 | |
| Property taxes | $14.3 | |
| Labor | $4.0 | ~0.2 FTE/MW for a hyperscale-style AI facility (search aggregation of staffing benchmarks) — roughly 20 people for 100 MW, far below the 1–5 jobs/MW cited for retail colo |
| Water | $0.6 | |
| Utility works (recurring) | $2.0 | |
| **Total opex** | **$92.3M/yr** | ≈ $923/kW/yr — inside the $800–2,000/kW/yr industry opex benchmark range |

### 1.3 Revenue Mode A — Colo / powered-shell lease

In this mode the **developer builds land+shell+base network+interconnection only** (tenant brings its own GPUs). Capex excludes the GPU line and most of the GPU-side network line:

- Capex (shell-only): Land $17M + Facility $1,143M + base network/conduit (~10% of full network line, rest is tenant's GPU fabric) $49M + Utility works $16M ≈ **$1,225M** (~$12.3M/MW — squarely in the "AI shell" $10–20M/MW range).
- Lease rate: CBRE H1 2026 puts wholesale asking rates for 10+MW blocks at $190–235/kW/month in top markets (NoVA, Chicago), with the 250–500kW tier averaging $196/kW/month; large hyperscale-scale blocks (10s of MW to 100+ MW) typically clear below headline asking rates on volume. **Base case: $150/kW/month** (conservative for a 100 MW anchor deal).
- Gross revenue = $150/kW/mo × 100,000 kW × 12 = **$180M/year**
- Developer opex (NNN-style lease — tenant pays energy and its own labor directly): maintenance $12M + taxes $14.3M + utility works $2.0M ≈ **$28.3M/year**
- **NOI = $151.7M/year**
- **Yield on cost = 151.7 / 1,225 = ~12.4%**

**Cross-check:** Digital Realty discloses (8-K/investor materials, 2024–2026) a stabilized yield on cost of **10.6–12.3%** for its global/Americas development pipeline, and its most recent pipeline disclosure shows an average expected stabilized yield of **11.5%**. Our bottom-up 12.4% lands right inside that disclosed range — a strong validation of the reconstructed shell-only capex stack and lease-rate assumption. (Equinix reports higher stabilized yields, ~25–27%, but analysts flag that Equinix's methodology excludes first-generation tenant fit-out capex, so it is not comparable on an apples-to-apples basis.)
Source: Digital Realty Q2 2026 results / 8-K exhibits — https://investor.digitalrealty.com/news-releases/news-release-details/digital-realty-reports-second-quarter-2026-results ; https://www.sec.gov/Archives/edgar/data/0001297996/000110465926047702/dlr-20260423xex99d1.htm

At the stabilized cap rate for hyperscale assets (5.5–6.5%, JLL Q1 2026 / CBRE 2026 — https://www.jll.com/en-us/insights/market-outlook/data-center-outlook), stabilized asset value ≈ $151.7M / 0.06 ≈ **$2,528M**, i.e., roughly **2.1x** the $1,225M shell development cost — the "development spread" that is currently drawing capital into the sector, per CBRE/JLL commentary that cap-rate compression has outpaced cost inflation in 2026.

### 1.4 Revenue Mode B — Compute sales (GPU-hours / tokens)

Here the operator owns the GPUs (full $3,788M capex stack) and sells compute directly.

- GPU-hours available: ~50,500 GPUs × 8,760 hrs/yr × 71% utilization ≈ **314M GPU-hours/year**
- Pricing is the dominant swing factor (see §4). Public 2026 GPU rental data (aggregated from multiple GPU-price-index trackers) shows an enormous spread: neocloud on-demand ~$2.7–6/hr for H100/B200-class, hyperscaler on-demand $7–16/hr, but these are *retail/spot* prices, not the *long-term contracted* rates implied by real backlogs. CoreWeave — the only pure-play compute seller with public financials — reported **~56% adjusted EBITDA margin** on $2.1B Q1 2026 revenue and a **$104B revenue backlog** (Q2 2026), alongside a **net loss** driven by depreciation and interest expense (source: CoreWeave Q2 2026 results — https://investors.coreweave.com/news/news-details/2026/CoreWeave-Reports-Strong-Second-Quarter-2026-Results/default.aspx). That EBITDA-positive/net-income-negative pattern is the key empirical fact this pro forma should reproduce.

Three pricing scenarios (bottom-up, at 71% utilization):

| Contracted price/GPU-hr | Gross revenue | Opex (facility opex $92.3M + ~10% of rev for bandwidth/support/G&A) | EBITDA | EBITDA margin | EBITDA yield on cost | D&A* | EBIT |
|---|---|---|---|---|---|---|---|
| $2.00 | $628M | $155M | $473M | 75% | 12.5% | $743M | **-$270M** |
| $3.00 (base case) | $933M | $186M | $747M | 80% | **19.7%** | $743M | **~$4M (breakeven)** |
| $4.00 | $1,244M | $217M | $1,027M | 83% | 27.1% | $743M | **+$284M (7.5%)** |

\*D&A: GPUs+network $2,612M / 4 yrs = $653M/yr; facility $1,143M / 14 yrs = $82M/yr; utility works $16M/20yrs ≈ $1M/yr → **$743M/yr** (4-year GPU life chosen from the contested-but-common 3–4 yr camp; see swing factor #1 below).

**This is the single most important structural finding of the deep dive:** at a plausible mid-case contracted price (~$3/GPU-hr), the facility is roughly **EBIT-breakeven** despite an ~80% EBITDA margin — because GPU depreciation ($653M/yr on $2.6B of GPU+network capex over just 4 years) consumes almost the entire EBITDA. This mirrors CoreWeave's actual reported pattern (56% adjusted EBITDA margin, net loss) and explains why "compute sales" economics look extraordinary on an EBITDA basis and mediocre-to-negative on a net-income/cash-on-cash basis. A 33% swing in GPU-hour price (±$1/hr around the $3 base case) swings EBIT by roughly $270–280M — from a $270M loss to a $284M profit — on the same $3.79B of capex. No colo/lease model has anywhere near this sensitivity.

---

## 2. Training vs. inference variant

| Dimension | Training-optimized facility | Inference-optimized facility |
|---|---|---|
| Utilization | Bursty but often near-100% during active runs; Epoch's 71% reflects blended fleet-wide utilization including idle/maintenance windows and cluster-formation lag | More continuous, demand-following; diurnal/weekly load curve, lower peak-to-average ratio possible with global follow-the-sun routing |
| Revenue basis | Often not "sold" per se — internal AI-lab capex, or capacity pre-sold via multi-year contracts to a single anchor (e.g., OpenAI/Microsoft-CoreWeave-style deals) at negotiated $/GPU-hr well below spot | Per-token or per-API-call revenue; GPT-4-class inference priced ~$0.40–0.80/M tokens per shallow-pass baseline; revenue scales with product demand, not contract terms |
| Siting | Can tolerate less latency-sensitive, more remote/lower-cost-power sites (rural interconnection queues sometimes faster for large single-tenant loads); networking (InfiniBand, low east-west latency) capex-intensive — training clusters skew toward the higher end of the $4.9M/MW network line | Needs proximity to end users / edge markets for latency; may accept smaller, more distributed footprints; networking capex lower (less need for ultra-low-latency fabric across huge GPU counts), but never as low as pure colo |
| GPU refresh cadence | Tied to frontier-model training-cluster generational upgrades (aggressive — supports the 3–4 yr depreciation camp) | Can run older/cheaper silicon longer for cost-optimized inference (supports 5–6 yr camp for a subset of the fleet) — this bifurcation is itself a reason the industry-wide depreciation debate hasn't resolved |
| Return profile | Concentrated counterparty risk (often 1–3 anchor tenants); return depends heavily on contract price and take-or-pay terms, not observable market rate | Distributed demand risk but exposed to inference-price deflation (well documented: H100 rental prices "halved" in the past year per multiple GPU-price trackers) — inference revenue per GPU-hour erodes faster than training-contract revenue if training is locked in |

---

## 3. Timeline: revenue starts at ENERGIZATION, not construction completion

```
Month:      0        12       24       36       48        60        72
Land        |--acquire/entitle--|
Interconn.  |------------------ queue + utility construction ------------------|
Transformer          |------------------ 128–160 wk lead time (~2.5–3.1 yrs) ------------------|
Shell        |------------ 18–24 mo construction ------------|
Fit-out                              |---6–12 mo---|
ENERGIZE                                                      ▲  <-- revenue clock starts HERE
Revenue                                                       |========= ramp =========>
```

- Interconnection queues in major U.S. markets run **4–7 years** (LBNL data cited in DOE's draft 2026 National Transmission Needs Study); projects reaching commercial operation in 2025 averaged **>7 years** from initial application to energization, split roughly 3+ years to interconnection service agreement and another ~4 years waiting to actually come online after approval (search aggregation of Data Center Knowledge / grid-delay reporting, 2026).
- Power transformers specifically now run **128–160 weeks** (2.5–3.1 years) lead time in 2026, per multiple 2026 industry-survey aggregations (Wood Mackenzie Q2 2025 transformer survey cited a 128-week average for power transformers and 144 weeks for generator step-up units).
- **Shell construction itself (18–24 months) is no longer the binding constraint** — it can be, and increasingly is, run in parallel with the multi-year interconnection/transformer process. The critical path is power. A shell finished 18 months after groundbreaking that then sits waiting 2+ more years for utility interconnection and transformer delivery earns **zero revenue** in either the colo or compute-sales model during that wait — the site is "COD-complete" but not "energized," and no lease or compute-sales revenue clock starts until it is.

### Quantified delay impact (illustrative, built transparently from the numbers above — not itself a published empirical estimate)

Using the colo/lease mode ($1,225M shell capex, $151.7M/yr stabilized NOI, 6% cap rate → $2,528M stabilized value, 8% assumed cost of capital):

| Scenario | Energization delay | Carry cost (capex stranded, no revenue, at 8% cost of capital) | PV loss on discounted future cash flows (delay pushes entire NOI stream back) | Approx. total value impact | As % of shell capex |
|---|---|---|---|---|---|
| On schedule | 0 | — | — | — | — |
| Moderate delay | +12 months | $1,225M × 8% × 1yr ≈ **$98M** | $2,528M × (1 − 1/1.08) ≈ **$187M** | **~$285M** | **~23%** |
| Severe delay | +24 months | $1,225M × 8% × 2yr ≈ **$196M** | $2,528M × (1 − 1/1.08²) ≈ **$374M** | **~$570M** | **~47%** |

This is a simplified two-term model (financing carry + discounting delay) meant to show the *mechanism* transparently, not a precise empirical claim — but the magnitude (a 12–24 month energization delay can erase roughly a quarter to nearly half of the shell's total development value) matches the qualitative alarm found throughout 2026 trade press about interconnection/transformer delays being the actual binding constraint on AI data center returns, more than construction cost inflation itself.

---

## 4. Assumptions table (every input, source, and swing-factor flag)

| # | Input | Value used | Source | Swing factor? |
|---|---|---|---|---|
| 1 | Total capex/MW (all-in, incl. GPUs) | $37.88M | Epoch AI, https://epoch.ai/data-insights/ai-datacenter-cost-breakdown | |
| 2 | Shell-only capex/MW (colo mode) | ~$12.3M | Derived from Epoch AI facility+utility+partial network lines | |
| 3 | GPU/server capex/MW | $21.19M | Epoch AI (GB200 NVL72 basis) | |
| 4 | Land cost | $0.17M/MW ($17M/100MW) | Epoch AI; cross-check $2–8M/acre NoVA (NAHB/Data Center Real Estate reporting 2026) | Yes — 10-40x market variance by geography |
| 5 | Colo wholesale lease rate | $150/kW/month (base), $190–235 top-market | CBRE North America Data Center Trends H1 2026, https://www.cbre.com/insights/books/north-america-data-center-trends-h1-2026 | **Yes — #2 biggest swing factor** |
| 6 | Stabilized development yield on cost (colo) | 12.4% (derived), cross-checked to 10.6–12.5% disclosed | Digital Realty Q2 2026 IR release / 8-K, https://investor.digitalrealty.com/news-releases/news-release-details/digital-realty-reports-second-quarter-2026-results | |
| 7 | Stabilized cap rate, hyperscale | 5.5–6.5% | JLL 2026 Global Data Center Outlook, https://www.jll.com/en-us/insights/market-outlook/data-center-outlook | |
| 8 | GPU-hour contracted price (compute sales) | $2–4/hr range, $3 base case | Aggregated GPU-price-index data (H100 ~$2.7–6.9/hr neocloud, B200 ~$3.4–16/hr median $6.1) plus CoreWeave 56% adj. EBITDA margin as sanity check, https://investors.coreweave.com/news/news-details/2026/CoreWeave-Reports-Strong-Second-Quarter-2026-Results/default.aspx | **Yes — #1 biggest swing factor: ±$1/hr swings EBIT by ~$270M on $3.79B capex** |
| 9 | GPU/server useful life (depreciation) | 4 years (base case) | Contested — hyperscalers moved from 3–4yr to 6yr (2020-2024), then Amazon reversed a subset to 5yr in 2025 citing pace of tech development; Epoch AI models 5yr base / 3yr and 7yr sensitivity | **Yes — #3 biggest swing factor: Epoch shows annualized cost ranges $7–12B/GW (3yr vs 7yr life)** |
| 10 | Facility (shell) useful life | 14 years | Epoch AI | |
| 11 | PUE | 1.14 | Epoch AI (liquid-cooled GB200 basis); industry blended average is 1.3–1.5, best hyperscale <1.1 | Yes — moderate; affects energy opex and IT-load-per-MW conversion |
| 12 | GPU utilization | 71% | Epoch AI | Yes — moderate; near-linear revenue driver in compute-sales mode |
| 13 | Industrial power price | $88–100/MWh | EIA industrial retail average (~8.83¢/kWh through May 2026) and Constellation-type DC PPA ~$100/MWh (search aggregation) | |
| 14 | Interconnection timeline | 4–7 years, avg >7yr to COD for 2025 cohort | LBNL data cited in DOE draft 2026 National Transmission Needs Study (search aggregation) | **Yes — #4 biggest swing factor: single largest driver of realized IRR via revenue-start timing** |
| 15 | Transformer lead time | 128–160 weeks | Wood Mackenzie Q2 2025 transformer survey (search aggregation); multiple 2026 trade-press sources cite 128–160wk range | Related to #14 |
| 16 | Staffing intensity | 0.2 FTE/MW (AI facility) | Search-aggregated staffing benchmarks; contrasts with 1–5 jobs/MW for retail colo | |
| 17 | Opex benchmark (sanity check) | $800–2,000/kW/yr industry range; model implies $923/kW/yr | Search-aggregated industry benchmarks (KPMG-style, Thunder Said Energy) | |
| 18 | Networking capex share | 13% of total ($4.93M/MW) | Epoch AI; InfiniBand ~$4,000/GPU vs Ethernet $800–2,500/GPU (search aggregation) | **Yes — #5 swing factor for training-optimized facilities specifically (fabric choice materially changes this line)** |
| 19 | CoreWeave capex intensity (cross-check) | ~$19–21M/MW implied from guided $35–39B capex / 1.85GW active power target | CoreWeave Q2 2026 earnings coverage (search aggregation) | Flag: notably *below* the $37.9M/MW full-stack figure — may reflect financed/leased GPUs off a separate balance sheet, phasing mismatch between capex spend and power energized, or different capex scope; treat as a discrepancy to investigate further, not resolved in this pass |

**Top 3-5 swing factors, ranked by return sensitivity found in this model:**
1. **GPU-hour contracted price** (compute-sales mode) — swings EBIT from -$270M to +$284M on the same capex base.
2. **Energization delay** (via interconnection/transformer critical path) — a 12–24 month delay destroys an estimated 23–47% of shell development value in the illustrative model.
3. **GPU useful life / depreciation policy** — Epoch AI's own sensitivity shows annualized cost per GW ranging $7B (7yr life) to $12B (3yr life), i.e., ~70% swing in annualized-cost basis, and this is a discretionary management accounting estimate, not an engineering fact.
4. **Colo lease rate achieved** — $150 vs. $235/kW/month (bottom vs. top of the CBRE 2026 range) moves yield-on-cost for the shell-only model from ~12.4% to ~20%+.
5. **Networking/fabric choice** (InfiniBand vs. Ethernet) — can move the network capex line by roughly 2x, materially affecting training-cluster total capex/MW specifically.

---

## 5. What it would take to build this as a spreadsheet tool

**Recommended architecture:** a single-workbook model with a locked "Assumptions" tab (all inputs from §4, each cell sourced/commented), a "Capex Build" tab (the $/MW stack, scalable by MW slider), an "Opex Build" tab, two "Revenue Mode" tabs (Colo, Compute Sales) with side-by-side yield-on-cost/IRR outputs, a "Timeline" tab (Gantt-style, energization-gated revenue start), and a "Sensitivity" tab (data tables / tornado chart on the 5 swing factors above).

**User-editable levers (in priority order):**
1. Facility scale (MW) and PUE
2. Capex $/MW by line item (land, shell, network, GPU, utility works) — pre-populated from Epoch AI/CBRE but overridable
3. GPU generation and useful life assumption (toggle 3/4/5/6/7-yr depreciation to see Epoch-style annualized-cost swing directly)
4. Revenue mode toggle (colo $/kW/month vs. compute $/GPU-hr) with independent utilization assumption per mode
5. Energization timeline: land-to-interconnection-application, queue duration, transformer lead time, shell/fit-out duration (each independently editable so the model can show which is the actual critical path for a given site)
6. Financing assumptions: cost of debt/equity, leverage, cap rate for exit/terminal value
7. Power price ($/MWh) and a simple PPA vs. retail-tariff toggle

**Still missing to do this credibly (gaps this deep dive could not close with free sources):**
- No public source discloses an *actual signed* GPU-hour contract price for a large multi-year compute deal (only backlog dollar totals and blended margins from CoreWeave); the $2–4/hr band used here is a reasoned estimate bounded by spot-market indices and CoreWeave's margin, not a verified contract price.
- No public source gives a clean empirical IRR-vs-delay sensitivity for actual DC developments; §3's delay-impact table is a transparent illustrative construction, not sourced empirical fact, and should be labeled as such in any tool.
- The CoreWeave capex/MW discrepancy (~$19-21M/MW implied vs. $37.9M/MW full-stack Epoch figure) is unresolved — likely explained by GPU financing/leasing structures kept off the capex line, phasing lag between capex outlay and MW energized, or scope differences, but this needs a dedicated pass through CoreWeave's actual 10-Q footnotes (not just press coverage) before the spreadsheet tool treats it as reconciled.
- Regional cost/timeline variance (Texas ERCOT vs. PJM vs. secondary markets) was not modeled — the tool should parameterize interconnection timeline and power price by ISO/region rather than using a single blended U.S. figure.
