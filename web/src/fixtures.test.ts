import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fromJsonString } from "@bufbuild/protobuf";
import { expect, test } from "vitest";

import { fixtureJson, fixtureNames } from "./fixtures";
import { SitePlanSchema } from "./gen/capplanner/v1/engine_pb";

const fixturesDir = fileURLToPath(new URL("../../fixtures/", import.meta.url));

test("every fixtures/*.json is listed by name and parses as a SitePlan whose plan_id is its file name", () => {
  const onDisk = readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  expect(onDisk.length).toBeGreaterThanOrEqual(3);
  expect([...fixtureNames]).toEqual(onDisk);
  for (const name of fixtureNames) {
    expect(fromJsonString(SitePlanSchema, fixtureJson(name)).meta?.planId).toBe(name);
  }
});

test("an unknown fixture name throws and names the known ones", () => {
  expect(() => fixtureJson("nope")).toThrow('unknown fixture "nope"; known: abilene-1');
});
