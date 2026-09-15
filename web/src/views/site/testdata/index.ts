import { fromJsonString } from "@bufbuild/protobuf";

import { ResultSchema, SitePlanSchema, type Result, type SitePlan } from "../../../gen/capplanner/v1/engine_pb";
import resultJson from "./abilene-1.result.json?raw";
import planJson from "../../../../../fixtures/abilene-1.json?raw";

// STUB: hand-built golden Result until WS10 swaps in the engine's `engine/core/testdata` golden.
/** Freshly parsed on every call so no test or dev page shares a mutable Result. */
export function loadGoldenResult(): Result {
  return fromJsonString(ResultSchema, resultJson);
}

/** The abilene-1 reference plan, importable in the browser (unlike `bus/testPlan.ts`, which uses fs). */
export function loadGoldenPlan(): SitePlan {
  return fromJsonString(SitePlanSchema, planJson);
}
