# DC Development Lifecycle & Pro Forma Anatomy (A1)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
AI data center development follows the same broad phase sequence as commercial real estate (site selection → power/utility → shell/core → fit-out → commissioning) but is now dominated by two things CRE developers rarely had to model as critical-path items: power procurement/interconnection timing and GPU-specific electrical/cooling fit-out cost. 2026 benchmarks put standard hyperscale shell-and-core construction around $10–12M/MW, with AI-optimized shell-and-core at $15–20M/MW and a fully built, GPU-populated AI facility at $30–40M/MW. Electrical systems (40–45% of budget) and cooling (15–25%) dominate the capex stack, and grid wait time — which doesn't appear in a $/MW benchmark at all — is what actually determines when a pro forma starts generating revenue. Lease-vs-own, build-to-suit vs. spec, and colo vs. self-build decisions increasingly hinge on who can get and finance power fastest, not just who can build fastest.

## Key findings
- Standard hyperscale shell-and-core construction averages ~$11.3M/MW globally (range ~$10–12M/MW mainstream); modern greenfield averages $17.6M/MW ([Cushman & Wakefield 2026 Development Cost Guide](https://www.cushmanwakefield.com/en/united-states/insights/data-center-development-cost-guide)).
- AI-optimized facilities: shell-and-core AI-ready runs $15–20M/MW; a fully built facility with GPUs installed runs $30–40M/MW ([Axis Intelligence, 2026](https://axis-intelligence.com/ai-data-center-cost-per-mw/); [GigaCapacity](https://www.gigacapacity.com/finance/data-center-construction-cost-per-mw)).
- Cost driver breakdown: electrical systems 40–45% of budget, cooling 15–25%, redundancy tier upgrades add up to 40% more for Tier IV vs. lower tiers ([CorAdvisors, 2026](https://www.coradvisors.net/2026/06/ai-data-center-development-costs-2026.html)).
- Grid/interconnection wait time is explicitly called out as the variable that doesn't show up in $/MW benchmarks but drives when a facility starts generating revenue in the pro forma — i.e., time-to-revenue, not just cost, is now a first-class pro forma line item.
- Commercial financial-model marketplaces (Flevy, Eloquens, SmartHelping) sell generic data center pro forma / DCF templates with 5–10 year projections, CAPEX/OPEX schedules, colo revenue lines (colocation, managed services, cloud, network, backup) and IRR/NPV/payback outputs — useful as generic pro forma skeletons even though none are AI-specific or free.

## Insights & implications (developers / compute buyers)
- For developers: the pro forma's critical revenue-timing assumption should be pinned to interconnection/power milestones, not construction milestones — construction is frequently no longer the pacing item.
- For compute buyers (AI labs): a $30–40M/MW all-in AI facility cost implies GPU procurement and fit-out capex often exceeds shell/power capex, so lease/colo negotiations should scrutinize who bears fit-out capex risk and how it's amortized into per-rack/per-MW pricing.
- Redundancy tier (Tier III vs IV) is a large, negotiable cost lever (~40% swing) — worth interrogating whether AI training workloads actually need Tier IV resiliency vs. inference-serving workloads that might.
- Lease vs. own and colo vs. self-build decisions should increasingly be framed as "who controls the power position" rather than "who can build the shell fastest."

## Open questions for deep dive
- Obtain or reconstruct a real, AI-specific pro forma (not generic colo) with line-by-line revenue assumptions (per-MW lease rates, escalators, utilization ramp).
- How do build-to-suit contracts allocate power-delay risk between developer and hyperscaler/lab tenant (penalty clauses, rent commencement triggers)?
- Regional cost variance: how much do $/MW benchmarks diverge across PJM, ERCOT, and emerging Gulf/international markets?

## Cross-links
- Relates to [[04-deployment-velocity]] for the power/interconnection critical path that determines pro forma revenue timing.
- Relates to [[05-facility-lifecycle]] for how depreciation/useful-life assumptions feed back into pro forma opex and residual value lines.
- Relates to [[02-financing]] for how SPV/project-finance structures change what appears on/off the developer's own pro forma.

## Sources
- [2026 Data Center Development Cost Guide](https://www.cushmanwakefield.com/en/united-states/insights/data-center-development-cost-guide) — Cushman & Wakefield, 2026 — primary $/MW benchmark source.
- [AI Data Center Cost per MW: 2026 Benchmarks by Tier](https://axis-intelligence.com/ai-data-center-cost-per-mw/) — Axis Intelligence, 2026 — tiered AI vs standard cost breakdown.
- [Data Center Construction Cost per MW in 2026](https://www.gigacapacity.com/finance/data-center-construction-cost-per-mw) — GigaCapacity, 2026.
- [AI Data Center Development Costs in 2026](https://www.coradvisors.net/2026/06/ai-data-center-development-costs-2026.html) — Core Insights Review / CorAdvisors, June 2026 — cost driver % breakdown.
- [What Does It Cost to Build a Modern Data Center in 2026?](https://www.constructelements.com/post/cost-to-build-modern-data-center-2026) — ConstructElements, 2026.
- [Economic costs of data-centers?](https://thundersaidenergy.com/downloads/data-centers-the-economics/) — Thunder Said Energy — analyst economics note.
- **Archive-worthy artifacts:** [Data Center Financial Model Template](https://flevy.com/browse/marketplace/data-center-financial-model-9441) — Flevy XLSX, paid — generic colo pro forma with 5-yr projections, CAPEX/OPEX/revenue drivers.
- **Archive-worthy artifacts:** [Data Center Development 10-Year Financial Model](https://flevy.com/browse/marketplace/data-center-development-10-year-financial-model-9164) — Flevy XLSX, paid.
- **Archive-worthy artifacts:** [Data Center DCF & Valuation Financial Model](https://flevy.com/browse/marketplace/data-center-dcf-and-valuation-financial-model-10-year-dcf-and-valuation-9374) — Flevy XLSX, paid — NPV/IRR/payback model.
