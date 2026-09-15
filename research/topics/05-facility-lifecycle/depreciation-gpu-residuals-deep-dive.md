# Depreciation, Useful Life & GPU Residual Values: A Deep Dive

*Research date: 2026-09-15. US-primary. All figures cited to primary SEC filings where possible; secondary sources used only to interpret or fill gaps in public disclosure.*

## 1. Primary depreciation disclosures (per company, from 10-K/10-Q filings)

All four hyperscalers disclose "useful life" changes as changes in accounting estimate under ASC 250, buried in the Property & Equipment note, with a required disclosure of the prior-year earnings effect (but not always the balance-sheet/asset-value effect). Below are the actual numbers as disclosed.

### Microsoft (MSFT)
- **History**: FY2022 → extended useful life of servers and network equipment from **3 years → 4 years**. Effective FY2023, extended again from **4 years → 6 years**, citing "investments in software that increased efficiencies... as well as advances in technology" that let equipment run longer.
- **FY2025 10-K** (filed for fiscal year ended June 30, 2025): computer equipment useful life disclosed as a range, effectively **2–6 years** in the PP&E note — Microsoft gives less specific server/network breakouts than Google or Meta in some years.
- **Earnings effect cited in secondary coverage of an FY2025-related change**: ~$733M reduction in opex, ~$573M increase in net income, ~$0.20–0.21 EPS (this figure appears in market commentary tied to the FY2023 change's continuing effect; verify exact fiscal year against the filing before citing precisely).
- **Primary source**: Microsoft Corp FY2025 Form 10-K, https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm

### Amazon / AWS (AMZN)
This is the most volatile and instructive case — Amazon has changed server/network useful life **three times** in three years, including one reversal:
- **Effective Jan 1, 2020**: 3 → 4 years (pre-AI, general cloud efficiency reasoning).
- **Effective Jan 1, 2024**: 5 → **6 years** for servers (a further extension), disclosed as contributing roughly **$900M to Q1 2024 net income** alone, per company guidance reported at the time.
- **Effective Jan 1, 2025**: **reversed** — a subset of servers and networking equipment useful life cut from **6 years back to 5 years**, explicitly because of "the increased pace of technology development, particularly in the area of artificial intelligence and machine learning." Amazon told investors this would *reduce* 2025 operating income by ~**$0.7B**, and per the FY2025 Q3 10-Q, for the nine months ended Sept 30, 2025 the change had increased D&A by **$889M** and cut net income by **$677M** (~$0.06 EPS diluted).
- Amazon is the only hyperscaler to date to publicly walk back a life-extension specifically citing AI-driven obsolescence — directly relevant to the "assumed life vs. real life" question.
- **Primary sources**: Amazon.com Inc 10-Q (Q3 FY2025), https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm ; 10-Q (Q1 FY2025), https://www.sec.gov/Archives/edgar/data/1018724/000101872425000036/amzn-20250331.htm ; 10-K FY2024, https://www.sec.gov/Archives/edgar/data/1018724/000101872425000004/ (Financial_Report.xlsx / R-notes)

### Alphabet / Google (GOOGL)
- **2021**: extended servers 3 → 4 years, networking 4 → 5 years.
- **January 2023 assessment, effective FY2023**: extended servers **4 → 6 years** and certain network equipment **5 → 6 years**. Disclosed effect: reduced depreciation expense by **$3.9B** and increased net income by **$3.0B**, or **$0.24/share (basic and diluted)**, for FY2023.
- This was the single largest disclosed earnings effect of any hyperscaler's useful-life change to date, and set the "6-year" convention other hyperscalers converged toward.
- **Primary source**: Alphabet Inc. 10-K FY2023 (filed early 2024) — property & equipment note; secondary confirmation: https://last10k.com/sec-filings/googl/0001652044-23-000013.htm and https://www.computerweekly.com/news/366557152/Google-saves-almost-3bn-by-running-servers-for-six-years

### Meta Platforms (META)
- Prior range: **4–5 years** for servers and network equipment.
- **January 2025 assessment, effective Jan 1, 2025**: extended most servers and network assets to **5.5 years**. Disclosed effect (FY2025, i.e., year ended Dec 31, 2025): reduction in depreciation expense of **$2.92B**, increase in net income of **$2.59B**, or **$1.00 per diluted share**.
- Meta has made this move incrementally (4→5→5.5) rather than jumping straight to 6, unlike Google/Oracle/CoreWeave.
- **Primary source**: Meta Platforms Inc. 10-K FY2025, https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm

### Oracle (ORCL)
- **Q1 FY2025 (effective start of FY2025, i.e., June 2024)**: increased useful life of servers and networking equipment **5 → 6 years**.
- Disclosed effect (based on carrying value as of May 31, 2024): decreased total opex by **$733M**, increased net income by **$573M**, or **$0.21 basic / $0.20 diluted EPS**, during FY2025.
- Oracle's broader PP&E note (FY2025 10-K, period ended May 31, 2025) shows a composite computer/network/machinery/equipment useful-life range of **1–6 years**.
- Oracle is a name Burry specifically flagged (see §4) for potential 2028 profit overstatement of ~27% from this assumption, given its aggressive Cloud/OCI capex ramp funded substantially with debt.
- **Primary source**: Oracle Corp. 10-K FY2025, https://www.sec.gov/Archives/edgar/data/1341439/000095017025087926/orcl-20250531.htm (XBRL note: https://www.sec.gov/Archives/edgar/data/1341439/000095017025087926/R31.htm)

### CoreWeave (CRWV)
- As a "neocloud" whose balance sheet is essentially a GPU fleet, CoreWeave's disclosure is the most GPU-specific: it depreciates "technology equipment" — including the NVIDIA GPUs themselves — straight-line over **6 years**, disclosed originally in its S-1 IPO filing and carried into its 10-K.
- CoreWeave's public defense (in response to Burry) cites ~5-year customer contracts and claims **~95% resale value retention** on returned/rebooked older-generation chips (A100s from a 2022 contract reportedly rebooked near original pricing when the contract rolled — see §3), but critics note this is a much rosier picture than the broader secondary market shows (see §2).
- **Primary source**: CoreWeave, Inc. Form 10-K (FY2025) and S-1 — see SEC EDGAR CIK for CoreWeave; secondary aggregation of filing excerpts: https://datacenters.mts.now/wiki/documents/coreweave-filings

### Summary table — disclosed useful-life changes

| Company | Prior life | New life | Effective | Disclosed FY effect (net income) | Direction |
|---|---|---|---|---|---|
| Google/Alphabet | Servers 4yr / Network 5yr | 6yr / 6yr | Jan 2023 | +$3.0B ($0.24/sh) | Extension |
| Oracle | 5yr | 6yr | FY2025 (June 2024) | +$573M ($0.20/sh) | Extension |
| Meta | 4–5yr | 5.5yr | Jan 2025 | +$2.59B ($1.00/sh) | Extension |
| Amazon | 5yr → 6yr → | 6yr → 5yr (partial) | Jan 2024 then Jan 2025 | ~+$900M (2024) then **-$677M through 9mo 2025** | Extension, then **reversal** |
| Microsoft | 4yr | 6yr | FY2023 | ~+$500-700M range cited in secondary sources | Extension |
| CoreWeave | n/a (new entrant) | 6yr (GPUs specifically) | IPO-era | N/A (new company, no comparable prior estimate) | Set at long end from inception |

**Key point for the wider research**: Amazon is the only hyperscaler to have publicly *reversed* part of a useful-life extension specifically citing AI-driven obsolescence pace — this is probably the single most credible piece of primary-source evidence that the 6-year assumption is under revision by the entities closest to the actual fleet data, even as Google, Meta, and Oracle move the other direction or hold at 5.5–6 years.

## 2. Assumed life vs. real economic life: the residual-value evidence

The accounting "useful life" is a depreciation schedule assumption, not a claim about resale value or peak competitiveness — but the two are supposed to be linked (an asset held past the point it delivers economic value should be impaired or written down faster). The evidence on actual GPU value retention:

- **New H100 pricing**: 2022 launch price ~$40–50K/unit at street/system level (varies by source; original context said ~$50K). By 2026, new-unit pricing has compressed to roughly **$25K–$40K** (per Compute Exchange, IntuitionLabs), with used/non-refurbished units trading **$15K–$28K**, and used prices reported as having "stabilized" around **$18K–$22K** in 2026 (Hashrate Index, Compute Exchange).
- **Retention curves reported**: mid-case retained value at **36 months (3 years) runs 50–60% of original price**; by device age bucket, <1yr: $18–25K, 1–2yr: $12–18K, 2+yr: $7–12K (this implies steeper decay than the "45–55% at 3yr" headline figure once you look at the 2+yr bucket, which could be well under 50% depending on original cost basis).
- **Contrasting bullish data point**: CoreWeave and NVIDIA's public rebuttal to Burry cites A100s returning from an expiring 2022 contract being **rebooked at ~95% of original contract pricing** in the secondary/re-lease market — but this is a *rental rate* re-booking data point, not a *sale* residual value, and likely reflects a supply-constrained rental market rather than asset resale value. These are economically different claims and should not be conflated (rental rates depend on capacity scarcity; resale/salvage value depends on a buyer's willingness to own the asset for its remaining useful life).
- **Divergent narrative from CoreWeave's own rental economics**: other reporting states CoreWeave's own **GPU rental rates have fallen 50–70% from peak**, which is hard to reconcile with the "95% rebooked" claim unless that specific 2022 A100 contract was an outlier or the comparison bases differ (old low base vs. new low market rate).
- **Gap magnitude**: Taking the accounting assumption (5.5–6 year straight-line life, ~17% of cost expensed per year) against a fleet that is losing roughly 40–50%+ of resale value within 24–36 months, and where the *competitively relevant* life (time before a GPU is no longer viable for frontier training) is closer to **2–3 years** per Burry and multiple industry commentators — the assumed-vs-real gap is on the order of **2–3x** on the "useful life" input, translating into Burry's headline **~$176B cumulative understated depreciation/overstated profit across the industry, 2026–2028**, with company-specific estimates of ~27% profit overstatement for Oracle and ~21% for Meta by 2028.
- Countervailing academic/analyst argument (e.g., "Why Michael Burry Is Wrong... But Still Might Be Right" and CoreWeave/NVIDIA's rebuttal): the *accounting* useful life properly reflects total *economic* life across multiple use-tiers (see §3 waterfall), not just time-to-obsolescence-for-frontier-training. If a GPU generates real cash flow across 5–6 years spanning multiple workload tiers, straight-line depreciation over that full span is not fraudulent even though it is not competitive at the frontier past 2–3 years. The dispute is really about whether the *redeployment waterfall* is real and economically sufficient — which is the crux of §3.

## 3. The redeployment waterfall — does it hold up?

**The claimed cascade** (as described by industry defenders and some secondary analysis): frontier training (yr 1–2, latest generation) → production/high-value inference (yr 2–4, previous generation) → fine-tuning/RAG/enterprise AI (yr 3–5) → dev/HPC/batch/analytics (yr 5–6) → secondary market resale or ITAD/parts recovery (end of life).

**Evidence it holds, partially**:
- Older-generation chips (A100, H100) do continue to find rental/reuse demand in inference and fine-tuning workloads — this is corroborated by multiple sources noting inference demand "absorbs" used cards and keeps resale values from collapsing to scrap value the way, say, mobile chips do.
- The specific A100 2022-contract rebooking-at-95%-of-original-price data point supports the idea that even 3–4 year old chips retain real economic utility, at least for the specific customer/workload that already had infrastructure built around that hardware generation.

**What breaks the waterfall**:
1. **Power efficiency delta compounds, not just performance**: per the efficiency-economics literature reviewed, when a new generation delivers ~2x performance-per-watt, the *opex-per-token* of the incumbent fleet effectively doubles even though the hardware still functions — this is "economic obsolescence," not electrical failure. At industrial power tariffs ($0.06–0.10/kWh) with a PUE of 1.1–1.5, energy is estimated at **40–50% of a 5-year TCO** for a modern (~700W) accelerator, meaning a 2x efficiency jump in the next generation can alone justify early retirement regardless of the chip's continued technical function. This directly undercuts the assumption that a GPU can cheaply cascade down the tiers for its full depreciable life — at some point the *power bill* for running an old GPU exceeds the amortized cost of replacing it.
2. **Memory and architecture obsolescence**: newer model architectures (larger context windows, different attention/KV-cache demands, FP4/FP8 native support, etc.) can make older-generation memory bandwidth/capacity a hard constraint, not just a performance inconvenience — meaning some workloads simply cannot "cascade" onto older silicon at all, breaking the assumed smooth waterfall for a subset of the fleet.
3. **Physical retirement thresholds**: the operator literature cites retirement decisions typically triggered around the **35,000–50,000 operating-hour mark** (~4–6 years at typical utilization) when cumulative discounted opex exceeds the capex of a new, more efficient replacement fleet net of resale value — this is a real economic calculation that can trigger *earlier* retirement than the accounting useful life if power/opex assumptions worsen (e.g., rising electricity prices, tightening power availability making efficiency more valuable) or *later* if capex for replacement is constrained (e.g., NVIDIA supply shortages extend the useful economic life of the existing fleet involuntarily).
4. **The waterfall assumes continuous demand growth for AI compute at every tier** — if training demand or inference demand growth slows (a "bubble" scenario), the lower tiers of the cascade (fine-tuning, dev/HPC, enterprise) may not have enough volume to absorb the flood of decommissioned frontier-tier GPUs, causing resale/rental prices at those tiers to collapse — which is exactly the CoreWeave rental-rate-decline data point (50–70% off peak) suggests may already be happening at the margin.

**Net assessment**: the waterfall is a real phenomenon (there is genuine reuse and residual value, not zero), but it is not automatically sufficient to justify a uniform 5.5–6 year straight-line depreciation schedule for the *entire* fleet. It's better modeled as a fleet where a minority of chips (those bought under advantageous power/site economics, in workloads with less architecture-sensitivity) genuinely reach 5–6 years of productive service, while a majority face effective economic retirement or value impairment in the 2–4 year range — meaning the aggregate straight-line schedule likely overstates asset life for a large share of the fleet even if it understates it for a smaller share.

## 4. Systemic / credit risk

- **GPU-backed debt is now a recognized, named financing category**: CoreWeave pioneered ~$7.5B (2024) and has since layered on larger facilities (e.g., an $8.5B facility announced 2026 marketed as the "first investment-grade rated GPU-backed financing," per CoreWeave's own investor release: https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-Landmark-8-5-Billion-Financing-Facility-Achieving-First-Investment-Grade-Rated-GPU-backed-Financing/default.aspx). Crusoe has a smaller (~$425M) facility via Upper90 using a similar GPU/contract-collateral structure.
- **Structural mismatch flagged by analysts**: loan maturities and repayment schedules on these facilities often extend *longer* than the underlying customer contracts (commonly ~3 years) backing the revenue, and in CoreWeave's original 2024 Blackstone-led facility, principal repayments began in **January 2026** — a point at which, per market commentary, "the collateral's market value was declining sharply" as rental rates fell.
- **Comparison to aircraft leasing, but without the data**: multiple secondary sources use the framing that this is "aircraft leasing with a five-year asset instead of a twenty-five-year one, minus the half-century of residual-value data that makes aircraft leasing work" — i.e., lenders are pricing GPU-backed debt using a risk framework (asset-backed lending against a physical, marketable asset) that assumes reliable residual-value curves, which for GPUs simply do not yet exist at the maturity of aircraft/equipment leasing markets. This is a genuine structural risk, not just a rhetorical framing.
- **Who holds the risk**: private credit funds and alternative asset managers (Blackstone Tactical Opportunities was the lead on CoreWeave's original facility), rather than traditional bank balance sheets, appear to be the primary risk-bearers in these deals so far — this matters for systemic-risk framing because it may mean less direct banking-system contagion than a 2008-style scenario, but concentrated losses for private credit LPs (pensions, insurers, sovereign wealth allocators who invest in those funds) if residual values disappoint.
- **Correlated exposure**: multiple named neoclouds (CoreWeave, Lambda, Crusoe) all collateralize debt with the same underlying asset class (NVIDIA GPUs) and depend on the same demand driver (AI compute demand growth) — meaning a systemic risk exists if AI compute demand growth disappoints broadly, or if NVIDIA's own product cycle/supply dynamics shift, since it's not diversified collateral in the way a diversified ABS pool (e.g., auto loans) would be.
- **Connection to the depreciation/earnings-quality debate**: Burry's critique and the credit-risk critique are two sides of the same coin — if the hyperscalers' 5.5–6 year useful-life assumption is optimistic, then (a) reported hyperscaler earnings are inflated (equity-market risk) and (b) any GPU-backed loan using similar or more aggressive residual-value assumptions as the basis for loan-to-value ratios is undercollateralized relative to fundamentals (credit-market risk). Both risks share the same root cause (uncertain/unprecedented residual-value curves for a genuinely novel asset class) and could crystallize together in a downturn, i.e., they are not independent risks for portfolio-construction purposes.

## 5. Scenario table — reported margin / asset value under different depreciation assumptions

Illustrative model for a representative **$10 billion original-cost GPU fleet** (e.g., ~400–500K H100-class GPUs at a blended ~$20–25K/unit including servers/networking, roughly the scale of a large hyperscaler's annual AI capex tranche), assuming straight-line depreciation, no salvage value assumed in the schedule (consistent with most disclosed accounting policies), and hypothetical annual fleet-attributable revenue of $4B for margin illustration:

| Assumption | Annual depreciation | Yr-1 net book value | Yr-3 net book value | Cumulative depreciation expense, Yrs 1–3 | Illustrative opex-adjusted margin impact (vs. 6-yr case), Yr 1–3 avg |
|---|---|---|---|---|---|
| **3-year life** | $3.33B/yr | $6.67B | $0 (fully depreciated) | $10.0B | Depreciation ~2x the 6-yr case; margin ~-$1.67B/yr lower reported operating income vs. 6-yr assumption |
| **4-year life** | $2.50B/yr | $7.50B | $2.50B | $7.5B | ~-$0.83B/yr lower operating income vs. 6-yr assumption |
| **5-year life** | $2.00B/yr | $8.00B | $4.00B | $6.0B | ~-$0.33B/yr lower operating income vs. 6-yr assumption |
| **6-year life** (current hyperscaler norm) | $1.67B/yr | $8.33B | $5.00B | $5.0B | Baseline |

**Reading the table**: moving from a 6-year to a 3-year assumption for this single $10B tranche of fleet **doubles annual depreciation expense** ($1.67B → $3.33B) and fully writes off the fleet by year 3 instead of carrying $5B of net book value on the balance sheet at that point. Applied across the ~$500B+ in cumulative AI-related capex hyperscalers are expected to deploy 2024–2028 (order-of-magnitude industry figure, not GPU-fleet-specific), this mechanism is exactly what generates Burry's ~$176B multi-year understatement estimate — it is a straightforward function of (a) the size of the capitalized asset base and (b) the number of years' difference between the accounting assumption and the "true" competitive/economic life. Note this table is **illustrative arithmetic**, not a company-specific reconstruction — actual hyperscaler fleets are far larger, add new tranches every quarter (so the aggregate depreciation schedule is a rolling blend of cohorts at different assumption-vintages), and real disclosures do not break out GPU-only capex from total server/network capex, which is itself a limitation on how precisely outside analysts (Burry included) can size the effect.

---

## Sources

**Primary (SEC filings):**
- Microsoft Corp. 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/789019/000095017025100235/msft-20250630.htm
- Amazon.com Inc. 10-Q Q3 FY2025 — https://www.sec.gov/Archives/edgar/data/1018724/000101872425000123/amzn-20250930.htm
- Amazon.com Inc. 10-Q Q1 FY2025 — https://www.sec.gov/Archives/edgar/data/1018724/000101872425000036/amzn-20250331.htm
- Amazon.com Inc. 10-K FY2024 financial statements — https://www.sec.gov/Archives/edgar/data/1018724/000101872425000004/Financial_Report.xlsx
- Meta Platforms Inc. 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm
- Oracle Corp. 10-K FY2025 — https://www.sec.gov/Archives/edgar/data/1341439/000095017025087926/orcl-20250531.htm (XBRL note: https://www.sec.gov/Archives/edgar/data/1341439/000095017025087926/R31.htm)
- CoreWeave, Inc. SEC filings (S-1 / 10-K) — indexed at https://datacenters.mts.now/wiki/documents/coreweave-filings
- CoreWeave investor release, $8.5B GPU-backed financing (2026) — https://investors.coreweave.com/news/news-details/2026/CoreWeave-Closes-Landmark-8-5-Billion-Financing-Facility-Achieving-First-Investment-Grade-Rated-GPU-backed-Financing/default.aspx

**Secondary (analysis/interpretation):**
- CNBC, "The question everyone in AI is asking: How long before a GPU depreciates?" (2025-11-14) — https://www.cnbc.com/2025/11/14/ai-gpu-depreciation-coreweave-nvidia-michael-burry.html
- CNBC, "'Big Short' investor Michael Burry accuses AI hyperscalers of artificially boosting earnings" (2025-11-11) — https://www.cnbc.com/2025/11/11/big-short-investor-michael-burry-accuses-ai-hyperscalers-of-artificially-boosting-earnings.html
- WireSift Research, "How long does an AI server live? Hyperscaler depreciation, by the filings" — https://wiresift.com/ai-server-depreciation
- Hudson Labs, "Amazon Extended Server Life Twice, Then Reversed It" — https://www.hudson-labs.com/research/amazon-server-depreciation-amzn
- Hudson Labs, "Meta's Server Useful Life Went 4 to 5 to 5.5 Years" — https://hudson-labs.com/research/meta-financials-meta
- Computer Weekly, "Google saves almost $3bn by running servers for six years" — https://www.computerweekly.com/news/366557152/Google-saves-almost-3bn-by-running-servers-for-six-years
- deepquarry (Substack), "Depreciation of GPUs: between useful lives and useful myths" — https://deepquarry.substack.com/p/depreciation-of-gpus-between-useful
- Hashrate Index, "Used GPU Market: A100 & H100 Pricing, Depreciation" — https://hashrateindex.com/blog/used-gpu-market-pricing-deprecation-secondary-ai/
- Compute Exchange, "NVIDIA H100 GPU Price in 2026" — https://compute.exchange/blogs/h100-gpu-price-2026
- IntuitionLabs, "NVIDIA H100 Price 2026: $25K-40K, Plus H200/B200/B300" — https://intuitionlabs.ai/articles/nvidia-ai-gpu-pricing-guide
- XenoSpectrum, "What the A100 Re-Contract Reveals" — https://xenospectrum.com/en/coreweave-a100-contract-2029/
- Les Barclays (Substack), "Collateralized Chip Obligations" — https://lesbarclays.substack.com/p/collateralized-chip-obligations
- Quinn Emanuel client alert, "Emerging Litigation Risks in AI Data Centers" — https://www.quinnemanuel.com/media/4dzkfccz/client-alert-ai-data-center-financing-and-litigation-risks.pdf
- Catalyst Data Solutions, "The AI Capacity Cascade" — https://www.catalystdatasolutionsinc.com/the-lab/ai-capacity-cascade-hyperscale-gpu-server-upgrades
- Universal Value Advisors, "The Silicon Cascade: What GPU Depreciation Schedules Aren't Telling You" — https://universalvalueadvisors.com/blog/gpu-depreciation-silicon-cascade-2026
- Industrial Monitor Direct, "GPU Obsolescence: Engineering Limits and AI Data Center Economics" — https://industrialmonitordirect.com/blogs/knowledgebase/gpu-obsolescence-engineering-limits-and-ai-data-center-economics
