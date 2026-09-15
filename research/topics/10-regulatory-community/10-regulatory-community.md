# Regulatory, Permitting & Community (10)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
By September 2026, data center permitting has shifted from a purely local nuisance-zoning fight into a state-level policy battle: New York enacted a one-year moratorium (executive order, July 14, 2026) on discretionary environmental permits for facilities drawing >50MW, Texas Governor Abbott ordered a statewide audit/pause on new grid connections (August 2026), and moratorium bills are active in Georgia, Maryland, Minnesota, Oklahoma, and South Dakota. At least 100 local moratoriums have been adopted nationwide, and public opposition is unusually broad — a March 2026 Gallup poll found 71% of Americans oppose a data center near them, higher than opposition to a nearby nuclear plant. Loudoun County, VA (the largest US data-center market) eliminated by-right development in March 2025 and is now in "Phase 2" rulemaking (open houses Sept 28/30, 2026) on noise, onsite generation, and siting standards, with new ordinance amendments not expected until spring/summer 2027. Grid interconnection has become the binding constraint independent of zoning: the US interconnection queue backlog is ~2,600 GW, PJM waits for large Northern Virginia campuses approach 7 years, and ERCOT's queue (474 GW, 90% data centers) triggered Texas's own pause. Rising capacity costs are increasingly politically salient — PJM's 2025-26 capacity auction cost increase of $9.3B, partly attributed to data center load growth, is translating into visible residential bill increases ($16-18/month in Ohio and Maryland), fueling further backlash.

