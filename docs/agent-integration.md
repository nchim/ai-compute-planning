# Agent Integration — Embedded Copilot

**Status:** v0.2 — 2026-09-15. How the in-app Copilot is built and wired to the engine + UI.
Companion to `architecture.md` (command bus) and `ui-spec.md` (Copilot behaviors). Implemented in WS8,
extended by WS11 (baseline tools), WS13 (relay transport) and PRs #48–#51 (`remove_list_item`,
candidate-only optimize, risk outputs in tool results).

## Model & API (locked 2026-09-15)
- **Model:** `claude-sonnet-5` (interactive latency + cost for a tool-heavy chat; $2/$10 per M tokens,
  1M context). Revisit per-turn escalation to Opus 5 later if reasoning-heavy turns need it.
- **API:** Anthropic **Messages API** with a **client-side tool-use loop** — the tools execute in the
  browser (WASM engine + command bus), so the loop lives in the SPA, not on a server.
- **SDK:** `@anthropic-ai/sdk` in the browser, using the beta **tool runner**
  (`client.beta.messages.toolRunner` with `betaZodTool`) so we don't hand-write the loop.
- **Inference transport** is chosen at build time (`web/src/copilot/transport.ts`, see
  `architecture.md`): **relay mode** (`VITE_COPILOT_RELAY=/api/anthropic`, the deployed build — the
  browser holds no key) or **BYO-key dev mode** (the developer pastes a key into the rail, kept in
  sessionStorage; the SDK calls Anthropic directly with `dangerouslyAllowBrowser: true` and the
  `anthropic-dangerous-direct-browser-access` header. **⚠️ Never ship this build.**)

## Capabilities (client-side tools, over the command bus)
All tools dispatch through the command bus (so agent actions == human actions) and read/write the same
in-memory `SitePlan`. Every input is validated against its zod schema before it runs (eager streaming
can deliver truncated inputs), and every failure — schema, path, reducer rejection, engine — comes
back as an `is_error` tool result carrying the exact message. The ten tools (`web/src/copilot/tools.ts`,
list pinned by `client.test.ts`):

| Tool | Input | Effect / returns |
|---|---|---|
| `edit_site_plan` | `{patch: [{path, value}]}` (protojson dotted paths) | `applyPatch` → re-analyze; returns the paths written + `analysis` |
| `set_control` | `{path, value}` | One `setField`, i.e. operates one UI control; same return |
| `remove_list_item` | `{path, index}` (the repeated field without `[i]`, 0-based index as a plain number) | `removeAt` — deletes a phase, power source, demand point, distribution or constraint → re-analyze; returns `removed` + `analysis` |
| `run_analyze` | `{}` | Waits for the store's analyze to settle; returns `analysis` |
| `run_optimize` | `{objective, constraints, decision_vars, policy}` (all nullable) | `store.optimize(overrides)` — the settings go on the optimizer's **candidate only**, the live plan is untouched; returns `status`, `converged`, `evaluations`, `frontier_size`, `best_metrics`, `best_plan_phasing`, `diagnostics` |
| `propose_change` | `{summary, patch}` | Validates the patch, files an accept/undo card; returns `proposal_id` + `status: pending` (never assume acceptance) |
| `set_baseline` | `{label \| null}` | Pins plan + Result as the baseline (label defaults to the scenario name); returns the baseline summary |
| `toggle_compare` | `{}` | Flips compare mode; fails without a baseline |
| `explain` | `{topic}` | Glossary lookup (`copilot/glossary.ts`) |
| `query_research` | `{path, section \| null}` | Reads one corpus file (or one `## section`) from the build-time bundle |

**What `analysis` contains** (`analysisJson`, returned by `edit_site_plan`, `set_control`,
`remove_list_item` and `run_analyze`): `status`, `summary` (protojson `SummaryMetrics`, proto field
names), `diagnostics` (each with `code`, `proto_path`, `expected`, `actual`, `hint`), `conservation`
(`all_passed`, `failed_checks`), and — only when the engine produced them — `monte_carlo`
(`iterations` + per-metric `{p10, p50, p90, mean, stddev}`) and `sensitivity` (per `input_path` ×
`target_metric`: `low`, `base`, `high`, `swing`). Before #51 the risk outputs were invisible to the
model, which is why it once concluded "Monte Carlo isn't wired"; the prompt's "Running risk analyses"
section now tells it how to enable them.

Behaviors: view-aware (ViewContext each turn), interprets `Result.summary`, **self-corrects from
`Result.diagnostics`** (fix the field named by `proto_path`, re-run), keeps the strategic framing
(`research/02-kpi-architecture.md`), streams responses. **Never states a number not sourced from a
`Result`.**

