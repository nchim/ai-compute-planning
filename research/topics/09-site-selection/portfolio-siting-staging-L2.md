# Portfolio Siting & Staging Strategy (L2 — Strategic)

**Level:** L2 strategic — above single-asset/parcel underwriting (L0) and single-compute-asset economics (L1). This note addresses how an operator or AI lab should place and phase a *portfolio* of capacity across multiple US power markets.

**Date of research:** 2026-09-15. Lens: DC developer/operator + AI-lab compute buyer, US-primary.

---

## 1. Framing

A portfolio siting problem is not "where is the best site" (L1) but "given N GW of committed/likely demand growing over 3–7 years, how do I allocate it across markets and phase its delivery so that (a) I'm not blocked by any single market's interconnection queue, (b) I'm not wiped out by concentrated regulatory/ratepayer/curtailment risk in one region, (c) I can serve both latency-tolerant training and latency-sensitive inference demand, and (d) I don't overbuild against uncertain demand." This is a real-options and portfolio-construction problem layered on top of the physical facts already established: energization is the critical path (PJM ~7yr / ERCOT 3–4yr but gated by an Aug-2026 TX audit), transformers take 128–160 weeks, and only ~1.5–2.5 GW of the 9.8 GW of signed nuclear PPAs is deliverable by 2028.

---

## 2. How real portfolios are actually distributed (evidence)

