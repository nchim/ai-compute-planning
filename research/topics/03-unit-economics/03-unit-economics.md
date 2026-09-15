# Unit Economics: Training vs. Inference (A3)

**Status:** 🟢 Shallow pass — 2026-09-15
**Scope:** US-primary; lens = DC developer/operator + AI-lab compute buyer

## Summary
Training and inference are economically distinct workloads that pull data center design in different directions. Training is capex-intensive, batch-oriented, tolerant of higher latency/lower uptime SLAs, and increasingly power- and grid-constrained rather than chip-constrained — favoring huge, remote, single-tenant campuses. Inference is opex-like at the margin (cost scales with usage), latency-sensitive, and benefits from proximity to end users and elastic/multi-tenant infrastructure — favoring smaller, distributed, metro-adjacent footprints. As of September 2026, frontier training runs cost $200M–$500M (GPT-5/Gemini-Ultra class), projected toward $1–3B by 2027, with compute consuming 65–75% of the total. Inference pricing has collapsed for GPT-4-class capability (from ~$30/M tokens in early 2023 to under $1/M tokens in 2026) even as frontier reasoning-model tokens still command $15–25/M output tokens. Gross margins vary enormously by lab and model mix: industry-wide AI-native product margins average ~52% in 2026 (up from 41% in 2024), while Anthropic's API business is reported to run above 80% gross margin — undercutting the generic "inference loses money" narrative.

## Key findings
- Frontier 2026-class training runs (GPT-5/Gemini-Ultra tier) cost $200M–$500M; industry trend projects $1–3B per frontier model by late 2027 ([Deluair Consultancy, 2026](https://deluair.com/consultancy/insights/frontier-ai-training-cost-2026)).
- Compute (GPU-hours) is 65–75% of total frontier training cost; the amortized cost of the most compute-intensive training runs has grown ~2.4x/year since 2016 ([EmergentMind / arXiv 2405.21015](https://www.emergentmind.com/papers/2405.21015)).
- Historical anchors: GPT-4 training ≈ $78–100M; Gemini Ultra ≈ $191M — both now roughly an order of magnitude below 2026 frontier runs.
- Inference pricing collapse: GPT-4-level performance available for $0.40–0.80/M tokens via mid-tier/open models in 2026, down from ~$30/M tokens in early 2023 (~40–75x drop in ~3 years) ([VoxBooster, 2026](https://voxbooster.com/blog/ai-inference-cost-statistics-2026/)).
- Frontier reasoning-model output tokens still price at $15–25/M in 2026; tiered model example: Claude Haiku 4.5 at $1/$5 per M input/output tokens vs. Claude Opus at $5/$25 per M.
- AI-native product gross margins average ~52% industry-wide in 2026 (up from 41% in 2024); Anthropic's API business reportedly runs gross margins above 80% — margin is model-mix/pricing dependent, not a fixed industry constant ([Digital Applied, 2026](https://www.digitalapplied.com/blog/ai-unit-economics-pricing-margins-services-2026-framework)).

## Insights & implications (developers / compute buyers)
- For developers: training campuses can be sited for power/land cost above all else (rural, single-tenant, longer commissioning tolerance); inference footprints need to be closer to demand centers and often require smaller, faster-to-deploy, multi-tenant colo-style capacity — implying two very different site-selection and lease-structuring playbooks even within one company's portfolio.
- For compute buyers (AI labs): as inference volume scales, the economics of the fleet increasingly resemble a utility/SaaS margin problem (unit cost per token vs. price per token) rather than a one-off capital project — labs should model workload-mix shift (training capex amortization vs. inference variable cost) explicitly, not just aggregate GPU-hours.
- The token-price collapse for commodity-tier models means differentiation/margin increasingly comes from frontier/reasoning tiers and from inference efficiency (batching, quantization, caching) rather than from raw compute access — a signal that "cheap tokens" cannot be assumed to fund the next training run.
- Training cost trajectory ($200M→$1-3B) implies capex per model is now comparable to a mid-size data center build itself, reinforcing that lab economics and DC economics are converging into one balance sheet problem.

## Open questions for deep dive
- Build a first-principles cost-per-token model (GPU amortization + power + networking + utilization) and compare to published API prices to estimate implied margins by model tier.
- How does inference workload locality (edge vs. centralized) change $/token economics and DC siting once agentic/long-context workloads raise token volume per query?
- What share of "training" capex is actually fine-tuning/RL/post-training compute vs. pretraining, and how is that shifting the capex/opex split?

## Cross-links
- Relates to [[01-lifecycle-pro-forma]] — workload mix (training vs inference) should be an explicit pro forma input driving facility spec and revenue-per-MW assumptions.
- Relates to [[05-facility-lifecycle]] — GPU depreciation assumptions directly determine the "true" cost side of the training/inference unit economics above.
- Relates to [[04-deployment-velocity]] — training campuses' tolerance for longer lead times vs. inference's need for faster, closer capacity affects which speed-to-power tactics matter for which workload.

## Sources
- [Frontier AI training cost trajectory 2026](https://deluair.com/consultancy/insights/frontier-ai-training-cost-2026) — Deluair Consultancy, 2026 — training cost trajectory and deal-stack analysis.
- [Rising Costs of Frontier AI Training](https://www.emergentmind.com/papers/2405.21015) — EmergentMind summary of arXiv 2405.21015 — 2.4x/yr growth trend, compute share of cost.
- [Cost of Training LLM From Scratch in 2026](https://aisuperior.com/cost-of-training-llm-from-scratch/) — AI Superior, 2026.
- [AI Inference Cost Statistics (2026): 50+ Data Points](https://voxbooster.com/blog/ai-inference-cost-statistics-2026/) — VoxBooster, 2026 — token price collapse data.
- [AI Unit Economics: Pricing & Margins for AI Services](https://www.digitalapplied.com/blog/ai-unit-economics-pricing-margins-services-2026-framework) — Digital Applied, 2026 — gross margin figures (52% avg, Anthropic >80%).
- [LLM Inference Cost 2026: Complete Pricing Guide](https://aisuperior.com/llm-token-cost/) — AI Superior, 2026.
- [AI Inference Cost Economics in 2026: GPU FinOps Playbook](https://www.spheron.network/blog/ai-inference-cost-economics-2026/) — Spheron, 2026.
- **Archive-worthy artifacts:** none identified this pass (no downloadable model/spreadsheet found for token-cost math).
