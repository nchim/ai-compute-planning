import { create, equals, fromJsonString } from "@bufbuild/protobuf";
import { expect, test, vi } from "vitest";

import { createStore } from "../bus";
import { createFakeEngine } from "../engine";
import { fixtureJson } from "../fixtures";
import { ResultSchema, SitePlanSchema, Status } from "../gen/capplanner/v1/engine_pb";
import { resetSession } from "./reset";

test("resetSession clears the conversation and every piece of store state, then reloads the pristine fixture", () => {
  const store = createStore({ engine: createFakeEngine(), debounceMs: 100_000 });
  const pristine = fromJsonString(SitePlanSchema, fixtureJson("abilene-1"));
  store.dispatch({ type: "loadPlan", plan: pristine });
  store.dispatch({ type: "resultReceived", result: create(ResultSchema, { status: Status.OK }) });
  store.dispatch({ type: "setBaseline", label: "before" });
  store.dispatch({ type: "toggleCompare" });
  store.dispatch({ type: "setField", path: "compute.kw_per_rack", value: 130 });
  store.dispatch({ type: "applyPatch", patch: [{ path: "phasing.phases[0].id", value: "p1" }, { path: "phasing.phases[0].it_load_mw", value: 50 }] });
  store.dispatch({ type: "setField", path: "optimization.objective.type", value: "MIN_LCOC" });
  store.proposeChange("try liquid", [{ path: "compute.cooling", value: "LIQUID_DTC" }]);
  store.dispatch({ type: "select", selection: { tab: "site", path: "compute.pue", phaseId: null } });
  const copilot = { clear: vi.fn() };

  expect(resetSession(store, copilot)).toBe("abilene-1");

  const s = store.getState();
  expect(copilot.clear).toHaveBeenCalledOnce();
  expect(equals(SitePlanSchema, s.plan!, pristine)).toBe(true); // edits, phases, optimization controls gone
  expect(s.result).toBeNull();
  expect(s.baseline).toBeNull();
  expect(s.compare).toBe(false);
  expect(s.proposals).toEqual([]);
  expect(s.history.past).toEqual([]);
  expect(s.selection.path).toBeNull();
});

test("a plan that is not a fixture resets to an empty store", () => {
  const store = createStore({ engine: createFakeEngine(), debounceMs: 100_000 });
  const plan = fromJsonString(SitePlanSchema, fixtureJson("abilene-1"));
  plan.meta!.planId = "custom-1";
  store.dispatch({ type: "loadPlan", plan });
  expect(resetSession(store, null)).toBeNull();
  expect(store.getState().plan).toBeNull();
});
