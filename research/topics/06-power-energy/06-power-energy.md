# Power & Energy (B1)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
Power has become the single binding constraint on AI data center buildout in 2026: interconnection queues in major US grids now stretch 5-7 years, while equipment (transformers, switchgear) lead times exceed two years. This has driven developers toward "speed-to-power" strategies that bypass or supplement the grid — behind-the-meter natural gas, nuclear/SMR PPAs, and bring-your-own-power models — especially in Texas/ERCOT where deregulation allows on-site generation outside the interconnection queue. Nuclear and SMR PPAs (Amazon-Talen, Microsoft-Constellation, Meta) have emerged as long-duration (15-20 year) firm power commitments to underwrite new generation, but pricing remains largely confidential. Electricity is roughly 32% of AI training cluster opex but only ~11% of full amortized TCO per GPU, meaning power access/timeline, not just $/MWh, is the dominant economic lever. Regulatory pushback is emerging (e.g., Texas paused new data center grid connections in August 2026 pending audit), signaling growing friction between hyperscale demand and grid/community capacity.

## Key findings
- Interconnection queues nationally total ~2,600 GW with median time-to-commercial-operation approaching 5 years; data centers specifically can face delays up to 12 years ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/)).
- PJM (Northern Virginia) waits approach 7 years for large AI campuses; CAISO 5-6 years; MISO ~5 years; SPP 4-5 years ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/)).
- ERCOT runs a separate large-load process with 3-4 year typical waits for campuses >75MW; ERCOT's large-load queue reached ~410 GW as of April 2026, with data centers ~73% of that pipeline, but only ~5.3 GW of the ~226 GW requesting connection is actually drawing power ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/); [Paces](https://www.paces.com/white-papers/grid-planning-data-centers-transmission-investment)).
- Texas Governor Abbott paused all new data center grid connections in August 2026 pending a comprehensive audit ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/)).
- Power transformer lead times average 128 weeks; generator step-up units 144 weeks — equipment scarcity is now as binding as the queue itself ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/)).
- Behind-the-meter natural gas: ~101 GW announced in the US, >57 GW with equipment already ordered, ~7 GW under construction, ~2 GW actually online as of mid-2026 (xAI's Colossus 1&2 near Memphis account for 1,498 MW of that operating capacity) ([Cleanview](https://cleanview.co/reports/behind-the-meter-data-centers)).
- Gas turbine plants can be permitted/built/commissioned in 18-30 months vs. 5-7 years for an equivalent-capacity grid substation; some packaged aeroderivative units operational in 12-15 months ([Cleanview](https://cleanview.co/reports/behind-the-meter-data-centers)).
- Nuclear/SMR PPA deals in 2026: Equinix >500MW (Stellaria, Radiant, Oklo); Data4/Microsoft 837MW; Amazon-Talen 1.92GW; Meta 6.6GW of firm power agreements; NuScale SMRs for Standard Power ([EnkiAI series](https://enkiai.com/nuclear/microsoft-constellation-ai-data-centers/)). SMR PPAs typically run 15-20 years and underwrite $1-3B plant financing.
- One hypothetical SMR PPA pricing reference: ~$130-150/MWh (confidential-analysis-derived, not confirmed market price) ([EnkiAI/SEC filing reference](https://www.sec.gov/Archives/edgar/data/0002081468/000121390026097903/ea030475901ex99-2.htm)).
- Electricity ≈32% of AI training cluster opex (vs. 68% colocation rent), but only ~11% of full per-GPU TCO once capex amortization is included ([ITK Research](https://itkservices3.com/background/datacentre_opex)).
- AI-optimized servers projected to be 31% of total data center power draw in 2026, up from 20% the prior year ([techplustrends](https://techplustrends.com/power-requirements-ai-data-centers/)).

## Insights & implications (developers / compute buyers)
- Speed-to-power now dominates site selection more than $/MWh: a developer that can deliver power in 18 months (via gas) beats one waiting 5-7 years for grid interconnection, even at a cost premium.
- ERCOT's deregulated "bring your own power" model is becoming the reference architecture for greenfield hyperscale/AI campuses nationally — expect more states to try to replicate it, and more regulatory friction (Texas pause) as a bellwether.
- Nuclear/SMR PPAs function less as near-term power sources (most SMRs won't deliver power until early 2030s) and more as balance-sheet-backed demand signals that de-risk financing for new nuclear capacity — a "buy the option" strategy for 2030+ power.
- Because power is a small share of full TCO but the master timeline constraint, compute buyers/labs should weight developer power-securing capability and speed over marginal power price when picking sites/partners.
- Equipment supply (transformers, GSUs, gas turbines) is becoming as much a bottleneck as interconnection paperwork — worth tracking as its own leading indicator.

## Open questions for deep dive
- What is the real distribution of $/MWh across PPA types (grid, gas BTM, nuclear/SMR, renewables+storage) once confidential terms are triangulated from public disclosures?
- How much of the announced 101GW+ of behind-the-meter gas capacity will face air-permitting or local opposition delays, and in which states?
- What specific policy/regulatory reforms (FERC queue reform, state-level BYOP rules) are most likely to compress interconnection timelines by 2028-2030?

## Cross-links
- Relates to [[07-hardware-supply-chain]] (power availability increasingly gates when new GPU capacity can actually be energized)
- Relates to [[08-cooling-density]] (higher rack density increases power draw per site, intensifying interconnection sizing needs)
- Relates to [[09-site-selection]] (power is the primary driver of the site-selection quadrilateral)

## Sources
- [Grid Interconnection Delays 2026: A Threat to US Energy](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/) — EnkiAI, 2026
- [Data Center Interconnection Queue: Wait Times, Backlogs & Grid Impact](https://www.electricchoice.com/datacenters/interconnection-queue/) — ElectricChoice, 2026
- [How Long It Takes to Power a Data Center in 2026](https://www.constructionowners.com/insights/how-long-it-actually-takes-to-power-a-data-center-in-2026-a-u-s-market-by-market-reality-check) — Construction Owners, 2026
- [The Data Center Power Queue Crisis](https://verse.inc/blog/the-data-center-power-queue-crisis) — Verse, 2026
- [The grid is planning for data centers that will never exist](https://www.paces.com/white-papers/grid-planning-data-centers-transmission-investment) — Paces, 2026
- [More data centers plan to build their own natural gas plants for power](https://www.marketplace.org/story/2026/02/04/more-data-centers-plan-to-build-their-own-natural-gas-plants-for-power) — Marketplace, Feb 2026
- [Bypassing the Grid: How Data Center Developers Are Building Their Own Power Plants](https://cleanview.co/reports/behind-the-meter-data-centers) — Cleanview, 2026 — quantifies BTM gas pipeline
- [US Gas Power for AI Data Centres Nearly Doubles in 2026](https://www.downtoearth.org.in/energy/us-gas-power-proposals-linked-to-data-centres-nearly-doubled-in-the-first-half-of-2026) — Down To Earth, 2026
- [Natural gas powers the data center boom](https://www.rbccm.com/en/insights/2026/05/natural-gas-powers-the-data-center-boom) — RBC Capital Markets, May 2026
- [Equinix Nuclear 2026, 500 MW Stellaria PPA](https://enkiai.com/nuclear/equinix-microreactor-data-centers/) — EnkiAI, 2026
- [Microsoft Nuclear 2026, 1,920 MW Amazon PPA](https://enkiai.com/nuclear/microsoft-constellation-ai-data-centers/) — EnkiAI, 2026
- [Meta Nuclear 2026, 6.6 GW Firm Power Agreements](https://enkiai.com/data-center/meta-nuclear-firm-power/) — EnkiAI, 2026
- [Data centre operating cost structures: traditional cloud versus AI](https://itkservices3.com/background/datacentre_opex) — ITK Research, 2026
- **Archive-worthy artifacts:** [NVIDIA FY2026 10-K](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm) — SEC filing, power/supply commentary in risk factors
