import type { Diagnostic, SitePlan, SummaryMetrics } from "../gen/capplanner/v1/engine_pb";
import type { Selection, State, Tab } from "./types";

/** What the Copilot (and harness) see: enough to explain the screen and operate any control on it. */
export interface ViewContext {
  readonly activeTab: Tab;
  readonly selectedSiteId: string | null;
  readonly plan: SitePlan | null;
  readonly resultSummary: SummaryMetrics | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly selection: Selection;
  /** The pinned scenario's summary (null when none) and whether compare mode is on. */
  readonly baselineLabel: string | null;
  readonly baselineSummary: SummaryMetrics | null;
  readonly compare: boolean;
}

export function viewContext(state: State): ViewContext {
  return {
    activeTab: state.selection.tab,
    selectedSiteId: state.plan?.meta?.planId ?? null,
    plan: state.plan,
    resultSummary: state.result?.summary ?? null,
    diagnostics: state.result?.diagnostics ?? [],
    selection: state.selection,
    baselineLabel: state.baseline?.label ?? null,
    baselineSummary: state.baseline?.result.summary ?? null,
    compare: state.compare,
  };
}
