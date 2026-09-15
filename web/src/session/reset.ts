import { fromJsonString } from "@bufbuild/protobuf";

import type { Store } from "../bus";
import { fixtureJson, fixtureNames } from "../fixtures";
import { SitePlanSchema } from "../gen/capplanner/v1/engine_pb";

/**
 * Starts the session over: forgets the Copilot conversation for the current plan, wipes the whole
 * store (plan edits, results, proposals, baseline/compare, selection, undo history), and reloads the
 * pristine fixture the plan came from when its id names one. Returns the fixture reloaded, or null.
 */
export function resetSession(store: Store, copilot: { clear(): void } | null): string | null {
  const planId = store.getState().plan?.meta?.planId ?? null;
  copilot?.clear();
  store.dispatch({ type: "reset" });
  if (planId === null || !fixtureNames.includes(planId)) return null;
  store.dispatch({ type: "loadPlan", plan: fromJsonString(SitePlanSchema, fixtureJson(planId)) });
  return planId;
}
