# The Value of Speed-to-Market for AI Compute (L2: Strategic/Market)

*Lens: AI-lab compute buyer + DC developer/operator. US-primary. Prepared 2026-09-15.*

## 1. Framing

L0 and L1 ask "what is a GW of capacity worth, and when." L2 asks a different question: **what is being *early* to a given compute scale worth, over and above the raw discounted cash flow of the assets themselves?** This is the premium (or penalty) a lab should be willing to pay to get capacity online sooner, expressed as a decision variable rather than a fixed multiplier.

Three established facts anchor the analysis:
- Interconnection is the binding constraint (5–7 yr grid queues), and a 12/24-month energization delay destroys ~23%/~47% of shell development value (L0 finding).
- Frontier training runs cost $200–500M today, headed to $1–3B (2026), funded against hyperscaler capex of ~$700B in 2026.
- 30–50% of announced 2026 capacity may slip to 2028 — i.e., delay is the modal outcome, not the tail case.

If delay is both extremely costly *and* extremely likely, the market should be pricing speed explicitly. It is — the question is how much, and under what conditions that price is rational versus a bubble artifact.

## 2. The compute-as-moat thesis, and its counter-evidence

### 2.1 The bull case for compute as moat
- Scaling-law logic: more compute + data + parameters → higher capability → capability gates enterprise contracts, agentic-workflow reliability, and consumer retention. The "capital at scale" argument has strengthened as physical constraints (power, chips) — not code — bind the frontier: capital itself starts to behave like a moat because the queue for power and chips is finite and multi-year ([a16z / AIToolly, 2026](https://aitoolly.com/ai-news/article/2026-09-12-a16z-on-ai-scale-why-massive-compute-spending-now-builds-enduring-venture-moats)).
- Enterprise-level data: BCG documents AI leaders (broadly, "AI-first" adopters) achieving **50% higher revenue and 60% higher total shareholder return** vs. laggards ([iternal.ai, citing BCG](https://iternal.ai/ai-first-mover-advantage)) — evidence that capability/speed advantages do translate into commercial outcomes, at least at the adopter level.
- Contract evidence of buyers willing to bind themselves years in advance for capacity (see §3) is itself revealed belief in a compute-driven capability edge worth locking in.

### 2.2 The counter-evidence: fast-follow and commoditization
- **Model release cadence has compressed, and the closed-source lead has nearly vanished.** Median days between frontier releases fell from 37.5 (2023) → 13.5 (2024) → 17 (2025) → 11 (2026 YTD) ([Digital Applied, Frontier Model Release Velocity Index Q2 2026](https://www.digitalapplied.com/blog/frontier-model-release-velocity-index-q2-2026)). Anthropic's own Michael Gerstenhaber described the gap between major Claude releases compressing from six months to two ([officechai.com](https://officechai.com/ai/frontier-labs-are-releasing-new-models-faster-than-ever-shows-data/)).
- **The US-vs-China frontier gap collapsed from ~18 months to single digits (and reversed on some benchmarks) in about a year.** By April 2026, GLM-5.1 (open-weight) topped SWE-Bench Pro ahead of GPT-5.4 and Claude Opus 4.6 ([officechai.com](https://officechai.com/ai/frontier-labs-are-releasing-new-models-faster-than-ever-shows-data/)).
- **DeepSeek is the canonical algorithmic-efficiency counter-example**: DeepSeek-V3 trained in ~2.79M H800 GPU-hours vs. ~30.8M H100 GPU-hours for Llama-3.1-405B — roughly an order of magnitude more compute-efficient for comparable capability, achieved via MLA attention, MoE routing, and mixed precision ([Medium/AIML "The DeepSeek Effect"](https://medium.com/@aiml_58187/the-deepseek-effect-rewriting-ai-economics-through-algorithmic-efficiency-part-1-46cf9b2e9930); [IISS](https://www.iiss.org/publications/strategic-comments/2025/04/deepseeks-release-of-an-open-weight-frontier-ai-model/)). This directly undercuts "more compute = durable lead" — a compute-poor lab reached the frontier via algorithm.
  - Counter-counter: Epoch AI argues algorithmic progress *increases* compute spending rather than substituting for it, because efficiency gains are typically reinvested into bigger runs rather than banked as cost savings ([Epoch AI](https://epoch.ai/gradient-updates/algorithmic-progress-likely-spurs-more-spending-on-compute-not-less)) — i.e., compute and algorithms are complements, not substitutes, which partially rescues the moat thesis but weakens the "just buy more GPUs" version of it.
- **Consumer market-share erosion despite first-mover status**: ChatGPT fell from ~76% to ~59.5% share of the generative-AI-chatbot market even while remaining the largest player; DALL-E-3's relative usage reportedly dropped ~80% as image-gen competitors arrived ([Innovation Vista](https://innovationvista.com/ai/1st-or-2nd-mover/)). Anthropic itself reached ~40% of OpenAI's revenue scale despite being later to market, via an enterprise-first, differentiated strategy rather than raw speed ([Innovation Vista](https://innovationvista.com/ai/1st-or-2nd-mover/)).
- **Where the durable moat is argued to be shifting**: not raw model capability (which fast-followers erode in months) but proprietary data/workflow integration, distribution/enterprise switching costs, and capital access itself as a scarce resource, given multi-year power/chip queues (The Sequence, a16z synthesis, [thesequence.substack.com](https://thesequence.substack.com/p/the-sequence-opinion-issue-926-ai)).

**Synthesis**: The compute-as-moat thesis holds at the *capacity-access* layer (whoever can secure power+chips fastest has an option others don't) far more robustly than at the *model-capability* layer (a 2–6 month capability lead is now typical, and algorithmic efficiency can leapfrog raw compute entirely). This distinction should be central to the decision framework: labs are really paying for **optionality and access lead-time**, not for a durable capability moat per se.

## 3. Revealed willingness-to-pay for speed

The clearest evidence of how labs value speed is in contract structure, not press-release optimism — buyers are paying capacity premiums, prepaying, and signing take-or-pay terms specifically to compress time-to-power.

- **OpenAI–Oracle (Stargate)**: OpenAI agreed to pay Oracle **$30B/year** for data-center services (4.5 GW, part of the $500B Stargate program), inside a broader **$300B, 5-year** compute purchase commitment ([TechCrunch](https://techcrunch.com/2025/07/22/openai-agreed-to-pay-oracle-30b-a-year-for-data-center-services); [Data Center Frontier](https://www.datacenterfrontier.com/machine-learning/article/55316610/openai-and-oracles-300b-stargate-deal-building-ais-national-scale-infrastructure)). The payment structure is consistent with take-or-pay: OpenAI pays for committed capacity as opex, "regardless of utilization" in effect, in exchange for Oracle/SoftBank building at a pace OpenAI could not achieve by developing directly. That's a direct purchase of speed.
- **Anthropic–Google/Amazon**: Anthropic has locked in **up to $517B** in compute commitments over 10 years across Amazon and Google, spanning **14.8 GW** of contracted capacity — including up to $100B/10yr to AWS for up to 5 GW (Trainium + Nvidia), and an expanded Google TPU deal reported at 3.5 GW in a Broadcom SEC filing ([CryptoBriefing](https://cryptobriefing.com/anthropic-secures-517b-in-ai-compute-deals-with-amazon-google-over-10-years/); [TechCrunch](https://techcrunch.com/2026/04/07/anthropic-compute-deal-google-broadcom-tpus/)). Notably, Anthropic's rationale for the multi-vendor structure is partly framed around *speed and resilience* — matching workloads to whichever chip is available rather than waiting on a single supply chain, i.e., diversification as a hedge against delay, not just a cost play.
- **Neocloud scarcity pricing directly monetizes speed-to-access.** CoreWeave (premium/faster-provisioning neocloud) prices H100 at ~$6.16/GPU-hr vs. Crusoe at ~$3.90/GPU-hr — roughly a 60% premium over Nebius/Lambda for effectively the same hardware ([Spheron Blog](https://www.spheron.network/blog/coreweave-vs-crusoe-h100-and-b200-pricing-2026/); [Cryptopond](https://cryptopond.com/best-gpu-neoclouds-2026-coreweave-nebius-lambda-crusoe-and-groq-ranked-by-published-pricing-and-contracted-power/)). Blackwell-generation GPUs command initial scarcity premiums (B200 ~$6.50/hr, GB200 rack-scale ~$17.85/hr) that compress as supply catches up — an explicit, time-decaying price of being early ([Silicon Analysts](https://siliconanalysts.com/analysis/gpu-rental-premium-decomposition-2026)). CoreWeave has also converted scarcity power into contract structure, imposing 36-month minimum commitments on smaller customers to lock in deferred revenue.
- **Behind-the-meter (BTM) gas is a direct, quantifiable speed premium on power itself.** Aeroderivative gas turbines (adapted from jet engines, deployable in months rather than the 3–7 years of heavy-duty turbines or grid interconnection) price at roughly **$106/MWh** vs. a national average industrial grid rate of **~$86/MWh** — a ~23% premium purely for bypassing the queue ([Green Gas Turbines](https://www.greengasturbines.com/blog/gas-turbines-for-data-centers-hyperscaler-power)). Grid interconnection timelines of 36–84 months are structurally incompatible with 12–24 month data-center build cycles, which is precisely why BTM commands a premium at all ([Green Gas Turbines](https://www.greengasturbines.com/blog/on-site-power-vs-grid-connection-data-centers-gas-turbine-economics)).

**Pattern**: across four independent markets (GPU compute contracts, GPU rental, gas-fired power, and mega-deal structuring), buyers consistently pay a **20–60% premium, or accept take-or-pay/multi-year lock-in, specifically to compress time-to-availability.** This is the empirical anchor for calibrating a "speed premium" variable in the decision framework.

## 4. Option value and timing

Capacity commitments are best modeled as real options, not static NPV bets, because uncertainty (about demand, about capability trajectories, about the competitive field) is exactly the condition under which optionality carries premium value.

- Classic real-options results: under demand uncertainty, firms optimally *increase* installed capacity and value the *option to delay* investment, because delay preserves the ability to invest information-adjusted rather than sunk-cost-adjusted ([ScienceDirect literature review](https://www.sciencedirect.com/science/article/abs/pii/S0377221798002744); [ResearchGate review](https://www.researchgate.net/publication/327164870_Real_Options_in_Irreversible_Investment_under_Uncertainty_a_Review)). Four canonical option types apply directly to DC capacity: **timing** (delay), **growth** (expand later), **switching** (change fuel/chip mix), **abandonment** (walk away from a shell or PPA).
- But AI compute is not a monopoly investment problem — it's a **race**. Real-options-plus-game-theory ("real option games") literature shows that **competition erodes the option value of waiting**: once a rival invests, the non-investor is left with a pure optimization problem rather than a live option, and competitive pressure systematically pushes players to invest *earlier* than their private (non-competitive) optimal threshold — i.e., rational preemption sacrifices option value to avoid being locked out ([arXiv 2410.17673, "Strategic Irreversible Investment"](https://arxiv.org/html/2410.17673); [ScienceDirect, "real option games" review](https://www.sciencedirect.com/science/article/abs/pii/S0305054825003570)).
- This produces the central **asymmetry** the framework must capture:
  - **Early / over-committed** → risk is *stranded capacity*: GPUs and power contracts sized for a capability lead that erodes in 2–6 months (§2.2), assets with 3–5 year useful life and 20–40% first-year effective depreciation ([Medium, "AI Bubble 2026"](https://medium.com/@svnkrmkr/ai-bubble-2026-is-it-real-capex-fed-warnings-gpu-lifespans-b5db2178d350)), and take-or-pay obligations that persist even if demand doesn't materialize.
  - **Late / under-committed** → risk is *missed-window*: 30–50% of 2026 capacity slipping to 2028 (established fact) means a lab that waited for lower prices or more certainty may simply not get a queue slot at all, and correspondingly may lose whatever capability-driven revenue/customer-acquisition window existed (the BCG 50%-revenue-uplift evidence, §2.1) to a faster-moving competitor.
  - The two risks are **not symmetric in reversibility**: stranded compute can potentially be resold, repurposed to inference, or the contract renegotiated; a missed capability window in a fast-follow market is largely non-recoverable within that generation (by the time you catch up, the field has moved again). This asymmetry is itself evidence for erring toward preemption *despite* stranding risk, which is consistent with why labs are observed paying speed premiums (§3) rather than waiting for better terms.

## 5. Decision framework: valuing speed-to-market

The framework separates the **capability-lead value stream** (may decay fast) from the **capacity-access value stream** (decays slower — physical queues don't reset every model generation) and prices delay against both.

### 5.1 Core variables

| Variable | Description | Anchor / range from evidence |
|---|---|---|
| `T_energize` | Months from decision to power-on | 12–84 months depending on grid vs. BTM/gas path |
| `ΔT_delay` | Additional delay vs. base case (e.g., interconnection slip) | Established: 12/24mo delay → 23%/47% shell-value loss |
| `L_capability` | Capability-lead half-life: months before a capability edge is competitively matched | ~2–6 months at model layer (Gerstenhaber; release-cadence data); much longer at capacity-access layer |
| `R_capmonth` | Incremental revenue (or enterprise-contract value) per month of capability lead | Proxy from BCG's 50% revenue / 60% TSR uplift for AI leaders; needs lab-specific calibration |
| `P_speed` | Premium required to compress time-to-power (contract premium, BTM premium, neocloud premium) | 20–60% observed range (§3); BTM ~23% vs grid; neocloud ~60% vs value providers |
| `P_delay` | Probability that base-case timeline slips | Established: 30–50% of 2026 capacity may slip to 2028 |
| `S_strand` | Stranding risk: probability-weighted loss if capacity outlives its capability-relevant use (obsolescence, overbuild) | GPU useful life 3–5 yrs, 20–40% first-year effective depreciation; scale to lab's expected utilization curve |
| `C_lockin` | Cost/inflexibility of the commitment (take-or-pay minimum, contract duration) | e.g., CoreWeave 36-month minimums; Stargate 5-yr/$300B commitment |
| `V_option` | Value of preserving optionality (deferral, switching, abandonment) foregone by committing early | Derived from real-options / real-option-games literature; rises with demand uncertainty, falls with competitive intensity |
| `π_competitive` | Competitive intensity / number of rivals racing for the same capacity or capability window | Empirically: number of hyperscalers/labs simultaneously contracting GW-scale (Stargate, Anthropic-Google-Amazon, Meta, xAI, etc.) |

### 5.2 How they combine

A simplified structure (directional, not meant as a literal closed-form the tool should hard-code, but the shape a calculator should expose):

```
Value_of_speed ≈ 
    Σ_over_capability_horizon [ R_capmonth × exp(-t / L_capability) ]     (capability-lead payoff, decaying)
  + [ P_delay × ΔT_delay × ShellValueLossRate ]                            (avoided delay-destruction, from L0 facts)
  − P_speed × ContractSize                                                 (cost of buying speed)
  − S_strand × C_lockin                                                    (stranding exposure from lock-in)
  − V_option × (1 − π_competitive_adjustment)                              (foregone optionality, reduced when rivals would preempt anyway)
```

Key interactions to make explicit in the tool:
- **`L_capability` is the pivot variable.** If capability half-life is short (2–6 months, per current evidence), the first term collapses fast and most of `Value_of_speed` should come from the *capacity-access* channel (avoiding the 23–47% delay-destruction and avoiding missed-window lockout), not from a durable capability edge. If a user believes moats are shifting toward data/distribution (§2.2 "where moat is shifting"), they should model a *second*, slower-decaying `L_capability_distribution` term separately from the fast-decaying raw-benchmark-capability term.
- **`π_competitive` compresses `V_option`.** The real-option-games result — competition erodes the value of waiting — means that as more labs simultaneously chase the same GW-scale capacity, the rational move shifts from "wait for better terms" toward "pay `P_speed` now," even holding everything else constant. The tool should let `π_competitive` scale down the optionality term rather than treating it as a fixed discount.
- **`S_strand` and `P_delay` pull in opposite directions** and should be shown as a tradeoff slider, not summed blindly: over-committing to move fast raises `S_strand`; under-committing raises exposure to `P_delay`'s missed-window cost. The asymmetric-reversibility point from §4 (stranded compute is more recoverable than a missed capability window) should be encoded as a higher weight on the missed-window branch than the stranding branch, adjustable by the user.

### 5.3 Worked calibration point (illustrative, not a precise valuation)
Using observed ranges: if `ΔT_delay` = 12 months, base shell-value loss ≈ 23% (established), and `P_delay` ≈ 40% (midpoint of 30–50%), the delay-avoidance expected value alone is ≈ 0.40 × 0.23 ≈ **9.2% of project value** — which is roughly in the same order of magnitude as the observed 20–60% speed premiums buyers are actually paying (§3), suggesting the market-revealed premiums are pricing in *more* than pure delay-avoidance (i.e., also pricing the capability-lead and competitive-preemption terms). This cross-check is a useful sanity boundary for the tool: a user-modeled "value of speed" that comes in far below observed market premiums (20%+) should prompt the question of what additional term (competitive preemption, optionality erosion) is missing from their assumptions.

## 6. What to expose as tool levers

1. **Capability-lead half-life (`L_capability`)** — slider, months, with presets: "model-layer fast-follow" (2–6mo, per current evidence) vs. "distribution/data-layer" (12–36mo, speculative/user-set) vs. "capacity-access layer" (multi-year, tied to interconnection queue length).
2. **Revenue-per-capability-month (`R_capmonth`)** — user input, with a documented reference range (BCG's 50%/60% uplift figures as one calibration anchor, explicitly labeled as enterprise-adoption-level evidence, not lab-revenue-specific).
3. **Delay probability and magnitude (`P_delay`, `ΔT_delay`)** — pre-populated from the established L0 fact set (30–50% of 2026 capacity slips to 2028; 23%/47% value destruction at 12/24mo).
4. **Speed premium (`P_speed`)** — pre-populated with observed ranges by acquisition channel: BTM gas (~20–25%), neocloud rental (~20–60%), long-term take-or-pay mega-deal (implicit, back out from Stargate/Anthropic deal terms if user supplies contract size).
5. **Stranding risk (`S_strand`) and lock-in cost (`C_lockin`)** — tied to GPU useful-life assumptions (3–5 yr) and contract minimums (e.g., 36-month), letting the user see how take-or-pay terms interact with obsolescence risk.
6. **Competitive intensity (`π_competitive`)** — a simple count/slider of how many other well-capitalized buyers are racing for the same power/chip queue right now, since this is the variable that (per real-option-games theory) rationally compresses the value of waiting and justifies paying `P_speed`.
7. **A toggle for "which moat are you buying?"** — model-capability lead (fast-decaying, contested by fast-follow/algorithmic-efficiency evidence) vs. capacity-access lead (slower-decaying, protected by multi-year physical queues) — so the tool forces the user to state explicitly which value stream they think they're purchasing when they pay a speed premium.

## Sources
- [a16z on AI Moats (AIToolly synthesis), 2026](https://aitoolly.com/ai-news/article/2026-09-12-a16z-on-ai-scale-why-massive-compute-spending-now-builds-enduring-venture-moats)
- [The Sequence, Issue 926: AI Moats in the Age of Scaling Laws](https://thesequence.substack.com/p/the-sequence-opinion-issue-926-ai)
- [TechCrunch: OpenAI agreed to pay Oracle $30B/year](https://techcrunch.com/2025/07/22/openai-agreed-to-pay-oracle-30b-a-year-for-data-center-services)
- [Data Center Frontier: OpenAI/Oracle $300B Stargate deal](https://www.datacenterfrontier.com/machine-learning/article/55316610/openai-and-oracles-300b-stargate-deal-building-ais-national-scale-infrastructure)
- [CryptoBriefing: Anthropic secures $517B in AI compute deals](https://cryptobriefing.com/anthropic-secures-517b-in-ai-compute-deals-with-amazon-google-over-10-years/)
- [TechCrunch: Anthropic ups compute deal with Google and Broadcom](https://techcrunch.com/2026/04/07/anthropic-compute-deal-google-broadcom-tpus/)
- [Spheron Blog: CoreWeave vs Crusoe pricing 2026](https://www.spheron.network/blog/coreweave-vs-crusoe-h100-and-b200-pricing-2026/)
- [Silicon Analysts: GPU Rental Price Decomposition 2026](https://siliconanalysts.com/analysis/gpu-rental-premium-decomposition-2026)
- [Cryptopond: Best GPU Neoclouds 2026](https://cryptopond.com/best-gpu-neoclouds-2026-coreweave-nebius-lambda-crusoe-and-groq-ranked-by-published-pricing-and-contracted-power/)
- [Green Gas Turbines: Gas Turbines for Data Centers 2026](https://www.greengasturbines.com/blog/gas-turbines-for-data-centers-hyperscaler-power)
- [Green Gas Turbines: On-Site Power vs Grid Connection Economics](https://www.greengasturbines.com/blog/on-site-power-vs-grid-connection-data-centers-gas-turbine-economics)
- [Medium/AIML: The DeepSeek Effect](https://medium.com/@aiml_58187/the-deepseek-effect-rewriting-ai-economics-through-algorithmic-efficiency-part-1-46cf9b2e9930)
- [IISS: DeepSeek's release of an open-weight frontier AI model](https://www.iiss.org/publications/strategic-comments/2025/04/deepseeks-release-of-an-open-weight-frontier-ai-model/)
- [Epoch AI: Algorithmic progress likely spurs more spending on compute, not less](https://epoch.ai/gradient-updates/algorithmic-progress-likely-spurs-more-spending-on-compute-not-less)
- [Digital Applied: Frontier Model Release Velocity Index Q2 2026](https://www.digitalapplied.com/blog/frontier-model-release-velocity-index-q2-2026)
- [officechai.com: Frontier Labs Are Releasing New Models Faster Than Ever](https://officechai.com/ai/frontier-labs-are-releasing-new-models-faster-than-ever-shows-data/)
- [Innovation Vista: Better to Be the 1st or 2nd AI Mover?](https://innovationvista.com/ai/1st-or-2nd-mover/)
- [Iternal.ai: AI First-Mover Advantage (BCG data)](https://iternal.ai/ai-first-mover-advantage)
- [Medium: AI Bubble 2026 — Capex, Fed Warnings & GPU Lifespans](https://medium.com/@svnkrmkr/ai-bubble-2026-is-it-real-capex-fed-warnings-gpu-lifespans-b5db2178d350)
- [ScienceDirect: Investment and capacity choice under uncertain demand](https://www.sciencedirect.com/science/article/abs/pii/S0377221798002744)
- [ResearchGate: Real Options in Irreversible Investment under Uncertainty — a Review](https://www.researchgate.net/publication/327164870_Real_Options_in_Irreversible_Investment_under_Uncertainty_a_Review)
- [arXiv 2410.17673: Strategic Irreversible Investment](https://arxiv.org/html/2410.17673)
- [ScienceDirect: Investments under strategic competition and uncertainty — real option games review](https://www.sciencedirect.com/science/article/abs/pii/S0305054825003570)
