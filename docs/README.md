# docs/ — Design & Build Documentation

Start here. This is the self-contained design + scoping set for the **AI-Lab Data Center Capacity
Planner**, ready for a Fable-orchestrated implementation fan-out.

## Read in this order
1. `product-brief.md` — what we're building and for whom; locked decisions; document map.
2. `architecture.md` — components (SPA · WASM engine · agent), the command-bus seam, the developer
   remote-control harness.
3. `../proto/capplanner/v1/engine.proto` — **the contract**: `SitePlan` (input) → `Result` (output).
4. `engine-design.md` — Go/WASM engine internals: pipeline, conservation checks, Monte Carlo, optimizer, TDD.
5. `ui-spec.md` — UI behavior + the Site Feasibility POC view.
6. `agent-integration.md` — the embedded Copilot: model, API, tools, caching, BYO-key dev mode.
   - `agent-system-prompt.md` — the Copilot's cached system prompt (strategic digest + research index).
7. `acceptance-session.md` — **the acceptance criterion**: one continuous planning session (T1–T7).
   - `validation-cases.md` — the 3 unit-level cases it embeds.
8. `implementation-plan.md` — locked tech decisions, workstreams (= GitHub issues), milestones.

## Also
- `.claude/skills/development/SKILL.md` — the shared, living dev process every worker follows.
- `research/` — the grounding research; `research/01-landscape-synthesis.md` and
  `research/02-kpi-architecture.md` are the highest-value reads.
- Wireframe (Claude Design): https://claude.ai/artifact/6zTYP87uDYJ6MW25Tw9M4G

## Status
Implementation in progress. Progress is tracked in GitHub issues (one per workstream) and PRs.
