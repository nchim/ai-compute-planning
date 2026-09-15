# Agent Integration — Embedded Copilot

**Status:** v0.2 — 2026-09-15. How the in-app Copilot is built and wired to the engine + UI, as
implemented in WS8 (PR #19), WS11 (PR #24) and WS13 (PR #32). Companion to `architecture.md` (command
bus) and `ui-spec.md` (Copilot rail). Source: `web/src/copilot/`.

## Model & API (locked 2026-09-15)
- **Model:** `claude-sonnet-5` (`DEFAULT_MODEL` in `client.ts`; interactive latency + cost for a
  tool-heavy chat; 1M context). Per-turn escalation to Opus 5 is deferred.
- **API:** Anthropic **Messages API** with a **client-side tool-use loop** — the tools execute in the
  browser (WASM engine + command bus), so the loop lives in the SPA, not on a server.
- **SDK:** `@anthropic-ai/sdk` 0.125 in the browser, using the beta **tool runner**
  (`client.beta.messages.toolRunner` with `betaZodTool`), `max_iterations` 16 per turn.
- **Inference transport** — selected at build time in `web/src/copilot/transport.ts`:
  - **Relay mode (deployed default).** `VITE_COPILOT_RELAY=/api/anthropic` points the SDK's `baseURL`
    at our own server (`deploy/server`, Go, on Cloud Run), which holds the Anthropic key, gates every
    request behind the shared Basic Auth password, forwards only `POST /v1/messages` with an
    allow-list of headers, streams SSE through, and enforces a per-UTC-day request cap (429 in the
    Anthropic error envelope, so the SDK raises `RateLimitError` and the rail shows the reason). The
    client passes a placeholder key (the SDK requires one; the relay overwrites it) and still sets
    `dangerouslyAllowBrowser: true` — the SDK refuses to construct in a browser without it — but
    removes the `anthropic-dangerous-direct-browser-access` header it would otherwise add, since there
    is no key in the page to acknowledge. The key panel is replaced by "Relay mode — key held
    server-side". Runbook: `deploy/cloudrun.md`.
  - **BYO-key mode (dev default).** With `VITE_COPILOT_RELAY` unset the developer pastes a key (kept
    in sessionStorage under `copilot.apiKey`) and the browser calls Anthropic directly. **⚠️ Never
    deploy this build.**

## Capabilities (client-side tools, over the command bus)
All tools dispatch through the command bus (so agent actions == human actions) and read/write the same
in-memory `SitePlan`. Every input is validated by its zod schema before execution (eager streaming can
deliver truncated inputs), and patches are additionally validated against `SitePlanSchema` at the
boundary so a bad path never reaches the reducer or a card. The nine tools (`tools.ts`):

| Tool | Input | Effect |
|---|---|---|
| `edit_site_plan` | `{patch: [{path, value}]}` (dotted protojson paths; eager input streaming) | `applyPatch` → re-analyze; returns the paths written + the settled analysis |
| `set_control` | `{path, value}` | `setField` on one control → re-analyze; same return |
| `run_analyze` | `{}` | Waits for the store's analyze to settle; returns `status`, `summary`, `diagnostics`, `conservation {all_passed, failed_checks}` |
| `run_optimize` | `{objective?, constraints?, decision_vars?, policy?}` (all nullable) | Patches `optimization.*` / `phasing.policy.*`, then `store.optimize()` on an OPTIMIZE-mode clone; returns `converged`, `evaluations`, `frontier_size`, `best_metrics`, `best_plan_phasing`, diagnostics. The live plan's `phasing.mode` is untouched. |
| `propose_change` | `{summary, patch}` | Files an accept/undo card instead of applying; returns `proposal_id` (status `pending`) |
| `set_baseline` | `{label?}` | `setBaseline` (label defaults to the scenario name); returns the label + `baseline_summary`; fails without a Result |
| `toggle_compare` | `{}` | `toggleCompare`; returns `{compare, baseline_label}`; fails without a baseline |
| `explain` | `{topic}` | Glossary lookup (`glossary.ts`) |
| `query_research` | `{path, section?}` | Reads one file (or one `## section`) from the research corpus bundled at build time (`research.ts`) |

