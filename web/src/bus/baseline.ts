import type { LogEntry, State } from "./types";

/**
 * Label for a new baseline when the caller gives none: the plan's scenario name, else "Baseline <n>"
 * where n counts the baselines pinned so far (from the command log) so labels stay distinct.
 */
export function defaultBaselineLabel(state: State, log: readonly LogEntry[]): string {
  const scenario = state.plan?.meta?.scenarioName?.trim() ?? "";
  if (scenario !== "") return scenario;
  const pinned = log.filter((e) => e.command.type === "setBaseline" && e.rejected === null).length;
  return `Baseline ${pinned + 1}`;
}