### 2.1 Concentration is still the dominant pattern, especially for training
- Northern Virginia (PJM) remains the single largest data center market on earth: **13% of all global operational capacity and 25% of Americas capacity**, with the region having "nearly three and a half times more data center capacity than all secondary US markets combined." In H1 2026 it led all primary US markets with 4,496.5 MW total inventory, 0.2% vacancy, and construction pipeline up 16.5% to 2,420.2 MW. ~70% of global internet traffic passes through the region. — [CBRE: Northern Virginia Extends Lead](https://www.cbre.com/press-releases/northern-virginia-extends-lead-as-largest-u-s-data-center-market-in-2025), [CBRE North America Data Center Trends H1 2026](https://www.cbre.com/insights/books/north-america-data-center-trends-h1-2026)
- Amazon has the largest footprint in Virginia, followed by Microsoft and Google; Meta operates outside Richmond. — [Data Center Knowledge: Emerging Markets 2026](https://www.datacenterknowledge.com/data-center-site-selection/emerging-data-center-markets-key-locations-to-watch-in-2026)
- OpenAI/Oracle/SoftBank's Stargate portfolio is itself concentrated in Texas (three of seven sites: Abilene, Milam County, Shackelford County) but spread the rest across New Mexico, Wisconsin, Michigan, and Ohio — i.e., even a single lab's buildout deliberately spans multiple ISO/utility territories (ERCOT, WECC-adjacent, MISO, PJM footprint states) rather than doubling down on one queue. Abilene (flagship, ERCOT) is ~0.3 GW live today en route to ~2.4 GW by 2030; portfolio target is >9 GW by 2029. — [Epoch AI: Stargate site tracker](https://epoch.ai/publications/openai-stargate-where-the-us-sites-stand), [Kova Stack: Stargate site list 2026](https://kovastack.ai/blog/openai-stargate-datacenter-locations-2026)

### 2.2 Diversification into secondary/tertiary markets is accelerating, driven by constraint, not preference
- Power, permitting, and cost constraints in primary markets (N. Virginia, and to a lesser extent Dallas/ERCOT) are pushing hyperscalers into secondary markets: Ohio, Louisiana, Indiana, the Carolinas, Pennsylvania, Mississippi, Nevada, Wyoming. Named moves: Amazon (Pennsylvania, North Carolina), Meta (Louisiana), Microsoft (~3,200 acres near Cheyenne, WY, announced April 2026; also acquiring land near existing Nevada build-out), Google ($400M expansion in Nevada). — [Data Center Knowledge: Emerging Markets 2026](https://www.datacenterknowledge.com/data-center-site-selection/emerging-data-center-markets-key-locations-to-watch-in-2026)
- This is diversification *of necessity*: the pattern is "grow the core market as fast as the queue allows, and route the marginal GW to wherever power is available now," not an ex-ante balanced portfolio design.

### 2.3 Training vs. inference are increasingly sited as two different portfolios
- Training tolerates up to ~100ms inter-region latency and is being sited in remote, power-rich, low-cost locations (Abilene TX, Ellendale ND) — remoteness is an asset, not a liability, for training.
- Inference is latency-driven: performance depends on round-trip time to end users, pushing infrastructure toward metro-adjacent campuses near population/network aggregation points. McKinsey projects inference overtakes training as the dominant compute workload around 2027, reaching >50% of AI compute and 30–40% of total DC demand by 2030 — meaning the portfolio's *center of gravity* is shifting from "one remote mega-campus" toward "many smaller metro-proximate inference nodes." — [DCD: "Training built the campuses. Inference will choose the markets"](https://www.datacenterdynamics.com/en/opinions/training-built-the-campuses-inference-will-choose-the-markets/), [EdgeCore: AI Inference vs Training](https://edgecore.com/ai-inference-vs-training/)
- Practical implication: a lab/operator portfolio is bifurcating into (a) a small number of very large, remote, power-optimized *training* super-campuses, and (b) a larger number of smaller, latency-optimized *inference* nodes distributed near demand centers — these have different siting logics and should be modeled as separate sub-portfolios with different risk factors.

### 2.4 Land banking and powered-land optionality are now a first-order capital allocation, not a side activity
- Land acquisition rose from ~19% of DC development spend in 2025 to **~30% in 2026**; AWS, Microsoft, Google, and Oracle together now account for **>60% of global data center land acquisitions**, explicitly banking land years ahead of shovel-ready status. — [HBCapital: Land 2026](https://www.hbcapitalre.com/land-2026-data-center-power-ready-repricing/)
- Structuring favors options (right to buy in a window) or banking (hold without committing) over outright purchase, preserving optionality while power/entitlement risk resolves; SPV structures are built to allow generation/network assets to be split out from the real estate for different investor classes. — [Linklaters: Powered Land](https://www.linklaters.com/en/insights/thought-leadership/powered-land/powered-land-co-locating-power-and-data-centres), [Benesch: Powered Land & Data Centers](https://www.beneschlaw.com/industry/real-estate/powered-land-data-centers/)
- With interconnection queues now routinely exceeding 5 years, "land was never really the constraint — power was, and still is" — so the banking strategy is fundamentally a bet on securing a *position in the queue*, not the parcel itself. — [Data Center Knowledge: Land Banking Explained](https://www.datacenterknowledge.com/data-center-site-selection/land-banking-explained-a-novel-strategy-for-data-center-expansion)

### 2.5 Powered shells and modular phasing are the mechanism for staging capacity against uncertain demand
- Powered-shell facilities (dual-substation-fed shells with tenant-installed IT/cooling) let a developer commit to the shell and grid interconnection early while deferring the capital-intensive buildout of power/cooling infrastructure and IT until demand firms up, deploying in 6–12 months once shell is powered. — [Prismecs: Powered Shell Data Centers](https://prismecs.com/blog/powered-shell-data-centers-benefits-design-adoption), [Stream Data Centers: Powered Shell glossary](https://www.streamdatacenters.com/resource-library/glossary/powered-shell/)
- Modular, phased buildout aligned to utility power availability is explicitly framed as risk mitigation against demand uncertainty: public TCO analyses put savings around **30%** versus overbuilding a full shell/MEP on day one, by deferring capital that doesn't need to be spent yet. — [Global Data Center Hub: Turnkey Data Centers Are Dying](https://www.globaldatacenterhub.com/p/turnkey-data-centers-are-dying), [ModulEdge: Modular Data Center Guide](https://www.moduledge.com/blog/modular-data-center-guide)

### 2.6 Regulatory/ratepayer risk is now geographically differentiated and is becoming a portfolio input, not just a project risk
- As of May 2026, **23 states** have approved at least one large-load tariff and 7 more have proposals pending; Virginia's GS-5 tariff requires data centers >25MW to sign 14-year contracts. At least 18 states have introduced special-rate-class bills for large energy users. — [EEI: Large Load Projects and Tariffs, Aug 2026](https://www.eei.org/-/media/Project/EEI/Documents/Issues%20and%20Policy/List%20of%20Large%20Customer%20Projects%20and%20Tariffs), [MultiState: State DC Legislation 2026](https://www.multistate.us/insider/2026/2/20/state-data-center-legislation-in-2026-tackles-energy-and-tax-issues)
- Virginia, Georgia, Ohio, Oklahoma, and Indiana are all actively reconsidering data-center tax incentives and cost-allocation rules; Virginia's JLARC and PJM's own market monitor have both flagged data-center-driven ratepayer cost increases, raising political risk specifically in the most concentrated markets. — [ArentFox Schiff: State Regulation of Data Centers 2026](https://www.afslaw.com/perspectives/alerts/state-regulation-data-centers-2026-shifting-landscape), [Brookings: ratepayer pledge](https://www.brookings.edu/articles/the-pledge-to-protect-ratepayers-from-ai-data-center-costs-needs-enforcement/)
- This means the markets with the *fastest historical energization* (because incumbent infrastructure and relationships exist) are also accumulating the *highest regulatory-backlash risk* — a direct tension for portfolio concentration.

---

## 3. Diversification vs. concentration tradeoffs

| Factor | Concentrate (e.g., all-in on NoVA/ERCOT) | Diversify across markets |
|---|---|---|
| **Speed to power** | Faster if you already have position in queue / existing substation relationships; slower for new entrants (queue is now 3–7 yr) | New markets often have shorter nominal queues but unproven track record, weaker grid/labor ecosystem |
| **Cost** | Lower unit cost from clustering (shared fiber, labor pool, supply chain, one regulatory relationship) | Higher initial unit cost; premium to establish presence, may require BTM gas ($10–75/MWh premium) to compress timeline |
| **Regulatory/ratepayer risk** | Highly correlated — a single adverse tariff ruling or incentive rollback (VA, GA, OH all active in 2026) hits the whole portfolio | Diffuses political risk; no single state's backlash stops the whole build program |
| **Interconnection/curtailment risk** | Correlated queue delays and curtailment exposure (same ISO, same constrained substations) | Diversifies across ISOs (PJM, ERCOT, MISO, WECC) with different queue reform timelines and rules |
| **Latency coverage** | A remote training-only cluster leaves inference demand near major population centers unserved | Enables the training-remote / inference-near-demand bifurcation described in §2.3 |
| **Climate/water risk** | Concentration in water-stressed regions (parts of TX, AZ) compounds exposure to a single climate risk factor | Spreads water/climate exposure; but adds diligence burden across more sites |
| **Organizational overhead** | Simpler: one utility relationship, one regulatory playbook, one workforce pipeline | More overhead: separate utility negotiations, permitting regimes, and labor markets per market |

**Net read:** the empirical pattern (§2.1–2.2) shows operators are *not* choosing textbook diversification — they are concentrating as fast as physically possible in the 1–2 best markets (NoVA, ERCOT) while routing overflow demand to secondary markets under duress. This is rational only if (a) speed-to-power dominates the objective function (compute is revenue-critical and undersupplied) and (b) the regulatory/curtailment tail risk is judged as low-probability or slow-moving relative to the payback horizon. A portfolio tool should treat this "concentrate-until-forced-to-diversify" behavior as the observed baseline strategy, and let the user stress-test what happens if the tail risk (a large-load tariff, a curtailment order, an incentive clawback) hits the dominant market.

---

## 4. Staging & phasing mechanics (the real-option lens)

The instruments observed in the market map directly onto a real-options framework:

1. **Land options / land banking** (§2.4) = buying a call option on a site without committing capital to power/entitlement risk. Cheap to hold, exercise only once power delivery date is confirmed.
2. **Powered land / secured interconnection position** = the option becomes far more valuable once queue position is locked, since queue position itself is now the scarce, non-fungible asset (interconnection timelines, not land, are the binding constraint per §2.4).
3. **Powered shell** (§2.5) = partial exercise: commit capital to the shell + grid connection (the long-lead, hard-to-reverse piece) while deferring the reversible/scalable piece (IT, cooling fit-out) until demand is confirmed.
4. **Modular/phased fit-out** = staged exercise of the remaining option in tranches, matched to realized demand, capturing ~30% savings versus full day-one build.
5. **BTM/gas bridge power** (established fact) = a costly but fast way to desynchronize a site's energization from the grid queue entirely, effectively buying time-compression at a $10–75/MWh premium — usable as a targeted lever on specific high-priority sites in the portfolio rather than a portfolio-wide strategy.

The **portfolio-level value of the pipeline** is the sum of these options across markets, and the fact that AWS/Microsoft/Google/Oracle now account for >60% of land acquisitions (§2.4) suggests the largest players are explicitly building an option book — not a set of committed projects — sized well beyond near-term confirmed demand, to preserve flexibility about which markets get exercised first as demand and queue outcomes resolve.

---

## 5. Decision framework — variables and interactions

### Core variables (per candidate market/site, aggregated to portfolio level)
1. **Energization time & variance** — median interconnection timeline for the ISO/utility (PJM ~7yr, ERCOT 3–4yr but Aug-2026-audit-gated, MISO/WECC other) plus the *variance/tail risk* of that estimate (queue reform in progress, transformer lead time 128–160wk as a hard floor).
2. **Power cost & structure** — $/MWh, availability of BTM gas bridge (and its premium), PPA availability (including the nuclear-PPA scarcity: only 1.5–2.5 GW of 9.8 GW signed deliverable by 2028), curtailment exposure/frequency.
3. **Regulatory/ratepayer risk score** — presence and trajectory of large-load tariffs, incentive stability, political sentiment (23 states with tariffs as of Aug-2026, 18 with special-rate-class bills pending) — treat as a time-varying, market-specific hazard rate on the "keep operating at planned scale" assumption.
4. **Latency class of demand served** — training (remote-tolerant, ~100ms) vs. inference (metro-proximate, single-digit-ms) — this determines which markets are even eligible for a given demand tranche.
5. **Concentration/correlation limits** — a portfolio-level cap on % of total capacity (or % of near-term committed capacity) in any single ISO/market, explicitly modeling correlated exposure (e.g., "no more than X% of committed 2028 capacity in PJM+ERCOT combined").
6. **Water/climate risk** — secondary siting constraint (per established facts) but compounds with concentration: multiple large sites in the same watershed or same climate-hazard zone.
7. **Demand-certainty / phasing trigger** — the confidence level and time horizon of the compute demand this capacity serves (lab-committed training run vs. speculative inference growth), which determines how much of the site should be built as powered-shell-only vs. fully fitted.
8. **Rack density trajectory** — established secondary constraint (120→600kW) that affects how much of a given power allocation translates to usable compute, and how future-proof a phased build is against redesign.

### Interactions to model
- **Energization time × demand certainty** sets the phasing trigger: long-queue markets should only be entered with the powered-shell/option structure unless demand is highly certain; short-queue markets can support faster full-commit builds.
- **Regulatory risk × concentration limits**: a market with rising ratepayer backlash should have its concentration cap tightened over time even if it remains fastest-to-power today — this is the key inter-temporal risk the market's current concentrate-first behavior (§3) is arguably underpricing.
- **Latency class × market selection**: the training and inference sub-portfolios should be optimized somewhat independently, with different concentration limits (inference *should* be geographically dispersed near population centers almost by definition; training concentration is more defensible).
- **BTM gas premium × queue delay**: a lever to selectively "buy back" schedule on the highest-value/most demand-certain sites within an otherwise diversified portfolio, rather than a blanket strategy.

---

## 6. What to expose as tool levers

For a tool implementing this L2 view, expose:
1. **Market selector with live-updating risk metadata**: per ISO/utility — median queue time, queue time variance/reform status, current large-load tariff status, curtailment history, BTM gas premium available.
2. **Portfolio concentration dial**: max % of total (or near-term) capacity allowed per ISO/market/utility; show current allocation against the cap and flag correlated exposure (e.g., combined PJM+ERCOT share).
3. **Staging slider per site**: land option → powered land (queue position secured) → powered shell → fitted/live, each with associated capital committed, reversibility, and time-to-operational; let user simulate exercising or deferring each stage.
4. **Demand-certainty input** per capacity tranche (training vs. inference; contracted vs. speculative) that automatically recommends a phasing posture (full commit vs. shell-only vs. option-only) and a latency-eligible market set.
5. **Stress-test button**: apply a shock (e.g., "Virginia GS-5-style tariff expands," "ERCOT queue freezes another 12 months post-audit," "curtailment event in Market X") and show portfolio-level schedule/cost/revenue impact given current concentration.
6. **Real-option value estimate**: rough NPV-of-optionality for the land/power pipeline relative to fully committed capacity, to make the case for holding excess optioned pipeline (mirroring the observed >60%-of-land-acquisitions-by-4-firms behavior).
7. **Training/inference sub-portfolio toggle**: separate views and separate concentration/latency constraints for the two demand classes, reflecting the bifurcating siting logic in §2.3.

---

## 7. Best free sources found

- [CBRE — North America Data Center Trends H1 2026](https://www.cbre.com/insights/books/north-america-data-center-trends-h1-2026)
- [CBRE — Northern Virginia Extends Lead as Largest U.S. Data Center Market in 2025](https://www.cbre.com/press-releases/northern-virginia-extends-lead-as-largest-u-s-data-center-market-in-2025)
- [Epoch AI — OpenAI Stargate: where the US sites stand](https://epoch.ai/publications/openai-stargate-where-the-us-sites-stand) (also see [Epoch AI's AI data center directory](https://epoch.ai/data/ai-data-centers/directory/openai-stargate-abilene) — a genuinely useful free tracker)
- [Data Center Dynamics — "Training built the campuses. Inference will choose the markets"](https://www.datacenterdynamics.com/en/opinions/training-built-the-campuses-inference-will-choose-the-markets/)
- [Data Center Knowledge — Emerging Data Center Markets: Key Locations to Watch in 2026](https://www.datacenterknowledge.com/data-center-site-selection/emerging-data-center-markets-key-locations-to-watch-in-2026)
- [Data Center Knowledge — Land Banking Explained](https://www.datacenterknowledge.com/data-center-site-selection/land-banking-explained-a-novel-strategy-for-data-center-expansion)
- [EEI — Large Load Projects and Tariffs (Aug 2026 tracker)](https://www.eei.org/-/media/Project/EEI/Documents/Issues%20and%20Policy/List%20of%20Large%20Customer%20Projects%20and%20Tariffs)
- [MultiState — State Data Center Legislation in 2026](https://www.multistate.us/insider/2026/2/20/state-data-center-legislation-in-2026-tackles-energy-and-tax-issues)
- [ArentFox Schiff — State Regulation of Data Centers in 2026](https://www.afslaw.com/perspectives/alerts/state-regulation-data-centers-2026-shifting-landscape)
- [HBCapital — Land 2026: AI Data Centers Repricing CRE Land](https://www.hbcapitalre.com/land-2026-data-center-power-ready-repricing/)

---

## 8. Key unresolved question

**Is the industry's current "concentrate first, diversify only under duress" behavior (§2.1–2.2) a rational bet that speed-to-power dominates all other risks, or is it under-pricing correlated regulatory/ratepayer/curtailment tail risk in the 1–2 dominant markets (NoVA/PJM, ERCOT)?** No public source quantifies the probability-weighted cost of a large-load-tariff shock or a curtailment order hitting a >4.5GW single-market portfolio (the NoVA scale today). Until an operator or analyst publishes a genuine portfolio-level stress test — rather than single-project risk disclosures — this remains the central open modeling question for anyone trying to size an appropriate diversification/concentration limit rather than just observing what hyperscalers have done so far.
