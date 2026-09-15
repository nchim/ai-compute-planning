# Facility & Hardware Lifecycle (A5)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
AI data centers carry a structural mismatch: the shell/electrical/mechanical infrastructure is built for a 15–30 year useful life, while the GPUs inside it are economically useful for roughly 3–7 years and architecturally refreshed by Nvidia every 18–24 months. Hyperscalers have controversially extended GPU/server depreciation schedules from 3–4 years to 5–6 years (saving an estimated $18B/year in aggregate depreciation expense across Amazon, Google, Microsoft), a move critics call aggressive given the pace of architectural obsolescence; in 2025 this trend diverged, with Amazon shortening useful life for a subset of servers while Meta extended its own further. The secondary GPU market shows real but non-linear depreciation: a two-year-old H100 retains ~61% of original value, dropping sharply to 45–55% by year three (a "mid-life cliff"), with step-change value resets tied to new architecture launches rather than smooth linear decay. Michael Burry has estimated ~$176B in industry-wide understated depreciation. Whether this is a real stranded-asset risk or a manageable mismatch depends heavily on whether GPUs are redeployed down the stack (training → fine-tuning → inference) as they age, extending effective economic life to 5–7+ years per some hyperscaler operational evidence.

## Key findings
- Shell/electrical/mechanical infrastructure useful life: ~15–30 years (standard CRE/DC assumption), vs. GPU/compute hardware useful life of ~3–6 years by architecture cycle, creating a structural mismatch requiring 3–5+ hardware refresh cycles per building lifetime.
- Amazon, Alphabet, and Microsoft all extended official server/GPU useful-life assumptions from 3–4 years to 5–6 years, collectively saving an estimated ~$18B/year in depreciation expense, with disclosed first-year benefits exceeding $10B across the group ([CNBC, Nov 2025](https://www.cnbc.com/2025/11/14/ai-gpu-depreciation-coreweave-nvidia-michael-burry.html); [Footnote Brief](https://footnotebrief.com/hyperscaler-depreciation-ai-capex-circularity/)).
- 2025 divergence: Amazon shortened useful life for a subset of servers while Meta extended its estimate further — signaling the industry has not converged on a standard assumption.
- Nvidia releases new GPU architectures every 18–24 months, in tension with 6-year depreciation schedules; Satya Nadella (Microsoft) explicitly cited not wanting to get "stuck with four or five years of depreciation on one generation" as a reason to favor shorter effective commitment/faster refresh.
- Secondary market: H100 prices stabilized at $18,000–$22,000 in 2026 (down from a $50,000 peak-scarcity price); lightly used (1–2 yr) units trade at 70–85% of new price, moderate use (2–3 yr) at 50–70%, and value drops sharply to 45–55% by the 3-year "mid-life cliff" ([Hashrate Index](https://hashrateindex.com/blog/used-gpu-market-pricing-deprecation-secondary-ai/); [Mercatus](https://www.mercatus-ai.com/blog/h100-depreciation)).
- Depreciation is non-linear — it resets in "step-changes" tied to new architecture launches rather than smooth decay, complicating standard straight-line accounting assumptions.
- Michael Burry has estimated ~$176B in understated depreciation across the AI industry, a stranded-asset/earnings-quality concern actively debated among analysts in 2025–2026.
- Counter-evidence: real-world Azure/CoreWeave/hyperscaler VM retirement data suggests GPUs retain economic value for 5–7+ years when redeployed to inference/fine-tuning workloads, where cost-per-completed-task (not cost-per-hour) is the relevant metric — used A100s reportedly beat newer, pricier hardware on this basis for some workloads.

## Insights & implications (developers / compute buyers)
- For developers: the building's financing (15–30 yr amortization) and the tenant's hardware refresh cycle (3–6 yr) are fundamentally different clocks — lease structures should be explicit about whether/how power density, cooling type (air vs. liquid), and rack layout can be retrofitted for the *next* two or three hardware generations without re-doing shell/electrical work. Design for upgradability (liquid-cooling-ready busway, higher kW/rack headroom) is now a capex decision with real optionality value.
- For compute buyers (AI labs): depreciation-schedule choice (3–4 vs 5–6 years) is a real lever on reported margins/profitability, not just an accounting technicality — buyers evaluating a lab's or neocloud's unit economics should normalize for this assumption before comparing gross margins.
- For compute buyers: a redeployment strategy (moving aging GPUs from training to inference/fine-tuning) can materially extend effective economic life beyond the accounting useful-life assumption — the "waterfall" retirement path matters more than nameplate useful life.
- Stranded-asset risk is concentrated in whoever holds GPU-collateralized debt against fast-depreciating hardware (see [[02-financing]]) — a mismatch between 5-6 year book depreciation and a market where step-change resets can shave 30-40% of value in a single architecture cycle.

## Open questions for deep dive
- Quantify the "waterfall" — what fraction of hyperscaler GPU fleets are actually redeployed training→inference, and what's the effective blended economic life this produces?
- How do liquid-cooling retrofit costs compare to greenfield liquid-cooling build, and does that retrofit gap change the calculus on brownfield vs. new-build for compute buyers?
- What do actual loan covenants on GPU-backed debt (CoreWeave-style) assume for collateral depreciation, and how does that compare to the secondary-market step-change data above?

## Cross-links
- Relates to [[01-lifecycle-pro-forma]] — depreciation assumptions are a direct pro forma opex/margin input.
- Relates to [[02-financing]] — GPU-backed debt collateral value is directly exposed to the depreciation/stranded-asset risk described here.
- Relates to [[03-unit-economics]] — inference workloads' ability to use older/depreciated GPUs profitably changes the effective training-vs-inference cost allocation.

## Sources
- [GPU Depreciation Strategies: Optimizing Asset Lifecycles](https://introl.com/blog/gpu-depreciation-strategies-asset-lifecycle-optimization-guide-2025) — Introl, 2025.
- [The question everyone in AI is asking: How long before a GPU depreciates?](https://www.cnbc.com/2025/11/14/ai-gpu-depreciation-coreweave-nvidia-michael-burry.html) — CNBC, Nov 14 2025 — Burry $176B estimate, hyperscaler useful-life extension.
- [Depreciation of GPUs: between useful lives and useful myths](https://deepquarry.substack.com/p/depreciation-of-gpus-between-useful) — Deep Quarry, 2025/2026.
- [298 | Breaking Analysis: Resetting GPU Depreciation](https://thecuberesearch.com/298-breaking-analysis-resetting-gpu-depreciation-why-ai-factories-bend-but-dont-break-useful-life-assumptions/) — theCUBE Research.
- [The $200 Billion Question Hiding in Big Tech's AI Spending](https://footnotebrief.com/hyperscaler-depreciation-ai-capex-circularity/) — Footnote Brief — $18B/yr depreciation savings estimate.
- [Are AI Chip "Useful Lives" Creating Useless Earnings?](https://www.levelheadedinvesting.com/p/are-ai-chips-useful-lives-creating-useless-earnings) — Level Headed Investing.
- [Used GPU Market: A100 & H100 Pricing, Depreciation](https://hashrateindex.com/blog/used-gpu-market-pricing-deprecation-secondary-ai/) — Hashrate Index — secondary market pricing detail.
- [H100 Depreciation: How Fast NVIDIA H100s Lose Value](https://www.mercatus-ai.com/blog/h100-depreciation) — Mercatus, 2026 — "mid-life cliff" data.
- [GPU Depreciation in 2026: What a Used GPU Is Worth](https://aethir.com/blog-posts/gpu-depreciation-in-2026-what-a-used-gpu-is-worth) — Aethir, 2026.
- **Archive-worthy artifacts:** none identified this pass (depreciation figures are drawn from blog/analyst commentary, not primary 10-K filings — a deep dive should pull the actual Microsoft/Google/Meta/Amazon 10-K useful-life disclosures directly).
