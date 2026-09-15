# Market Structure & Key Players (13)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
The AI data center ecosystem now has four distinct roles: hyperscalers (Microsoft/Azure, Google Cloud, AWS, Meta) that both self-build and lease; a new "neocloud" layer (CoreWeave, Crusoe, Lambda, Nebius, Nscale, Fluidstack) that specializes in renting GPU capacity and owns almost none of the underlying real estate; colo/REIT developers (Equinix, Digital Realty, QTS, Vantage, Switch) that own land/shells/power and lease to both hyperscalers and neoclouds; and AI labs (OpenAI, Anthropic, xAI, Google DeepMind) as the ultimate demand source, increasingly signing direct capacity/finance deals that bypass or blend these layers. Six neoclouds are collectively valued at over $150B and run a ~$48B annualized revenue run-rate (mid-2026), forecast to reach ~$300B by 2030 (~50% CAGR). Ownership is fragmenting: neoclouds overwhelmingly lease rather than build (CoreWeave's $99.4B backlog across 49 data centers is nearly all leased from third-party landlords), while hyperscalers pursue a hybrid of self-build plus large pre-leases (e.g., Equinix xScale whole-building pre-leases). Vertical integration is accelerating on both ends — chipmakers (NVIDIA) financing labs and clouds directly, and labs signing direct multi-GW infrastructure deals (Stargate) that route around traditional colo entirely.

## Key findings
- Six major neoclouds — Crusoe, Nebius, Nscale, CoreWeave, Lambda, Fluidstack — collectively valued >$150B, ~$12B/quarter revenue (~$48B annualized) as of mid-2026, forecast to reach ~$300B by 2030 (~50% CAGR) ([Measured AI](https://measuredai.substack.com/p/neoclouds-ai-middle-layer))
- CoreWeave (largest pure-play neocloud) reported a $99.4B revenue backlog as of March 31, 2026, across 49 data centers — nearly all leased from third-party landlords; first self-build not online until later in 2026 ([Measured AI](https://measuredai.substack.com/p/neoclouds-ai-middle-layer))
- Neocloud business model: own/control scarce inputs (energized land, interconnection positions, substations) rather than build; monetize megawatts, often with a hyperscaler or lab as anchor tenant that either passes payments to the landlord directly or assumes the lease on neocloud default ([Measured AI](https://measuredai.substack.com/p/neoclouds-ai-middle-layer))
- Equinix xScale has pre-leased entire data center buildings (e.g., full Dublin 5 building, full London 11/Slough) to hyperscalers before commercial operation — hyperscalers now pre-lease colo capacity 2-3 years ahead of COD, tightening supply and inflating lease rates ([Data Center Frontier](https://www.datacenterfrontier.com/featured/article/11428219/with-strong-xscale-leasing-equinix-steps-up-its-hyperscale-game); [Knowledge Sourcing](https://www.knowledge-sourcing.com/resources/thought-articles/from-retail-to-hyperscale-top-colocation-companies))
- Digital Realty's PlatformDIGITAL bundles colo + interconnection + managed services — a vertical-integration play raising tenant switching costs ([24/7 Wall St.](https://247wallst.com/investing/2026/09/04/3-data-center-reits-collecting-rent-from-the-ai-buildout/))
- US data center colocation market sized at $72.37B (2026), led by Equinix and Digital Realty, with QTS, Iron Mountain, and AI-focused developers (Applied Digital, Vantage) accelerating capacity ([Yahoo Finance/Databook](https://finance.yahoo.com/sectors/technology/articles/united-states-data-center-colocation-080900200.html))
- NVIDIA is vertically integrating downward into financing: up to $100B invested in OpenAI; Anthropic's $35B Lambda-anchored deal has NVIDIA funding the lab, funding the cloud (Lambda), selling the cloud its own chips, renting back ~18,000 GPUs, and reportedly holding the lease on the Texas site — blurring chipmaker/investor/customer/landlord roles ([Forbes](https://www.forbes.com/sites/jimosman/2026/08/16/nvidia-ai-financing-is-the-500-billion-risk-investors-arent-watching/))
- Hyperscaler capex (Microsoft, Google, Amazon, Meta) approaching a combined ~$700B in 2026, mostly AI infrastructure ([thesequence.substack.com](https://thesequence.substack.com/p/the-sequence-opinion-issue-926-ai))

## Insights & implications (developers / compute buyers)
- The "own vs. lease vs. rent" spectrum is now the central strategic choice: hyperscalers hedge by both self-building and pre-leasing (Equinix xScale-style whole-building deals) to diversify delivery-timeline risk; neoclouds have chosen to lease almost entirely, converting themselves into a compute-reselling layer over landlord-owned shells.
- For developers/landlords, the neocloud model is a tailwind: neoclouds and labs are willing anchor tenants for whole-building pre-leases years before COD, but this also concentrates counterparty risk — the value of many deals is a "pass-through" guarantee resting on the neocloud's or lab's credit, which itself often rests on a hyperscaler or chipmaker backstop (NVIDIA).
- Compute buyers (AI labs) are increasingly disintermediating both neoclouds and colo by structuring direct infrastructure joint ventures (Stargate), converting themselves into quasi-developers — a role reversal developers should watch since it changes who developers are actually negotiating land/power/lease terms with.
- Vertical integration by NVIDIA (chip supplier becoming financier/landlord/customer in the same deal chain) creates a single point of correlated risk across the entire stack that both developers and buyers should stress-test independently of headline deal size.

## Open questions for deep dive
- How much of neocloud "backlog" ($99.4B CoreWeave example) is contractually take-or-pay vs. cancellable, and what recourse do landlords have if a neocloud or its anchor lab defaults?
- What fraction of 2026 US data center capacity (by MW) is hyperscaler self-build vs. colo-leased vs. neocloud-leased vs. lab-direct (Stargate-style), and how has that mix shifted since 2023?
- What are the actual terms (tenor, escalators, take-or-pay %) in NVIDIA's financing-linked leases (e.g., the Anthropic/Lambda Texas site), and how common is this chip-supplier-as-landlord structure becoming?

## Cross-links
- Relates to [[14-speed-to-market]] (pre-commitment behavior driving the lease/build mix)
- Relates to [[15-demand-bubble-risk]] (circular NVIDIA financing, backlog quality)

## Sources
- [Neoclouds: AI's $150 Billion Middle Layer That Owns Almost Nothing](https://measuredai.substack.com/p/neoclouds-ai-middle-layer) — Measured AI (Substack), 2026 — core neocloud market-structure data
- ['WeWork 2.0': Booming AI Startups Concern Some Data Center Execs](https://www.bisnow.com/national/news/data-center-capital-markets/neoclouds-rewriting-rules-data-center-financing-135570) — Bisnow, 2026
- [The AI Cloud Stack: Where Hyperscalers and Neoclouds Actually Compete](https://www.thediligencestack.com/p/the-ai-cloud-stack-where-hyperscalers) — The Diligence Stack, 2026
- [Neo Clouds and the Three Business Models That Matter](https://www.thediligencestack.com/p/neoclouds-and-the-three-business) — The Diligence Stack, 2026
- [AI Infrastructure: Compute (3/4) Neoclouds and the New Economics of AI Compute](https://activantcapital.com/pdfs/3-the-rise-of-neoclouds-activant-capital.pdf) — Activant Capital — **archive-worthy PDF**
- [With Strong xScale Leasing, Equinix Steps Up Its Hyperscale Game](https://www.datacenterfrontier.com/featured/article/11428219/with-strong-xscale-leasing-equinix-steps-up-its-hyperscale-game) — Data Center Frontier, 2026
- [3 REITs Getting Paid as Big Tech Builds Out AI](https://247wallst.com/investing/2026/09/04/3-data-center-reits-collecting-rent-from-the-ai-buildout/) — 24/7 Wall St., 2026-09-04
- [United States Data Center Colocation Databook Report 2026](https://finance.yahoo.com/sectors/technology/articles/united-states-data-center-colocation-080900200.html) — Yahoo Finance / Databook, 2026
- [From Retail to Hyperscale: Top Colocation Companies](https://www.knowledge-sourcing.com/resources/thought-articles/from-retail-to-hyperscale-top-colocation-companies) — Knowledge Sourcing, 2026
- [Nvidia AI Financing Is The $500 Billion Risk Investors Aren't Watching](https://www.forbes.com/sites/jimosman/2026/08/16/nvidia-ai-financing-is-the-500-billion-risk-investors-arent-watching/) — Forbes, 2026-08-16
- **Archive-worthy artifacts:** [AI Infrastructure: Compute (3/4) — Neoclouds](https://activantcapital.com/pdfs/3-the-rise-of-neoclouds-activant-capital.pdf) — PDF deck, Activant Capital
