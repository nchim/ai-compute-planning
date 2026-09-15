# docs/ — Design & Build Documentation

Start here. This is the design + scoping set for the **AI-Lab Data Center Capacity Planner**, kept
current with what is built (see the status line in each doc).

## Read in this order
1. `product-brief.md` — what we're building and for whom; locked decisions; document map; status.
2. `architecture.md` — components (SPA · WASM engine · Copilot), the command bus, the harness, relay
   vs BYO-key transport, the Cloud Run topology.
3. `../proto/capplanner/v1/engine.proto` — **the contract**: `SitePlan` (input) → `Result` (output).
4. `engine-design.md` — Go/WASM engine as built: pipeline, conservation checks, diagnostic codes,
   Monte Carlo + two-target sensitivity, the staged optimizer, stubs, grounding fixtures.
5. `ui-spec.md` — the Site Feasibility view, toolbar, compare mode, Copilot rail, harness surface.
6. `agent-integration.md` — the embedded Copilot: model, SDK, the nine tools, caching, transport.
   - `agent-system-prompt.md` — the Copilot's cached system prompt (imported verbatim at build time).
7. `acceptance-session.md` — **the acceptance criterion**: one continuous planning session (T1–T7 + T3b).
   - `validation-cases.md` — the 3 unit-level cases it embeds (superseded as the top-level gate).
   - `../harness/README.md` — how the harness drives the app, artifacts, and the acceptance runner
     (`scripted` / `live`).
8. `implementation-plan.md` — workstreams with issue/PR numbers and status, the merge process,
   follow-ups, the deferred list.
9. `../deploy/cloudrun.md` — the tester deployment runbook (secrets, `make deploy`, operate, security).

## Also
- `.claude/skills/development/SKILL.md` — the shared, living dev process every worker follows.
- `../README.md` — repo layout, build/deploy commands, fixture conventions, status.
- `research/` — the grounding research; `research/01-landscape-synthesis.md` and
  `research/02-kpi-architecture.md` are the highest-value reads.
- Wireframe (Claude Design): https://claude.ai/artifact/6zTYP87uDYJ6MW25Tw9M4G

## Status
WS1–WS9, WS11 (baseline/compare) and WS13 (Cloud Run deploy + relay) are merged; WS10 (acceptance
session) and WS12 (grounding scenarios) are open PRs; fidelity follow-ups #28–#30 are in flight.
Progress is tracked in GitHub issues (one per workstream, `follow-up` label for the rest) and PRs.