## Key findings
- New York: Responsible Data Center Development Act passed the legislature June 4, 2026; Gov. Hochul instead signed a narrower Executive Order (July 14, 2026) creating a **one-year moratorium** on discretionary environmental permitting for data centers >50MW ([Good Jobs First](https://goodjobsfirst.org/data-center-moratorium-bills-are-spreading-in-2026/), [Columbia Climate Law Blog](https://blogs.law.columbia.edu/climatechange/2026/05/27/local-moratoria-considerations/))
- Texas: Gov. Abbott ordered a comprehensive audit of all data centers connecting to the ERCOT grid (August 2026), effectively pausing new interconnections pending review ([MultiState](https://www.multistate.us/insider/2026/8/19/the-local-fight-over-data-centers-a-texas-case-study))
- At least **100 local moratoriums** adopted across the US as of 2026; state moratorium bills active in Georgia (until March 1, 2027), Oklahoma (until November 1, 2029), Maryland, Minnesota, South Dakota ([Good Jobs First](https://goodjobsfirst.org/data-center-moratorium-bills-are-spreading-in-2026/))
- Lysander, NY (near Syracuse): 6-month local moratorium approved May 7, 2026 after 350+ residents opposed a proposed 300MW data center ([Rockefeller Institute](https://www.rockinst.org/blog/updates-on-the-cloud-more-moratoriums-on-data-centers/))
- **71% of Americans oppose a data center being built near them** (Gallup, March 2026) — higher opposition than to a nearby nuclear plant ([search synthesis, no single primary link captured — verify via Gallup.com in deep dive])
- US interconnection queue backlog: **~2,600 GW**; median project wait to commercial operation approaching 5 years, with data centers facing delays up to 12 years in some regions; PJM waits near **7 years** for large Northern Virginia AI campuses ([ATK Energy](https://atkenergygroup.com/blog/grid-interconnection-data-centers/), [Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/))
- ERCOT interconnection queue: **474 GW, ~90% data centers** ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/))
- PJM data-center-driven capacity cost increase: **$9.3B** in the 2025-26 delivery year, ~**$16-18/month** added to residential bills in Ohio and Maryland ([Verse](https://verse.inc/blog/the-data-center-power-queue-crisis))
- Nearly **80% of queued interconnection projects withdraw**, mainly due to multi-year delay and high grid-upgrade cost ([Enkiai](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/))
- Loudoun County, VA: eliminated by-right data center development in industrial/mineral-resource zones (ordinance approved March 18, 2025, Special Exception now required); noise limit at residential property line is 55 dBA, though officials acknowledge this doesn't capture the "tonal hum" residents complain about most; Phase 2 rulemaking (onsite generation, energy storage, noise, parking standards) has open houses Sept 28 & 30, 2026, with amendments expected spring/summer 2027 ([Loudoun County](https://www.loudoun.gov/datacenterstandards), [Holland & Knight](https://www.hklaw.com/en/insights/publications/2025/04/loudoun-county-virginia-eliminates-by-right-data-center-development), [Virginia Mercury](https://virginiamercury.com/2026/07/30/loudoun-county-other-virginia-localities-consider-hitting-the-brakes-on-data-center-development/))

## Insights & implications (developers / compute buyers)
- Permitting risk has moved up a level of government: developers can no longer solve for a friendly county and ignore state politics — NY and TX show governors/legislatures now willing to freeze entire pipelines regardless of local zoning approval.
- Interconnection timeline, not entitlement, is now the true critical path for most large campuses (5-7+ years in PJM/ERCOT); site selection strategy should weight utility queue position and transmission headroom above zoning speed.
- The ~80% queue withdrawal rate means published "GW in queue" figures dramatically overstate near-term deliverable capacity — compute buyers negotiating power-backed deals should discount queue-stage projects heavily.
- Ratepayer bill impact is becoming a first-order political variable; developers increasingly need to structure deals (e.g., large-load tariffs, dedicated generation, minimum-take contracts) that visibly shield ratepayers to preserve social license, not just optimize for lowest-cost power.
- Noise/EMF/aesthetic complaints (Loudoun's "tonal hum" problem) are prompting standard-setting that could raise both mitigation capex and siting setback requirements — worth tracking Loudoun Phase 2 outcomes (spring/summer 2027) as a bellwether for other jurisdictions.

## Open questions for deep dive
- What is the actual disposition/success rate of the ~100 local moratoriums — how many convert to permanent bans vs. lapse after a study period?
- How are large-load tariffs and "bring your own generation" requirements (Texas, PJM territory) being structured to shift interconnection/upgrade cost risk from ratepayers to developers?
- What does Loudoun County's Phase 2 zoning outcome (due spring/summer 2027) look like in draft, and how might it become a template nationally?

## Cross-links
- Relates to [[12-sustainability]] (water/noise/grid impacts driving much of the community opposition and moratorium activity)
- Relates to [[11-sovereignty-geopolitics]] (US regulatory friction is one factor pushing some capacity/capital toward Gulf and other jurisdictions with faster permitting)

## Sources
- [Updates on the Cloud: More Moratoriums on Data Centers](https://www.rockinst.org/blog/updates-on-the-cloud-more-moratoriums-on-data-centers/) — Rockefeller Institute of Government, 2026
- [Local Moratoria Against Data Center Construction](https://blogs.law.columbia.edu/climatechange/2026/05/27/local-moratoria-considerations/) — Columbia Climate Law Blog, May 27, 2026
- [Data Center Moratorium Bills Are Spreading in 2026](https://goodjobsfirst.org/data-center-moratorium-bills-are-spreading-in-2026/) — Good Jobs First, 2026
- [Texas Data Center Moratorium: Local Regulation & State Action](https://www.multistate.us/insider/2026/8/19/the-local-fight-over-data-centers-a-texas-case-study) — MultiState, August 19, 2026
- [Using Temporary Pauses to Develop Permanent Regulation](https://www.wilmerhale.com/en/insights/client-alerts/using-temporary-pauses-to-develop-permanent-regulation) — WilmerHale
- [Data Center Moratoriums](https://www.datacenterbans.com/) — tracker site
- [Data Center Moratoriums in 2026: What the Policy Shift Means for Developers](https://build.inc/insights/data-center-moratoriums-2026-policy-developers) — Build.inc
- [Grid Interconnection Delays 2026: A Threat to US Energy](https://enkiai.com/ai-market-intelligence/grid-interconnection-delays-2026-a-threat-to-us-energy/) — Enkiai, 2026
- [Data Center Interconnection Queue: Wait Times, Backlogs & Grid Impact](https://www.electricchoice.com/datacenters/interconnection-queue/) — Electric Choice
- [The Data Center Power Queue Crisis](https://verse.inc/blog/the-data-center-power-queue-crisis) — Verse Inc
- [Grid Interconnection for Data Centers in 2026](https://atkenergygroup.com/blog/grid-interconnection-data-centers/) — ATK Energy
- [Data Centers: Noise & Air Quality Concerns](https://www.loudoun.gov/6405/Noise-Air-Quality-Concerns) — Loudoun County, VA
- [Data Center Standards & Locations](https://www.loudoun.gov/datacenterstandards) — Loudoun County, VA
- [Loudoun County, other Virginia localities consider hitting the brakes](https://virginiamercury.com/2026/07/30/loudoun-county-other-virginia-localities-consider-hitting-the-brakes-on-data-center-development/) — Virginia Mercury, July 30, 2026
- [Loudoun County, Virginia, Eliminates By-Right Data Center Development](https://www.hklaw.com/en/insights/publications/2025/04/loudoun-county-virginia-eliminates-by-right-data-center-development) — Holland & Knight, April 2025
- **Archive-worthy artifacts:** none identified in this pass (Gallup poll underlying data and PJM 2025-26 capacity auction results worth pulling as primary docs in deep dive)
