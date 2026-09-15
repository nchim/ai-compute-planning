# docs/ — Design & Build Documentation

Start here. This is the self-contained design + scoping set for the **AI-Lab Data Center Capacity
Planner**, ready for a Fable-orchestrated implementation fan-out.

## Read in this order
1. `product-brief.md` — what we're building and for whom; locked decisions; document map.
2. `architecture.md` — components (SPA · WASM engine · agent), the command-bus seam, the developer
   remote-control harness.
3. `proto/engine.proto` — **the contract**: `SitePlan` (input) → `Result` (output).
4. `engine-design.md` — Go/WASM engine internals: pipeline, conservation checks, Monte Carlo, optimizer, TDD.
5. `ui-spec.md` — UI behavior + the Site Feasibility POC view.
6. `validation-cases.md` — 3 simulated user sessions = acceptance criteria.
7. `implementation-plan.md` — fan-out workstreams, dependencies, milestones.

## Also
- `.claude/skills/development/SKILL.md` — the shared, living dev process every worker follows.
- `research/` — the grounding research; `research/01-landscape-synthesis.md` and
  `research/02-kpi-architecture.md` are the highest-value reads.
- Wireframe (Claude Design): https://claude.ai/artifact/6zTYP87uDYJ6MW25Tw9M4G

## Status
Design + scoping complete. Next: implementation fan-out per `implementation-plan.md`.
