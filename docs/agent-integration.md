# Agent Integration — Embedded Copilot

**Status:** v0.1 — 2026-09-15. How the in-app Copilot is built and wired to the engine + UI.
Companion to `architecture.md` (command bus) and `ui-spec.md` (Copilot behaviors). Implemented in WS8.

## Model & API (locked 2026-09-15)
- **Model:** `claude-sonnet-5` (interactive latency + cost for a tool-heavy chat; $2/$10 per M tokens,
  1M context). Revisit per-turn escalation to Opus 5 later if reasoning-heavy turns need it.
- **API:** Anthropic **Messages API** with a **client-side tool-use loop** — the tools execute in the
  browser (WASM engine + command bus), so the loop lives in the SPA, not on a server.
- **SDK:** `@anthropic-ai/sdk` in the browser, using the beta **tool runner**
  (`client.beta.messages.toolRunner` with `betaZodTool`) so we don't hand-write the loop.
- **Inference transport (POC): BYO-key dev mode.** The developer pastes an Anthropic key (kept in
  local/session storage, dev only); the SDK calls Anthropic directly with
  `dangerouslyAllowBrowser: true` and the `anthropic-dangerous-direct-browser-access: true` header.
  **⚠️ Never ship this.** Before any real deployment, insert a **thin serverless relay** that holds the
  key server-side and forwards to Anthropic (set the SDK `baseURL` to the relay; drop the browser-access
  flag). Tracked as a pre-deployment task — see `implementation-plan.md`.

## Capabilities (client-side tools, over the command bus)
All tools dispatch through the command bus (so agent actions == human actions) and read/write the same
in-memory `SitePlan`. Validate every tool input against its schema before executing (eager streaming can
deliver truncated inputs).

| Tool | Input | Effect |
|---|---|---|
| `edit_site_plan` | JSON-patch of `SitePlan` fields (protojson paths) | Mutates the plan → re-analyze |
| `run_analyze` | `{}` | Runs WASM `Analyze`; returns `Result.summary` + `diagnostics` |
| `run_optimize` | `{objective, constraints, decision_vars}` | Runs WASM `Optimize`; returns frontier + best |
| `set_control` | `{path, value}` | Operates one UI control |
| `propose_change` | `{summary, patch}` | Renders an accept/undo card instead of applying silently |
| `explain` / `query_research` | `{topic}` | Returns glossary/research grounding for an explanation |

Behaviors: view-aware (ViewContext each turn), interprets `Result.summary`, **self-corrects from
`Result.diagnostics`** (fix the field named by `proto_path`, re-run), keeps the strategic framing
(`research/02-kpi-architecture.md`), streams responses. **Never states a number not sourced from a
`Result`.**

## Prompt structure & caching
Order matters for cache reuse (prefix match: `tools` → `system` → `messages`):
1. **Cached, stable prefix:** tool definitions + system prompt (role, strategic framing, distilled
   research knowledge, the "numbers only from Result" + self-correction rules, output style). Put a
   `cache_control` breakpoint at the end of this.
2. **Volatile, after the breakpoint:** the current **ViewContext** (active tab, selected site, current
   `SitePlan`, last `Result` summary) + the user's message. These change every turn, so they must sit
   *after* the cached prefix — verify `usage.cache_read_input_tokens > 0` across turns.

## Request features
- `stream: true` (responsive chat; use `.finalMessage()` when not handling events).
- `thinking: {type: "adaptive"}` (Sonnet 5's on-mode) with `output_config.effort` tuned per turn
  (`low`/`medium` for simple edits, `high` for optimize/interpret).
- **Strict tools** (`strict: true`, `additionalProperties:false`) on the plan-writing tools only
  (`edit_site_plan`, `set_control`, `propose_change`): strict schemas share one compiled grammar with a
  size cap — nine strict tools returned 400 "compiled grammar is too large". The rest are validated by
  the zod parse before they run, so bad input still becomes an `is_error` tool result.
- `eager_input_streaming: true` on `edit_site_plan` (large patches) — then validate the parsed input.
- Parallel tool use: return all `tool_result` blocks in one user message.

## Conversation persistence & context (POC)
- Store the transcript/history in **localStorage** (per-browser), keyed per plan/session. Wrap every
  access in try/catch and render correctly when it's empty or unavailable (private windows, blocked
  storage). Restore on load; append each turn.
- Keep the full `messages` array **including `response.content`** (thinking/tool blocks), so the tool
  loop and any future compaction replay correctly.
- **Compaction: deferred (near-term).** Long sessions will exceed context. Plan to add server-side
  compaction (beta `compact-2026-01-12` — append `response.content` each turn; the API summarizes near
  the threshold) or context editing. Not needed for the POC's short sessions, but design the history
  store so it can be swapped to a compaction-aware one without rework.

## Relationship to the remote-control harness
The **dev harness** (this session, Playwright) can call `sendCopilot(text)` to drive the *real* agent
loop end-to-end for the validation cases — the harness needs no key of its own; it exercises whatever
inference transport is configured (BYO-key in dev).

## Implementation map (WS8, `web/src/copilot/`)
- `client.ts` — `createCopilot({store, engine, apiKey, model?, onUsage?})`: tool runner, streaming,
  cached system prompt + per-turn ViewContext, transcript persistence; `send` / `abort` / `subscribe`.
- `tools.ts` — the seven tools; `analysis.ts` — waits for the store's re-analyze to settle;
  `context.ts` — the ViewContext block; `history.ts` — localStorage transcripts; `research.ts` —
  the build-time corpus bundle; `prompt.ts` — the PROMPT TEXT import.
- `CopilotRail.tsx` reads the engine from `EngineProvider` (wrapped around `<App/>` in `main.tsx`) and
  registers the live Copilot's `send` with the dev harness via `window.__harness.setCopilot`, so the
  harness's `sendCopilot(text)` drives the real loop.
- `run_optimize` never flips the live plan's `phasing.mode`: it patches objective/constraints/decision
  vars/policy, then calls `store.optimize()`, which optimizes an OPTIMIZE-mode clone and stores the reply
  under the store's stale-reply guard.
- Mutation tools (`edit_site_plan`, `set_control`) return the settled analysis (summary + diagnostics +
  conservation) so the model self-corrects within one turn without an extra `run_analyze`.

## Deferred to pre-deployment
- The thin serverless relay (key custody, per-user auth, rate limiting) replacing BYO-key mode.
- **Conversation compaction / context management** for long sessions (beta compaction or context editing).
- Optional per-turn model escalation (Sonnet 5 → Opus 5) for reasoning-heavy turns.
- Move transcript persistence from localStorage to a durable/shared store if sessions need to sync.
