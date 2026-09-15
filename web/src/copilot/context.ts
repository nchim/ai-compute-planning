import { toJson } from "@bufbuild/protobuf";

import { viewContext, type State } from "../bus";
import {
  DiagnosticSchema,
  SitePlanSchema,
  SummaryMetricsSchema,
  type SitePlan,
} from "../gen/capplanner/v1/engine_pb";

/** Plan sections the Copilot needs to orient and operate controls; cost tables and risk config are omitted. */
const PLAN_SUMMARY_FIELDS = ["meta", "site", "compute", "power", "phasing", "demand", "revenue", "finance", "run"] as const;

function planSummary(plan: SitePlan): Record<string, unknown> {
  const json = toJson(SitePlanSchema, plan, PROTOJSON) as Record<string, unknown>;
  const costs = (json["costs"] ?? {}) as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const f of PLAN_SUMMARY_FIELDS) summary[f] = json[f];
  summary["costs"] = { gpu: costs["gpu"], agility_premium_pct: costs["agility_premium_pct"] };
  return summary;
}

/** Proto field names (snake_case) so JSON keys line up with bus paths and diagnostics' proto_path. */
export const PROTOJSON = { useProtoFieldName: true } as const;

/**
 * The volatile per-turn context. It goes in the user message, after the cached system prompt, and is
 * wrapped in a tag so the UI can hide it and the model can tell it from the human's words.
 */
export function viewContextBlock(state: State): string {
  const ctx = viewContext(state);
  const body = {
    activeTab: ctx.activeTab,
    selectedSiteId: ctx.selectedSiteId,
    selection: ctx.selection,
    plan: ctx.plan === null ? null : planSummary(ctx.plan),
    resultSummary: ctx.resultSummary === null ? null : toJson(SummaryMetricsSchema, ctx.resultSummary, PROTOJSON),
    diagnostics: ctx.diagnostics.map((d) => toJson(DiagnosticSchema, d, PROTOJSON)),
    conservation: { all_passed: state.result?.conservation?.allPassed ?? null },
    baselineLabel: ctx.baselineLabel,
    baselineSummary: ctx.baselineSummary === null ? null : toJson(SummaryMetricsSchema, ctx.baselineSummary, PROTOJSON),
    compare: ctx.compare,
    pendingProposals: state.proposals.filter((p) => p.status === "pending").map((p) => p.id),
  };
  return `<view_context>\n${JSON.stringify(body)}\n</view_context>`;
}

export const VIEW_CONTEXT_PREFIX = "<view_context>";
