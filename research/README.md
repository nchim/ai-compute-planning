# AI Data Center Economics — Research Workspace

Research effort to understand the economics of AI data center development, with the eventual
goal of building tools to support the development process. We ground everything in web research
and keep references to sources.

## How this is organized

- `00-topic-taxonomy.md` — the master list of research topics, sub-questions, and status.
- `topics/NN-<slug>/` — **one folder per topic.** Inside each:
  - `NN-<slug>.md` — the summary (summary, key findings, insights, open questions, sources).
  - any supporting documents for that topic (PDFs, spreadsheets, decks) live in the same folder.
- `sources/` — master source log (`README.md`) indexing artifacts; per-topic files live in the
  topic folders, cross-cutting artifacts can live here.

## Scope (locked 2026-09-15)

- **Geography:** US-primary, with global context (Gulf sovereign AI, Europe/Nordics, Asia) as
  contrast rather than equal depth.
- **Primary lens:** the eventual tools serve **DC developers/operators (build side)** and
  **AI labs / compute buyers (demand side)**. Investor/underwriting angle is secondary — cover
  it where it intersects those two, but don't center it.
- **Depth:** shallow survey pass first (quota-conscious), then targeted deep dives.

## Method

1. **Shallow pass first** (5–10 min per topic) to survey the landscape and preserve web-search
   quota. Fan out across topics in parallel using sonnet subagents.
2. **Deep dives** on the topics that prove most decision-relevant, once we know where the
   substance is.
3. Consolidate continuously as subagent findings stream in; redirect subagents as gaps appear.

## Topic status legend

- ⬜ Not started  ·  🟡 Shallow pass in progress  ·  🟢 Shallow pass done  ·  🔵 Deep dive done

## Status board

| # | Topic | Status |
|---|-------|--------|
| A1 | DC development lifecycle & pro forma anatomy | 🔵 |
| A2 | Capital stack & financing models ⬇️ *(deprioritized)* | 🟢 *(stub)* |
| A3 | Unit economics: training vs. inference | 🟢 |
| A4 | Deployment velocity & critical-path constraints | 🟢 |
| A5 | Facility & hardware lifecycle: useful life, amortization, upgradability | 🔵 |
| B1 | Power & energy — the binding constraint | 🔵 |
| B2 | Compute hardware supply chain | 🟢 |
| B3 | Cooling, density & facility design | 🟢 |
| B4 | Site selection (land, water, fiber, latency) | 🔵 |
| C1 | Regulatory, permitting & community | 🟢 |
| C2 | Sovereignty, geopolitics & export controls | 🟢 |
| C3 | Sustainability (water, carbon, grid impact) | 🟢 |
| D1 | Market structure & key players | 🟢 |
| D2 | Speed-to-market economics for AI labs | 🔵 |
| D3 | Demand forecasting, overbuild & bubble risk | 🔵 |
| E1 | Innovation frontier (silicon, interconnect, design) | 🟢 |
| E2 | Competing deployment models | 🟢 |
| F1 | KPI glossary & benchmarks (cross-cutting) | 🟢 |
