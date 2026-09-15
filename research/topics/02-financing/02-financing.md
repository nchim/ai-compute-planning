# Financing Models (A2) — STUB (deprioritized)

**Status:** 🟡 Stub only — 2026-09-15 — deprioritized per scope, deferred to a later wave
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
This topic is deliberately under-researched in this pass (≤1 search budget). Listing the main financing archetypes seen in circulation for AI data center capex as of September 2026, for later deep-dive triage.

## Key findings (bullets only)
- **Hyperscaler self-fund** — Microsoft, Google, Meta, Amazon historically funded DC capex from balance sheet/operating cash flow; now increasingly supplementing with debt (corporate bonds, CMBS, sale-leasebacks) as capex scales beyond free cash flow ([Ropes & Gray, 2026](https://www.ropesgray.com/en/insights/viewpoints/102mvfl/data-center-investment-in-2026-ai-demand-power-constraints-and-private-equity)).
- **Neoclouds (GPU-as-a-Service)** — CoreWeave-style operators finance via GPU-collateralized debt and single-purpose entities ring-fencing GPUs + customer contracts; harder to underwrite than hyperscaler credit, generally need hyperscaler offtake to raise debt ([SemiAnalysis, Nvidia GPU Debt Backstop](https://newsletter.semianalysis.com/p/nvidia-gpu-debt-backstop-unleashes)).
- **Colo/REIT** — traditional colocation real estate investment trust structures (Digital Realty, Equinix-style), lease-based revenue, publicly traded equity + investment-grade debt.
- **SPV / project finance (off-balance-sheet JV)** — e.g., Meta–Blue Owl Capital "Hyperion" SPV, ~$27B total development cost + $2.5B equity, arranged by Morgan Stanley, keeps debt off Meta's parent balance sheet.
- **GPU-backed debt / private credit** — Morgan Stanley estimates ~$800B of private credit capital needed 2025–2028 for AI data centers, power, and fiber build-out ([Cleary Gottlieb](https://www.clearygottlieb.com/news-and-insights/publication-listing/financing-the-data-center-boom)).

## Open questions for deep dive
- Full capital-stack breakdown (equity/mezz/senior debt %) for a representative SPV deal like Hyperion.
- How lease/offtake contract terms (hyperscaler credit backstop) determine neocloud debt terms.
- Litigation/accounting risk flagged by Quinn Emanuel re: circular financing arrangements (Nvidia-CoreWeave-Nebius style).

## Cross-links
- Relates to [[01-lifecycle-pro-forma]] for how SPV structures change what appears on a developer's own pro forma.
- Relates to [[05-facility-lifecycle]] for GPU-backed debt collateral risk tied to depreciation/residual value assumptions.

## Sources
- [Data Center Investment in 2026](https://www.ropesgray.com/en/insights/viewpoints/102mvfl/data-center-investment-in-2026-ai-demand-power-constraints-and-private-equity) — Ropes & Gray, 2026.
- [Neocloud Capital Raise (2026)](https://www.peony.ink/blog/neocloud-capital-raise) — Peony, 2026.
- [Nvidia GPU Debt Backstop Unleashes the AI Project Trinity](https://newsletter.semianalysis.com/p/nvidia-gpu-debt-backstop-unleashes) — SemiAnalysis, 2026.
- [An Introduction to US Data Center Financing Structures](https://www.afslaw.com/perspectives/alerts/introduction-us-data-center-financing-structures-ai-infrastructure-development) — ArentFox Schiff.
- [Financing the Data Center Boom](https://www.clearygottlieb.com/news-and-insights/publication-listing/financing-the-data-center-boom) — Cleary Gottlieb — $800B private credit estimate 2025–2028.
- [Client Alert: Emerging Litigation Risks in Financing AI Data Centers Boom](https://www.quinnemanuel.com/the-firm/publications/client-alert-emerging-litigation-risks-in-financing-ai-data-centers-boom/) — Quinn Emanuel.
- **Archive-worthy artifacts:** none identified this pass.
