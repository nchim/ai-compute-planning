import { fromJsonString } from "@bufbuild/protobuf";

import { ResultSchema, SitePlanSchema, type Result, type SitePlan } from "../../../gen/capplanner/v1/engine_pb";
import resultJson from "./abilene-1.result.json?raw";
import planJson from "../../../../../fixtures/abilene-1.json?raw";

// The UI golden is the engine golden (engine/core/testdata/abilene-1.result.json, single-shot baseline)
// merged with abilene-1.extra.json (diagnostics, monte_carlo, sensitivity, optimization — blocks the
// engine does not produce yet). Rebuild: jq -s '.[0] * .[1]' <engine golden> abilene-1.extra.json.
// STUB: the appended blocks are illustrative until the engine emits them (WS10 swaps the golden).
/** Freshly parsed on every call so no test or dev page shares a mutable Result. */
export function loadGoldenResult(): Result {
  return fromJsonString(ResultSchema, resultJson);
}

/** The abilene-1 reference plan, importable in the browser (unlike `bus/testPlan.ts`, which uses fs). */
export function loadGoldenPlan(): SitePlan {
  return fromJsonString(SitePlanSchema, planJson);
}
