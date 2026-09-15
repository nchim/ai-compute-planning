# Research Topic Taxonomy

Master list of topics. Each has a set of guiding questions the topic file should answer.
I've expanded on the user's original prompts and grouped them into clusters. This list is
expected to evolve — consolidate or split as concepts emerge.

---

## Cluster A — Development lifecycle & economics

### A1. DC development lifecycle & pro forma anatomy
- What are the phases of an AI DC project (site → power → shell → fit-out → commissioning)?
- What does a real pro forma look like? Line items for capex ($/MW, $/kW), opex, revenue.
- How does this map to / differ from commercial real estate development lifecycles?
- Lease vs. own; build-to-suit vs. speculative; colocation vs. self-build.
- **Find actual example pro formas, cost models, spreadsheets.**

### A2. Capital stack & financing models  — ⬇️ DEPRIORITIZED (second wave, light touch)
- Hyperscaler capex (self-funded) vs. neoclouds vs. colo/REIT vs. SPV/project finance.
- Debt structures, GPU-backed lending, lease financing, off-balance-sheet vehicles.
- Who bears which risks (tenant credit, technology obsolescence, power price)?
- Return metrics investors underwrite to (yield-on-cost, IRR, stabilized cap rate analog).

### A3. Unit economics: training vs. inference
- How do the two workloads differ economically (capex intensity, utilization, locality)?
- Cost to train a frontier model; cost per token / per query for inference.
- "Tokenomics": gross margins on inference, pricing vs. cost curves.
- How workload mix shifts DC design and location decisions.

### A4. Deployment velocity & critical-path constraints ("why not 30 days?")
- What actually gates buildout speed — why does standing up a new DC take 2–5+ years, not 30 days?
- Critical path: power (interconnection queues, substation/transformer lead times), long-lead
  equipment (generators, switchgear, chillers, transformers), permitting, GPU allocation,
  construction labor, commissioning.
- Which steps are parallelizable vs. serial; which are the true bottlenecks by region.
- "Speed-to-power" tactics: brownfield/retrofit, behind-the-meter gas, modular/prefab builds,
  securing land+power options early, powered-shell strategies.
- How this differs for retrofits, colo lease-up, and greenfield.

### A5. Facility & hardware lifecycle: useful life, amortization, upgradability
- Useful life of the facility shell/electrical/mechanical (often 15–30 yr) vs. compute hardware
  (often 3–6 yr) — the core mismatch and its economic consequences.
- GPU/accelerator amortization & depreciation schedules; obsolescence risk; residual value and
  secondary markets; how depreciation assumptions swing reported margins.
- Flexibility & upgradability: designing shells/power/cooling to absorb rising rack densities and
  new architectures (air→liquid retrofit, higher kW/rack, changing network topologies).
- Stranded-asset risk: facilities built for one generation of hardware that can't host the next.
- Refresh cycles and how they interact with lease terms and financing.

## Cluster B — Physical constraints

### B1. Power & energy (the binding constraint)
- Grid interconnection queues, timelines, capacity availability by region.
- PPAs, behind-the-meter generation, on-site gas, nuclear/SMR, renewables + storage.
- $/MWh economics, power as % of TCO, stranded-power and speed-to-power strategies.

### B2. Compute hardware supply chain
- GPU/accelerator supply (NVIDIA, AMD, custom ASICs), HBM, CoWoS packaging, TSMC.
- Allocation dynamics, lead times, pricing, and how they gate buildout.
- Networking (InfiniBand/Ethernet, optics), the rack as the unit of design.

### B3. Cooling, density & facility design
- Air vs. liquid vs. immersion cooling; rack densities (kW/rack) trajectory.
- How density/cooling drive capex and site requirements; retrofit vs. greenfield.

### B4. Site selection (land, water, fiber, latency)
- What makes a good site; the "power–land–fiber–water" quadrilateral.
- Latency sensitivity: training (latency-tolerant) vs. inference (latency-sensitive).
- Regional hotspots (N. Virginia, Texas, PNW, Nordics, Middle East, etc.).

## Cluster C — External environment

### C1. Regulatory, permitting & community
- Permitting timelines, zoning, interconnection approval, environmental review.
- Community opposition (noise, water, power price impacts), moratoriums.

### C2. Sovereignty, geopolitics & export controls
- Sovereign AI / national compute strategies; data residency.
- US export controls on chips; where capital & capacity are flowing (Gulf states, etc.).

### C3. Sustainability (water, carbon, grid impact)
- Water usage (WUE), carbon (24/7 CFE), impact on ratepayers and grid reliability.

## Cluster D — Market & strategy

### D1. Market structure & key players
- Hyperscalers, neoclouds (CoreWeave, Crusoe, Lambda, Nebius), colo/REITs (Equinix,
  Digital Realty, QTS, Vantage), developers, chipmakers, AI labs.
- Who plays which role; vertical integration trends.

### D2. Speed-to-market economics for AI labs
- Consequences of being fast vs. slow to compute for a frontier lab.
- Compute as competitive moat; scaling-law-driven demand; pre-commitment behavior.

### D3. Demand forecasting, overbuild & bubble risk
- Demand projections (MW, $) and their assumptions; circular-financing concerns.
- GPU depreciation schedules & obsolescence risk; utilization risk; overbuild scenarios.

## Cluster E — Frontier & alternatives

### E1. Innovation frontier
- Custom silicon, optical interconnect/co-packaged optics, networking, DC design,
  efficiency gains, algorithmic efficiency — what will "move the needle."

### E2. Competing deployment models
- Distributed/decentralized training, edge inference, enterprise on-prem, personal AI
  devices (NPUs). Could these cap demand for centralized DCs? Under what conditions?

## Cluster F — Cross-cutting

### F1. KPI glossary & benchmarks
- PUE, WUE, $/MW, $/kW, cost per token, MFU/utilization, tokens/sec/GPU, yield-on-cost,
  power density, and benchmark ranges for each.