Every tool is `strict` and any failure — schema, reducer rejection, engine error — is thrown as a
`ToolError`, which the runner returns to the model as an `is_error` `tool_result`; the rail shows it on
the tool chip. Mutation tools return the settled analysis so the model self-corrects within one turn
without an extra `run_analyze`. (The WS10 branch narrows `strict` to the plan-writing tools after the
API's grammar cap rejected nine strict schemas; that lands with the acceptance PR.)

Behaviors: view-aware (ViewContext each turn), interprets `Result.summary`, **self-corrects from
`Result.diagnostics`** (fix the field named by `proto_path`, re-run), keeps the strategic framing
(`research/02-kpi-architecture.md`), streams responses, cites compare-mode deltas as
current − baseline from the two summaries. **Never states a number not sourced from a `Result`.**

## Prompt structure & caching
Order matters for cache reuse (prefix match: `tools` → `system` → `messages`):
1. **Cached, stable prefix:** tool definitions + the system prompt (`docs/agent-system-prompt.md`
   PROMPT TEXT, imported at build time by `prompt.ts`) as one `system` text block with
   `cache_control: {type: "ephemeral"}`.
2. **Volatile, after the breakpoint:** each user message is two text blocks — the
   **`<view_context>` block** (`context.ts`: `activeTab`, `selectedSiteId`, `selection`, a plan summary
   without cost tables, `resultSummary`, `diagnostics`, `conservation.all_passed`, `baselineLabel`,
   `baselineSummary`, `compare`, `pendingProposals`) and then the human's words. The rail hides the
   context block. `client.test.ts` asserts `cache_read_input_tokens > 0` on the second turn; the dev
   usage line in the rail shows it live.

## Request features (as sent by `client.ts`)
- `stream: true`; text deltas and `tool_use` starts drive the rail; `.finalMessage()` per iteration.
- `thinking: {type: "adaptive"}`; `max_tokens` 32,000.
- **Strict tools** (`strict: true`) for schema-valid tool args; `eager_input_streaming: true` on
  `edit_site_plan` (large patches). If eager streaming hands the SDK unparseable tool JSON the turn is
  re-issued once; API errors are never retried.
- Parallel tool use is handled by the runner (all `tool_result` blocks in one user message).
- `stop_reason` `max_tokens` → notice; `refusal` → error; abort → "Stopped."

## Conversation persistence & context (POC)
- Transcripts persist in **localStorage** (`history.ts`), keyed per plan id, wrapped in try/catch and
  rendered correctly when storage is unavailable; restored when a plan is loaded, appended after each
  turn. A size cap drops the oldest turns and the rail says how many.
- The full `messages` array **including `response.content`** (thinking/tool blocks) is kept; an
  assistant turn whose tool calls were never answered (abort mid-tool) is dropped so replay is valid.
- **Compaction: deferred.** Long sessions will exceed context; the history store is designed to be
  swapped for a compaction-aware one (beta compaction or context editing) without rework.

## Relationship to the remote-control harness
`CopilotRail` registers the live Copilot's `send` with `window.__harness.setCopilot`, so the harness's
`sendCopilot(text)` drives the *real* agent loop end-to-end; the harness needs no key of its own and
exercises whatever transport the build has. The WS10 acceptance branch adds `getCopilotSnapshot()`
(`{messages, toolEvents, lastUsage, running, error}`) so a live run can assert on tool calls, cache
reads and narration.

## Implementation map (`web/src/copilot/`)
- `client.ts` — `createCopilot({store, engine, apiKey, model?, onUsage?, client?, storage?, maxIterations?})`:
  tool runner, streaming, cached system prompt + per-turn ViewContext, transcript persistence;
  `send` / `abort` / `subscribe` / `getSnapshot` / `dispose`.
- `transport.ts` — relay vs BYO-key selection (`VITE_COPILOT_RELAY`) and SDK client construction.
- `tools.ts` — the nine tools; `analysis.ts` — waits for the store's re-analyze to settle;
  `context.ts` — the ViewContext block; `history.ts` — localStorage transcripts; `research.ts` —
  the build-time corpus bundle; `glossary.ts` — `explain`; `prompt.ts` — the PROMPT TEXT import;
  `markdownLite.tsx` — assistant text rendering; `testApi.ts` — a real `Anthropic` client over a
  scripted `fetch` (SSE) for tests.
- `CopilotRail.tsx` reads the engine from `EngineProvider` (`engineContext.tsx`, wrapped around
  `<App/>` in `main.tsx`), owns one Copilot per (store, engine, key), and registers it with the harness.
- `run_optimize` never flips the live plan's `phasing.mode`: it patches objective/constraints/decision
  vars/policy, then calls `store.optimize()`, which optimizes an OPTIMIZE-mode clone and stores the reply
  under the store's stale-reply guard.

## Deferred
- ~~The thin serverless relay (key custody, rate limiting)~~ — done (`deploy/server`, relay mode
  above). Still open: **per-user auth** (the relay uses one shared password) and a cap shared across
  instances (the current one is per process; `--max-instances 1` keeps it meaningful) — tracked in #11.
- **Conversation compaction / context management** for long sessions (beta compaction or context editing).
- Optional per-turn model escalation (Sonnet 5 → Opus 5) for reasoning-heavy turns.
- Move transcript persistence from localStorage to a durable/shared store if sessions need to sync.
