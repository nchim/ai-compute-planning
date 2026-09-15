import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool, BetaToolRunContext } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { ToolError } from "@anthropic-ai/sdk/lib/tools/ToolError";
import { toJson } from "@bufbuild/protobuf";
import { z } from "zod";

import { applyPatch, defaultBaselineLabel, removeAt, type PatchOp, type Store } from "../bus";
import type { Engine } from "../engine";
import {
  DiagnosticSchema,
  PhasingMode,
  Status,
  SummaryMetricsSchema,
  type Result,
  type SitePlan,
} from "../gen/capplanner/v1/engine_pb";
import type { AnalysisTracker } from "./analysis";
import { PROTOJSON } from "./context";
import { explainTopic } from "./glossary";
import { readResearch } from "./research";

export type ToolStatus = "running" | "done" | "error";

export interface ToolEvent {
  readonly id: string;
  readonly name: string;
  readonly status: ToolStatus;
  /** The error message when `status` is "error", else empty. */
  readonly detail: string;
}

export interface ToolDeps {
  readonly store: Store;
  readonly engine: Engine;
  readonly tracker: AnalysisTracker;
  readonly onEvent: (event: ToolEvent) => void;
}

const fieldValue = z.union([z.string(), z.number(), z.boolean()]).describe("Scalar value, or an enum's name");

const patchOp = z.object({
  path: z
    .string()
    .min(1)
    .describe("Protojson dotted path into SitePlan, e.g. compute.kw_per_rack or phasing.phases[0].it_load_mw"),
  value: fieldValue,
});

const objective = z.enum(["MIN_STRANDED_PLUS_LCOC", "MIN_LCOC", "MIN_TIME_TO_REVENUE", "MAX_MW_CAPTURED", "MIN_RISK"]);

const optimizeInput = z.object({
  objective: objective.nullable().describe("Objective; null keeps the plan's current one"),
  constraints: z
    .array(
      z.object({
        metric: z.string().describe("SummaryMetrics field, e.g. total_capex or shortfall_mw_months"),
        op: z.enum(["LE", "GE", "EQ"]),
        value: z.number(),
      }),
    )
    .nullable(),
  decision_vars: z
    .array(
      z.object({
        input_path: z.string().describe("SitePlan path the optimizer may vary"),
        min: z.number().nullable(),
        max: z.number().nullable(),
        step: z.number().nullable(),
        enum_choices: z.array(z.string()).nullable(),
      }),
    )
    .nullable(),
  policy: z
    .object({
      // Plain numbers on purpose: zod's `.int()` adds minimum/maximum bounds the API rejects on strict
      // integer schemas; the bus rejects a non-integer write with a precise message instead.
      max_phases: z.number().nullable().describe("Integer"),
      min_phase_mw: z.number().nullable(),
      max_phase_mw: z.number().nullable(),
      min_months_between_phases: z.number().nullable().describe("Integer"),
      max_shortfall_mw: z.number().nullable().describe("Never be short more than this many MW"),
    })
    .nullable(),
});

export type OptimizeInput = z.infer<typeof optimizeInput>;

