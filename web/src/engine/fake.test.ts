import { expect, test } from "vitest";

import { loadAbilene } from "../bus/testPlan";
import { Status } from "../gen/capplanner/v1/engine_pb";
import { createFakeEngine } from "./fake";
import { EngineError } from "./protocol";

test("fake engine returns OK with a visible FAKE_ENGINE diagnostic", async () => {
  const engine = createFakeEngine();
  const result = await engine.analyze(loadAbilene());
  expect(result.status).toBe(Status.OK);
  expect(result.diagnostics.map((d) => d.code)).toEqual(["FAKE_ENGINE"]);
  expect(result.summary?.mwOnlineFinal).toBe(200);
});

test("fake engine rejects with an EngineError after dispose", async () => {
  const engine = createFakeEngine();
  engine.dispose();
  await expect(engine.analyze(loadAbilene())).rejects.toBeInstanceOf(EngineError);
});
