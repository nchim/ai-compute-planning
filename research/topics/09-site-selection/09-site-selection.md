# Site Selection (B4)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
Site selection in 2026 has been reorganized around a single question: "where can I actually get 300MW before 2030?" — power availability now dominates the traditional power-land-fiber-water quadrilateral, subordinating even fiber/latency and cost considerations for training workloads. ERCOT (Texas) has become the reference deregulated market, with 51.4 GW of identified development potential (second only to PJM's 66.4 GW) and "bring your own power" rules that let developers bypass interconnection queues — but this has produced its own backlash (Texas paused new grid connections in August 2026 pending audit) and strained local water supplies. Training workloads remain latency-tolerant and can chase cheap/fast power in frontier markets (West Texas, Ohio, Iowa), while inference workloads are latency-sensitive and must stay closer to population/demand centers, keeping legacy hubs like Northern Virginia relevant despite 7-year interconnection waits. Roughly 64% of US capacity under construction is now in "frontier markets" outside traditional hubs (Northern Virginia, Silicon Valley).

## Key findings
- ERCOT: 51.4 GW of identified development potential (buildable acreage owned by developers), second to PJM's 66.4 GW ([Enverus](https://www.enverus.com/newsroom/data-center-sites-unseen-2026-parcel-update/)).
- ERCOT large-load interconnection queue: ~410 GW as of April 2026, ~73% of which is data centers; only ~5.3 GW of the ~226 GW requesting connection is actually drawing power, illustrating a large gap between announced and real demand ([Paces](https://www.paces.com/white-papers/grid-planning-data-centers-transmission-investment)).
- Northern Virginia: ~20.3 GW of live capacity in 2026 (up from 16 GW in 2025), ~13% of global live capacity, still the largest single market globally — but new grid connection waits can exceed 7 years ([roctelecom](https://roctelecom.com/insights/northern-virginia-data-center-market/)).
- Pipeline project counts by state: Texas leads with 91 projects, followed by Virginia (70), Ohio (48), Iowa (28), California (27) ([irecruit](https://www.irecruit.co/insights/hyperscale-data-center-news-2026)).
- ~64% of US data center capacity currently under construction is in "frontier markets" outside traditional hubs like Northern Virginia/Silicon Valley ([datacenters.com](https://www.datacenters.com/news/2026-data-center-projects-that-could-add-20-gw-of-new-capacity)).
- 2026 projects in the pipeline could add >20 GW of new global capacity ([datacenters.com](https://www.datacenters.com/news/2026-data-center-projects-that-could-add-20-gw-of-new-capacity)).
- Water: Texas data centers could account for up to 9% of the state's total water use by 2040; in The Dalles, Oregon, Google's water use grew 316% while town population grew only 12%, illustrating community strain from cooling water demand ([Houston Chronicle](https://www.houstonchronicle.com/business/energy/article/ercot-grid-data-centers-22286592.php)).
- Texas Governor Abbott paused all new data center grid connections statewide in August 2026 pending a comprehensive audit, a direct regulatory response to queue congestion ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/)).

## Insights & implications (developers / compute buyers)
- The power-land-fiber-water quadrilateral has effectively become power-first: land, fiber, and even water are increasingly treated as secondary screens applied only after a site clears the power/timeline bar.
- Training vs. inference site strategy is bifurcating: training campuses are moving to frontier/rural markets (West Texas, Ohio, Iowa) chasing power and land at the cost of higher latency to population centers (acceptable given training's batch/offline nature); inference deployments must stay latency-sensitive and closer to end users/existing metro fiber, keeping legacy hubs (Northern Virginia, major metros) relevant despite their interconnection queues.
- The gap between announced interconnection requests (226 GW in ERCOT) and actual load (5.3 GW) suggests significant speculative/duplicate queue positions — developers and compute buyers should treat headline GW pipeline numbers skeptically and verify actual construction/energization status.
- Water is emerging as a second-order but rising constraint, particularly in water-stressed frontier markets (West Texas, high desert) — closed-loop and dry-cooling designs may become a site-selection differentiator, not just a cooling-technology choice (see [[08-cooling-density]]).
- Regulatory risk is now a live site-selection variable: state-level pauses/audits (Texas) show that even favorable deregulated markets can introduce sudden policy risk, arguing for geographic diversification across states/ISOs.

## Open questions for deep dive
- What specific outcome does the Texas grid-connection audit (initiated August 2026) produce, and does it change ERCOT's "bring your own power" advantage relative to other states?
- How should developers/buyers discount headline interconnection-queue GW figures to estimate realistic financeable/buildable capacity by market (given the 226GW-requested vs 5.3GW-online gap)?
- What is the comparative all-in speed-to-power and total site cost across the emerging hotspots (Ohio, Iowa, PNW, West Texas) versus incumbent hubs (N. Virginia), normalized for latency requirements?

## Cross-links
- Relates to [[06-power-energy]] (power availability is now the primary site-selection filter)
- Relates to [[08-cooling-density]] (water availability for liquid cooling factors into site viability)

## Sources
- [Data Center Sites Unseen: 2026 Buildable Acreage & Capacity Update](https://www.enverus.com/newsroom/data-center-sites-unseen-2026-parcel-update/) — Enverus, 2026
- [Data Center Site Selection: Why Power Defines Where You Can Build](https://www.bloomenergy.com/blog/data-center-site-selection-why-power-defines-where-you-can-build/) — Bloom Energy, 2026
- [Data Center Site Selection Criteria: The 2026 Checklist](https://gridmatch.ai/resources/data-center-site-selection-criteria) — GridMatch, 2026
- [Emerging Markets for Data Center Development in 2026](https://landvalues.acres.com/emerging-markets-data-center-development-2026) — Acres Land Values, 2026
- [The Next Data Center Hotspots: Where Construction Is Heading in 2026](https://www.constructionowners.com/insights/the-next-data-center-hotspots-where-construction-is-heading-as-northern-virginia-hits-its-limits) — Construction Owners, 2026
- [Texas data center hot spots mapped by ERCOT data](https://www.houstonchronicle.com/business/energy/article/ercot-grid-data-centers-22286592.php) — Houston Chronicle, 2026
- [The grid is planning for data centers that will never exist](https://www.paces.com/white-papers/grid-planning-data-centers-transmission-investment) — Paces, 2026 — white paper on queue/reality gap
- [Texas Data Centers: ERCOT Grapples with Feasibility in 2026](https://uticaphoenix.net/texas-data-centers-ercot-grapples-with-feasibility-in-june-2026/) — Utica Phoenix, June 2026
- [The Northern Virginia Data Center Market: A 2026 Overview](https://roctelecom.com/insights/northern-virginia-data-center-market/) — RocTelecom, 2026
- [2026 Data Center Projects Could Add 20GW of New Capacity](https://www.datacenters.com/news/2026-data-center-projects-that-could-add-20-gw-of-new-capacity) — Datacenters.com, 2026
- **Archive-worthy artifacts:** [Paces white paper — Grid planning for data centers](https://www.paces.com/white-papers/grid-planning-data-centers-transmission-investment) — PDF/report on queue-vs-reality