/** All Copilot tools, each strict and each reporting failures as `is_error` tool results. */
export function createTools(deps: ToolDeps): BetaRunnableTool[] {
  const { store, tracker } = deps;

  return [
    define(deps, {
      name: "edit_site_plan",
      description:
        "Apply a patch of SitePlan field writes through the command bus, then re-analyze. Returns the paths " +
        "written plus the new Result summary, diagnostics and conservation status. Use for small direct edits; " +
        "use propose_change for material ones.",
      inputSchema: z.object({ patch: z.array(patchOp).min(1) }),
      eager: true,
      strict: true,
      run: async ({ patch }) => {
        mutate(store, patch, { type: "applyPatch", patch });
        return { applied: patch.map((p) => p.path), analysis: analysisJson(await tracker.settle()) };
      },
    }),
    define(deps, {
      name: "set_control",
      description: "Operate one UI control: write a single SitePlan field, then re-analyze (same return as edit_site_plan).",
      inputSchema: z.object({ path: patchOp.shape.path, value: fieldValue }),
      strict: true,
      run: async ({ path, value }) => {
        mutate(store, [{ path, value }], { type: "setField", path, value });
        return { applied: [path], analysis: analysisJson(await tracker.settle()) };
      },
    }),
    define(deps, {
      name: "remove_list_item",
      description:
        "Delete one element of a repeated SitePlan field (e.g. path phasing.phases, index 1 deletes the second phase; " +
        "also power.sources, demand.points, risk.distributions, optimization.constraints), then re-analyze.",
      inputSchema: z.object({ path: z.string().min(1).describe("The repeated field, without [i]"), index: z.number().describe("0-based integer position") }), // plain number: zod .int() adds bounds the API rejects; removeAt validates
      strict: true,
      run: async ({ path, index }) => {
        removeAt(planOrThrow(store), path, index); // validate at the boundary
        store.dispatch({ type: "removeAt", path, index });
        rejectIfRefused(store);
        return { removed: `${path}[${index}]`, analysis: analysisJson(await tracker.settle()) };
      },
    }),
    define(deps, {
      name: "run_analyze",
      description: "Run Analyze on the current plan and return Result.summary, diagnostics and conservation.",
      inputSchema: z.object({}),
      run: async () => analysisJson(await tracker.settle()),
    }),
    define(deps, {
      name: "run_optimize",
      description:
        "Write the given objective/constraints/decision vars/policy into the plan, then run the optimizer " +
        "(on an OPTIMIZE-mode copy; the live plan's phasing.mode is untouched) and return converged, " +
        "evaluations, frontier size, best_metrics and the best plan's phasing. Lists are written by index: " +
        "a constraint or decision var set on an earlier call stays in the plan unless you overwrite that index.",
      inputSchema: optimizeInput,
      run: async (input) => {
        // Objective/constraints/policy go on the optimizer's candidate only: a refused or infeasible run
        // must leave the live plan (and the screen) exactly as it was. Apply the winner via propose_change.
        planOrThrow(store);
        return optimizationJson(await store.optimize(optimizePatch(input)));
      },
    }),
    define(deps, {
      name: "propose_change",
      description:
        "Propose a patch as an accept/undo card instead of applying it; the human decides. Returns the " +
        "proposal id. Do not assume it was accepted.",
      inputSchema: z.object({ summary: z.string().min(1).describe("One line the human reads on the card"), patch: z.array(patchOp).min(1) }),
      strict: true,
      run: async ({ summary, patch }) => {
        applyPatch(planOrThrow(store), patch); // validate at the boundary; a bad path never reaches a card
        const id = store.proposeChange(summary, patch);
        rejectIfRefused(store);
        return { proposal_id: id, status: "pending" };
      },
    }),
    define(deps, {
      name: "set_baseline",
      description:
        "Pin the current plan and its Result as the baseline scenario (label defaults to the scenario name). " +
        "Fails until a Result exists. Later Results are compared against it when compare mode is on.",
      inputSchema: z.object({ label: z.string().nullable().describe("Baseline label, or null for the default") }),
      run: async ({ label }) => {
        const state = store.getState();
        const chosen = label ?? defaultBaselineLabel(state, store.getLog());
        store.dispatch({ type: "setBaseline", label: chosen });
        rejectIfRefused(store);
        const summary = store.getState().baseline?.result.summary;
        return { label: chosen, baseline_summary: summary === undefined ? null : toJson(SummaryMetricsSchema, summary, PROTOJSON) };
      },
    }),
    define(deps, {
      name: "toggle_compare",
      description: "Toggle compare mode (current Result vs. the pinned baseline on every tile and chart). Fails without a baseline.",
      inputSchema: z.object({}),
      run: async () => {
        store.dispatch({ type: "toggleCompare" });
        rejectIfRefused(store);
        const { compare, baseline } = store.getState();
        return { compare, baseline_label: baseline?.label ?? null };
      },
    }),
    define(deps, {
      name: "explain",
      description: "Glossary lookup for a planner term (e.g. LCOC, energization, agility premium).",
      inputSchema: z.object({ topic: z.string().min(1) }),
      run: async ({ topic }) => ({ topic, explanation: explainTopic(topic) }),
    }),
    define(deps, {
      name: "query_research",
      description:
        "Read a file from the research corpus (paths as listed in your instructions), optionally just one " +
        "'## section' by its heading text.",
      inputSchema: z.object({
        path: z.string().min(1).describe("e.g. research/topics/14-speed-to-market/14-speed-to-market.md"),
        section: z.string().nullable().describe("Heading text of one section, or null for the whole file"),
      }),
      run: async ({ path, section }) => ({ path, section, text: await readResearch(path, section) }),
    }),
  ];
}

interface ToolSpec<S extends z.ZodObject> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: S;
  readonly run: (input: z.infer<S>) => Promise<unknown>;
  /** Stream the input as it is generated (large patches). The zod parse still validates it before `run`. */
  readonly eager?: boolean;
  /**
   * Ask the API to constrain generation to the schema. Every strict schema is compiled into one
   * grammar with a size cap ("compiled grammar is too large" → 400), so it is reserved for the small
   * plan-writing tools; the others rely on the zod parse, which rejects bad input before `run` anyway.
   */
  readonly strict?: boolean;
}

/**
 * Wraps a tool so the runner validates its input (betaZodTool's `parse`), the UI sees start/end
 * events, and any failure becomes a `tool_result` with `is_error` carrying the exact message.
 */
