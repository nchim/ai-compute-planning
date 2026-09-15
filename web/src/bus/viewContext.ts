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
}

export function viewContext(state: State): ViewContext {
  return {
    activeTab: state.selection.tab,
    selectedSiteId: state.plan?.meta?.planId ?? null,
    plan: state.plan,
    resultSummary: state.result?.summary ?? null,
    diagnostics: state.result?.diagnostics ?? [],
    selection: state.selection,
  };
}