## Prompt structure & caching
Order matters for cache reuse (prefix match: `tools` → `system` → `messages`):
1. **Cached, stable prefix:** tool definitions + the system prompt (`docs/agent-system-prompt.md`,
   imported verbatim at build time; sections: How you operate · The four dimensions · The strategic
   frame · SitePlan paths and enum names · Benchmarks · Honest data gaps · Running risk analyses
   (Monte Carlo and sensitivity) · Research corpus). One `system` block with the `cache_control`
   breakpoint at its end.
2. **Volatile, after the breakpoint:** the current **ViewContext** (active tab, selected site, current
   `SitePlan`, last `Result` summary + diagnostics, baseline label/summary, compare flag, pending
   proposals) as the first text block of the user message, then the user's text. These change every
   turn, so they must sit *after* the cached prefix — `client.test.ts` asserts
   `usage.cache_read_input_tokens > 0` on the second turn.

## Request features (as sent by `client.ts`)
- `stream: true`; text deltas and `tool_use` starts drive the rail's activity indicator;
  `.finalMessage()` per iteration.
- `thinking: {type: "adaptive"}` (Sonnet 5's on-mode); `max_tokens` 32,000; `max_iterations` 16;
  `output_config.effort` only when the caller passes one (`send(text, {effort})` — the acceptance spec
  uses `high` for T3/T7/T8 and `low` for the what-ifs; the rail sends none, i.e. the API default).
- **Strict tools** (`strict: true`) on the plan-writing tools only (`edit_site_plan`, `set_control`,
  `remove_list_item`, `propose_change`): every strict schema joins one compiled grammar with a size cap
  — nine strict tools returned 400 "compiled grammar is too large". The rest are validated by the zod
  parse before they run, so bad input still becomes an `is_error` tool result.
- **No integer bounds in tool schemas.** zod's `.int()` / `.min()` / `.max()` emit `minimum` /
  `maximum` / `type: integer` constraints that the API rejects (400) on strict integer schemas, so
  numeric inputs (`remove_list_item.index`, `run_optimize.policy.*`) are plain `z.number()` with an
  "Integer" description; the bus rejects a non-integer write with a precise message instead.
- `eager_input_streaming: true` on `edit_site_plan` (large patches) — then validate the parsed input.
  Eager streaming can hand the SDK unparseable JSON, which rejects the iteration without a `tool_use`
  id to answer; the client re-issues the turn once (API errors are never retried).
- Parallel tool use is handled by the runner (all `tool_result` blocks in one user message).
- `stop_reason` `max_tokens` → notice; `refusal` → error; abort → "Stopped."

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
inference transport is configured (BYO-key in dev, the relay in `make serve`).

## Implementation map (`web/src/copilot/`)
- `client.ts` — `createCopilot({store, engine, apiKey, model?, onUsage?})`: tool runner, streaming,
  cached system prompt + per-turn ViewContext, transcript persistence; `send` / `abort` / `clear` /
  `subscribe` / `getSnapshot`. The snapshot carries `activity` (`idle | thinking | writing | tool`)
  for the rail's indicator and `toolEvents` for the chips.
- `tools.ts` — the ten tools and `analysisJson`; `analysis.ts` — waits for the store's re-analyze to
  settle; `context.ts` — the ViewContext block; `history.ts` — localStorage transcripts;
  `research.ts` — the build-time corpus bundle; `prompt.ts` — the PROMPT TEXT import;
  `Markdown.tsx` — react-markdown + GFM rendering of assistant text; `handle.tsx` —
  `CopilotHandleProvider` / `useCopilotSend`, the in-app handle other views use to send a message.
- `CopilotRail.tsx` reads the engine from `EngineProvider` (wrapped around `<App/>` in `main.tsx`) and
  registers the live Copilot with both the in-app handle (`send`) and the dev harness
  (`window.__harness.setCopilot({send, snapshot})`), so a schematic "Explain →" click and the
  harness's `sendCopilot(text)` drive the same loop and `getCopilotSnapshot()` can assert on the
  transcript; it also attaches the Copilot to the session share so each turn can be reported.
- `run_optimize` never touches the live plan: its objective/constraints/decision vars/policy become
  `overrides` for `store.optimize(overrides)`, which applies them to the OPTIMIZE-mode candidate only
  and stores an OK reply under the store's stale-reply guard; a refused/infeasible run leaves the
  screen as it was and returns the diagnostics. The winner is applied via `propose_change`.
- Mutation tools (`edit_site_plan`, `set_control`, `remove_list_item`) return the settled analysis so
  the model self-corrects within one turn without an extra `run_analyze`.

## Deferred
- Per-user auth and a cross-instance rate limit on the relay (#11 remainder).
- **Conversation compaction / context management** for long sessions (beta compaction or context editing).
- Optional per-turn model escalation (Sonnet 5 → Opus 5) for reasoning-heavy turns (per-turn
  *effort* already exists; the rail does not yet choose one).
- Prompt refinement from the archived live run (#33) and the live T4–T8 gaps (#53).
- Move transcript persistence from localStorage to a durable/shared store if sessions need to sync.