function define<S extends z.ZodObject>(deps: ToolDeps, spec: ToolSpec<S>): BetaRunnableTool {
  const tool = betaZodTool({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    run: async (input, context?: BetaToolRunContext) => {
      const id = context?.toolUse.id ?? spec.name;
      deps.onEvent({ id, name: spec.name, status: "running", detail: "" });
      try {
        const out = await spec.run(input);
        deps.onEvent({ id, name: spec.name, status: "done", detail: "" });
        return JSON.stringify(out);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        deps.onEvent({ id, name: spec.name, status: "error", detail });
        throw new ToolError(detail);
      }
    },
  });
  return { ...tool, ...(spec.strict ? { strict: true } : {}), ...(spec.eager ? { eager_input_streaming: true } : {}) };
}

function planOrThrow(store: Store): SitePlan {
  const plan = store.getState().plan;
  if (plan === null) throw new Error("no plan is loaded");
  return plan;
}

/** Validates the patch against the schema first, dispatches, and surfaces a reducer rejection. */
function mutate(store: Store, patch: readonly PatchOp[], command: Parameters<Store["dispatch"]>[0]): void {
  applyPatch(planOrThrow(store), patch);
  store.dispatch(command);
  rejectIfRefused(store);
}

function rejectIfRefused(store: Store): void {
  const last = store.getLog().at(-1);
  if (last?.rejected) throw new Error(last.rejected.message);
}

function optimizePatch(input: OptimizeInput): PatchOp[] {
  const patch: PatchOp[] = [];
  if (input.objective !== null) patch.push({ path: "optimization.objective.type", value: input.objective });
  // Repeated fields are written by index; entries beyond the new list are left untouched (index writes only).
  input.constraints?.forEach((c, i) => {
    const base = `optimization.constraints[${i}]`;
    patch.push({ path: `${base}.metric`, value: c.metric }, { path: `${base}.op`, value: c.op }, { path: `${base}.value`, value: c.value });
  });
  input.decision_vars?.forEach((d, i) => {
    const base = `optimization.decision_vars[${i}]`;
    patch.push({ path: `${base}.input_path`, value: d.input_path });
    if (d.min !== null) patch.push({ path: `${base}.min`, value: d.min });
    if (d.max !== null) patch.push({ path: `${base}.max`, value: d.max });
    if (d.step !== null) patch.push({ path: `${base}.step`, value: d.step });
    d.enum_choices?.forEach((e, j) => patch.push({ path: `${base}.enum_choices[${j}]`, value: e }));
  });
  if (input.policy !== null) {
    for (const [k, v] of Object.entries(input.policy)) {
      if (v !== null) patch.push({ path: `phasing.policy.${k}`, value: v });
    }
  }
  return patch;
}

export function analysisJson(result: Result): Record<string, unknown> {
  const failed = result.conservation?.checks.filter((c) => !c.passed).map((c) => c.name) ?? [];
  const out: Record<string, unknown> = {
    status: Status[result.status],
    summary: result.summary === undefined ? null : toJson(SummaryMetricsSchema, result.summary, PROTOJSON),
    diagnostics: result.diagnostics.map((d) => toJson(DiagnosticSchema, d, PROTOJSON)),
    conservation: { all_passed: result.conservation?.allPassed ?? null, failed_checks: failed },
  };
  // Risk outputs ride along when the engine produced them, so the model never has to guess at them.
  const mc = result.monteCarlo;
  if (mc !== undefined && Object.keys(mc.metrics).length > 0) {
    out["monte_carlo"] = {
      iterations: mc.iterations,
      metrics: Object.fromEntries(
        Object.entries(mc.metrics).map(([k, d]) => [k, { p10: d.p10, p50: d.p50, p90: d.p90, mean: d.mean, stddev: d.stddev }]),
      ),
    };
  }
  const vars = result.sensitivity?.vars ?? [];
  if (vars.length > 0) {
    out["sensitivity"] = vars.map((v) => ({
      input_path: v.inputPath,
      target_metric: v.targetMetric,
      low: v.lowOutput,
      base: v.baseOutput,
      high: v.highOutput,
      swing: Math.abs(v.highOutput - v.lowOutput),
    }));
  }
  return out;
}

function optimizationJson(result: Result): Record<string, unknown> {
  const opt = result.optimization;
  if (opt === undefined) throw new Error("the engine returned no optimization result");
  const phasing = opt.bestPlan?.phasing;
  return {
    status: Status[result.status],
    converged: opt.converged,
    evaluations: opt.evaluations,
    frontier_size: opt.frontier.length,
    best_metrics: opt.bestMetrics === undefined ? null : toJson(SummaryMetricsSchema, opt.bestMetrics, PROTOJSON),
    best_plan_phasing:
      phasing === undefined
        ? null
        : {
            mode: PhasingMode[phasing.mode],
            phases: phasing.phases.map((p) => ({
              id: p.id,
              it_load_mw: p.itLoadMw,
              start_month: p.startMonth,
              energize_month: p.energizeMonth,
              power_source_id: p.powerSourceId,
            })),
          },
    diagnostics: result.diagnostics.map((d) => toJson(DiagnosticSchema, d, PROTOJSON)),
  };
}
