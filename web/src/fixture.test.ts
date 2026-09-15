import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { equals, fromBinary, fromJsonString, toBinary, toJsonString } from "@bufbuild/protobuf";
import { expect, test } from "vitest";

import { SitePlanSchema } from "./gen/capplanner/v1/engine_pb";

const fixtureUrl = new URL("../../fixtures/abilene-1.json", import.meta.url);

// The reference plan must survive protojson → binary → protojson unchanged in TS exactly as in Go.
test("abilene-1 fixture round-trips through binary and protojson", () => {
  const raw = readFileSync(fileURLToPath(fixtureUrl), "utf8");
  const plan = fromJsonString(SitePlanSchema, raw);
  expect(plan.meta?.planId).toBe("abilene-1");

  const fromWire = fromBinary(SitePlanSchema, toBinary(SitePlanSchema, plan));
  expect(equals(SitePlanSchema, plan, fromWire)).toBe(true);

  const fromJson = fromJsonString(SitePlanSchema, toJsonString(SitePlanSchema, fromWire));
  expect(equals(SitePlanSchema, plan, fromJson)).toBe(true);
});
