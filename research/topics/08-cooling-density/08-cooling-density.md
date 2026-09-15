# Cooling, Density & Facility Design (B3)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
Rack power density has roughly tripled in two generations — from ~40kW/rack (H100 air-cooled) to 120kW/rack (GB200 NVL72, liquid-cooled) — and NVIDIA's Vera Rubin NVL144 platform is targeting ~600kW/rack by 2026-2027, forcing a wholesale shift from air to liquid cooling across new hyperscale/AI capacity. Air cooling tops out around 30-40kW/rack even with optimization; direct-to-chip liquid cooling extends the ceiling to 60-120kW; anything beyond effectively requires liquid cooling as the primary heat-rejection method, with immersion cooling as an emerging option for the highest densities. Liquid cooling adoption has reached ~22% of data centers, with direct-to-chip taking ~47% share of that liquid-cooled subset. This density trajectory is a major driver of both capex (cooling loops, CDUs, plumbing) and the retrofit-vs-greenfield decision, since most existing air-cooled colocation shells cannot economically support >100kW/rack without substantial retrofit.

## Key findings
- H100-generation air-cooled racks: ~40kW/rack typical; general-purpose CPU racks: up to ~12kW/rack ([Introl](https://introl.com/blog/building-100kw-gpu-racks-power-cooling-architecture)).
- NVIDIA GB200 NVL72: ~120kW per rack, requiring direct liquid cooling ([Introl](https://introl.com/blog/gb200-nvl72-deployment-72-gpu-liquid-cooled); [NVIDIA](https://www.nvidia.com/en-us/data-center/gb200-nvl72/)).
- Vera Rubin NVL144 (targeted ~2026-2027): ~600kW/rack, 144 GPUs, 8 exaflops per rack ([Spheron/IntuitionLabs coverage](https://intuitionlabs.ai/articles/nvidia-hgx-data-center-requirements)).
- Air cooling ceiling: 30-40kW/rack with optimized design; direct-to-chip liquid cooling extends range to 60-120kW/rack ([ToneCooling](https://tonecooling.com/nvidia-gb200-nvl72-cooling-requirements/)).
- Rack densities broadly have climbed from ~40kW to ~130kW industry-wide, with projections of ~250kW by 2030 ([industry aggregation via search](https://introl.com/blog/building-100kw-gpu-racks-power-cooling-architecture)).
- Liquid cooling adoption: ~22% of data centers overall; within liquid-cooled deployments, direct-to-chip holds ~47% market share (vs. rear-door heat exchangers, immersion, etc.) ([search aggregation, 2026](https://introl.com/blog/building-100kw-gpu-racks-power-cooling-architecture)).
- Modern AI-driven environments now commonly exceed 30kW/rack even outside frontier deployments, pushing routine facility design past legacy air-cooling norms ([techplustrends](https://techplustrends.com/power-requirements-ai-data-centers/)).

## Insights & implications (developers / compute buyers)
- Facility design must now be specified per hardware generation, not once: a shell built for 40kW/rack air cooling is stranded within 1-2 GPU generations; developers are increasingly designing for 200kW+/rack "future-proofed" liquid infrastructure even if the first tenant only needs 120kW.
- The retrofit-vs-greenfield calculus is shifting toward greenfield for frontier AI training clusters (custom power/cooling from slab-up) while retrofit remains viable mainly for lower-density inference or legacy enterprise workloads.
- CDU (coolant distribution unit) and facility water-loop capacity are becoming as much a procurement bottleneck as chip supply — plan cooling infrastructure lead times alongside GPU allocation timelines (see [[07-hardware-supply-chain]]).
- Rising density directly increases per-site power draw, compounding interconnection sizing and speed-to-power pressure (see [[06-power-energy]]) — density and power-constraint strategy must be co-designed, not solved independently.
- Compute buyers evaluating colocation/neocloud partners should ask specifically what kW/rack and cooling topology (direct-to-chip vs immersion vs rear-door) a facility supports, since this gates which GPU generations can be hosted at all.

## Open questions for deep dive
- What is the realistic cost delta ($/kW or $/rack) between direct-to-chip liquid cooling and immersion cooling at 300-600kW/rack densities, and which is winning new greenfield builds?
- How many existing hyperscale/colo campuses (by GW of capacity) are physically capable of retrofit to >100kW/rack liquid cooling versus needing full rebuild?
- What water-usage and water-rights constraints does the liquid-cooling shift introduce at scale (especially in water-stressed hotspots like West Texas), and how are operators mitigating (closed-loop, dry cooling)?

## Cross-links
- Relates to [[06-power-energy]] (density growth increases per-site power draw and interconnection sizing)
- Relates to [[07-hardware-supply-chain]] (the rack, not the chip, is the shared unit of design between hardware and facility)
- Relates to [[09-site-selection]] (water availability for liquid cooling is part of the site-selection quadrilateral)

## Sources
- [Building 100kW+ GPU Racks](https://introl.com/blog/building-100kw-gpu-racks-power-cooling-architecture) — Introl, 2026
- [GB200 NVL72 Deployment](https://introl.com/blog/gb200-nvl72-deployment-72-gpu-liquid-cooled) — Introl, 2026
- [NVIDIA HGX Platform: Data Center Physical Requirements Guide](https://intuitionlabs.ai/articles/nvidia-hgx-data-center-requirements) — IntuitionLabs, 2026
- [GB200 NVL72](https://www.nvidia.com/en-us/data-center/gb200-nvl72/) — NVIDIA product page
- [NVIDIA GB200 Superchip Guide: Liquid-Cooled Racks and Servers](https://www.fibermall.com/blog/nvidia-gb200-superchip.htm) — FiberMall, 2026
- [Nvidia Blackwell Explained: Data Center Impact](https://www.moduledge.com/blog/nvidia-blackwell) — ModulEdge, 2026
- [NVIDIA GB200 NVL72 Cooling Requirements](https://tonecooling.com/nvidia-gb200-nvl72-cooling-requirements/) — ToneCooling, 2026
- [GB200 NVL72: Rack Specs and Cloud Pricing](https://www.spheron.network/blog/nvidia-gb200-nvl72-guide/) — Spheron, 2026
