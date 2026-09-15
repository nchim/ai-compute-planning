# Compute Hardware Supply Chain (B2)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
Advanced packaging (CoWoS) and HBM remain the tightest links in the AI hardware supply chain in 2026, more binding than raw wafer starts. CoWoS lead times now exceed 12 months and the process is oversubscribed through at least 2026-2027; HBM (including HBM3E/HBM4) is fully allocated, with Micron able to meet only 55-60% of core customer demand and HBM pricing up ~20% for 2026 contracts. NVIDIA has secured roughly 60% of TSMC's 2026 CoWoS capacity and priority allocation across all three HBM suppliers, structurally squeezing AMD, custom ASIC programs, and smaller buyers. On the networking side, Ethernet has overtaken InfiniBand for AI back-end fabrics (about two-thirds share by early 2026) though InfiniBand persists as the latency-optimized choice for tightly-coupled training; the rack (e.g., NVIDIA GB200 NVL72) is now the true unit of design and deployment, not the individual server or chip.

## Key findings
- CoWoS packaging lead times exceed 12 months (up from 52-78 weeks reported earlier in the cycle); CoWoS is oversubscribed through at least 2026 ([Silicon Analysts](https://siliconanalysts.com/newsletter/qual-watch/2026-08-25)).
- NVIDIA holds an estimated ~60% (~595k wafers) of TSMC's 2026 CoWoS capacity and has booked more than half of TSMC's 2026-2027 CoWoS expansion ([Value Add VC](https://valueaddvc.com/blog/ai-chip-supply-ranked-2026-nvidia-amd-broadcom-tsmc-and-whos-actually-unconstrained)).
- HBM supply (including HBM3E) is fully allocated through 2026; Micron can meet only 55-60% of core customer demand; Samsung/SK Hynix raised HBM3E contract prices ~20% for 2026 ([Fusion WW](https://info.fusionww.com/blog/inside-the-ai-bottleneck-cowos-hbm-and-2-3nm-capacity-constraints-through-2027)).
- NVIDIA has priority allocation from all three HBM suppliers (SK Hynix, Samsung, Micron) ([Value Add VC](https://valueaddvc.com/blog/ai-chip-supply-ranked-2026-nvidia-amd-broadcom-tsmc-and-whos-actually-unconstrained)).
- Analysts expect the CoWoS supply-demand gap to narrow from ~20% to ~10% by end of 2026, with the Rubin platform absorbing much of the new capacity; further headroom expected in 2027 from TSMC CoWoS expansion, Samsung HBM4 ramp, and alternative packaging at ASE/Amkor ([Fusion WW](https://info.fusionww.com/blog/inside-the-ai-bottleneck-cowos-hbm-and-2-3nm-capacity-constraints-through-2027)).
- HBM4 began volume shipping in 2026 alongside continued CoWoS tightness ([Silicon Analysts](https://siliconanalysts.com/newsletter/qual-watch/2026-08-25)).
- Networking: Ethernet reached ~two-thirds share of AI back-end switching by early 2026, up from InfiniBand's ~80% share in late 2023; hybrid deployments are common — InfiniBand for training, Ethernet for inference/general infrastructure ([Introl](https://introl.com/blog/infiniband-vs-ethernet-gpu-clusters-800g-architecture)).
- Training fabrics commonly use 400G/800G optics on InfiniBand or RoCEv2; 1.6T optics are entering roadmaps for 2026-2027 ([LINK-PP](https://www.l-p.com/blog/knowledge-center/ai-cluster-networking-architecture-rdma-and-optics.htm)).
- Typical rack-scale cabling mix: ~70% DAC (direct-attach copper, ≤3m, GPU-to-ToR) and ~30% AOC (active optical, cross-aisle) in tier 2/3 deployments, balancing cost against reach ([Introl](https://introl.com/blog/infiniband-vs-ethernet-gpu-clusters-800g-architecture)).

## Insights & implications (developers / compute buyers)
- Hardware allocation, not chip design, is now a major competitive moat: NVIDIA's CoWoS/HBM lock-in structurally disadvantages AMD and custom-silicon (ASIC) programs trying to scale in 2026, which affects which compute buyers can diversify away from NVIDIA and on what timeline.
- Facility/rack design must be procured 12+ months ahead of hardware delivery given CoWoS/HBM lead times — power, cooling, and networking build-out schedules need to anchor off chip allocation dates, not the other way around.
- The rack (e.g., GB200 NVL72, future Vera Rubin NVL144) has become the atomic unit of both hardware deployment and facility design (power delivery, cooling loops, cabling) — see [[08-cooling-density]].
- Networking fabric choice (Ethernet vs InfiniBand) is now a real architectural decision point with cost/vendor-lock-in implications, not just a technical footnote; buyers running mixed training/inference fleets should expect hybrid fabrics.
- Given persistent shortages, secondary/alternative packaging (ASE, Amkor) and multi-sourcing HBM should be tracked as a release-valve indicator for when the constraint eases.

## Open questions for deep dive
- How much of the CoWoS/HBM constraint is expected to ease by 2027, and what specific capacity additions (TSMC CoWoS-L, Samsung HBM4) are the leading indicators to watch?
- What is AMD's and the hyperscaler custom-ASIC (Trainium, TPU, MTIA, etc.) share of constrained packaging/HBM capacity, and how is that shifting the buyer landscape?
- What is the realistic 2026-2027 timeline and cost delta for 1.6T optics adoption, and how does it change cluster-scale network topology/cost?

## Cross-links
- Relates to [[06-power-energy]] (hardware delivery timelines must sync with power-on dates)
- Relates to [[08-cooling-density]] (the rack is the shared unit of design across hardware and facility)

## Sources
- [Why GPU and HBM Supply Is Still Broken in 2026 — CoWoS, 2nm, and What's Next](https://info.fusionww.com/blog/inside-the-ai-bottleneck-cowos-hbm-and-2-3nm-capacity-constraints-through-2027) — Fusion WW, 2026
- [GPU Shortage 2026: How to Secure AI Compute When GPUs Are Sold Out](https://www.spheron.network/blog/gpu-shortage-2026/) — Spheron, 2026
- [TSMC Foundry Allocation 2026: CoWoS Sold Out, 2nm Booked](https://siliconanalysts.com/analysis/foundry-allocation-status-q1-2026) — Silicon Analysts, Q1 2026
- [AI Chip Supply Ranked 2026: Nvidia, AMD, Broadcom, TSMC Availability](https://valueaddvc.com/blog/ai-chip-supply-ranked-2026-nvidia-amd-broadcom-tsmc-and-whos-actually-unconstrained) — Value Add VC, 2026
- [HBM4 volume shipping; CoWoS lead times stretch past 12 months](https://siliconanalysts.com/newsletter/qual-watch/2026-08-25) — Silicon Analysts, Aug 25 2026
- [NVIDIA CORP - Form 10-K - FY2026](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm) — SEC EDGAR
- [InfiniBand vs Ethernet for GPU Clusters](https://introl.com/blog/infiniband-vs-ethernet-gpu-clusters-800g-architecture) — Introl, 2026
- [AI Cluster Networking: Architecture, RDMA, and Optics Guide](https://www.l-p.com/blog/knowledge-center/ai-cluster-networking-architecture-rdma-and-optics.htm) — LINK-PP, 2026
- [GB200 Hardware Architecture - Component Supply Chain & BOM](https://newsletter.semianalysis.com/p/gb200-hardware-architecture-and-component) — SemiAnalysis
- **Archive-worthy artifacts:** [NVIDIA FY2026 10-K](https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm) and [10-Q](https://www.sec.gov/Archives/edgar/data/0001045810/000104581026000052/nvda-20260426.htm) — SEC filings, supply/allocation risk disclosures
