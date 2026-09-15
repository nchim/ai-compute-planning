import { equals, fromBinary, fromJsonString, toBinary, toJsonString } from "@bufbuild/protobuf";
import { expect, test } from "vitest";

import { fixtureJson, fixtureNames } from "./fixtures";
import { SitePlanSchema } from "./gen/capplanner/v1/engine_pb";

// Every fixture must survive protojson → binary → protojson unchanged in TS exactly as in Go.
test.each([...fixtureNames])("%s fixture round-trips through binary and protojson", (name) => {
  const plan = fromJsonString(SitePlanSchema, fixtureJson(name));
  expect(plan.meta?.planId).toBe(name);

  const fromWire = fromBinary(SitePlanSchema, toBinary(SitePlanSchema, plan));
  expect(equals(SitePlanSchema, plan, fromWire)).toBe(true);

  const fromJson = fromJsonString(SitePlanSchema, toJsonString(SitePlanSchema, fromWire));
  expect(equals(SitePlanSchema, plan, fromJson)).toBe(true);
});
