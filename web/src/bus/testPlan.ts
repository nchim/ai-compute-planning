import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fromJsonString } from "@bufbuild/protobuf";

import { SitePlanSchema, type SitePlan } from "../gen/capplanner/v1/engine_pb";

const fixtureUrl = new URL("../../../fixtures/abilene-1.json", import.meta.url);

/** The abilene-1 reference plan, freshly parsed on every call so tests never share a mutable plan. */
export function loadAbilene(): SitePlan {
  return fromJsonString(SitePlanSchema, readFileSync(fileURLToPath(fixtureUrl), "utf8"));
}
