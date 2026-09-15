import { toBinary } from "@bufbuild/protobuf";
import { describe, expect, test } from "vitest";

import { fakeResult } from "../engine/fake";
import { CoolingMode, SitePlanSchema, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import { reduce } from "./reducer";
import { loadAbilene } from "./testPlan";
import { initialState, type Command, type State } from "./types";

const bytes = (plan: SitePlan | null) => (plan === null ? null : toBinary(SitePlanSchema, plan));

function run(...commands: Command[]): State {
  return commands.reduce(reduce, initialState);
}

const loaded = (): State => run({ type: "loadPlan", plan: loadAbilene() });

describe("loadPlan", () => {
  test("stores an independent clone of the plan", () => {
    const plan = loadAbilene();
    const state = run({ type: "loadPlan", plan });
    expect(state.plan).not.toBe(plan);
    expect(bytes(state.plan)).toEqual(bytes(plan));
    plan.compute!.pue = 9;
    expect(state.plan!.compute!.pue).toBe(1.2);
  });

  test("a second load pushes the prior plan onto history", () => {
    const state = reduce(loaded(), { type: "loadPlan", plan: loadAbilene() });
    expect(state.history.past).toHaveLength(1);
  });
});

describe("setField", () => {
  test("writes a double, an int32, a string and an enum by name or number", () => {
    const state = run(
      { type: "loadPlan", plan: loadAbilene() },
      { type: "setField", path: "compute.kw_per_rack", value: 120 },
      { type: "setField", path: "power.interconnection.grid_energize_month", value: 24 },
      { type: "setField", path: "meta.scenario_name", value: "gas bridge" },
      { type: "setField", path: "compute.cooling", value: "LIQUID_DTC" },
    );
    expect(state.error).toBeNull();
    expect(state.plan!.compute!.kwPerRack).toBe(120);
    expect(state.plan!.power!.interconnection!.gridEnergizeMonth).toBe(24);
    expect(state.plan!.meta!.scenarioName).toBe("gas bridge");
    expect(state.plan!.compute!.cooling).toBe(CoolingMode.LIQUID_DTC);
    expect(reduce(state, { type: "setField", path: "compute.cooling", value: 3 }).plan!.compute!.cooling).toBe(
      CoolingMode.IMMERSION,
    );
  });

  test("accepts protojson lowerCamel names too", () => {
    const state = reduce(loaded(), { type: "setField", path: "compute.kwPerRack", value: 80 });
    expect(state.plan!.compute!.kwPerRack).toBe(80);
  });

  test("writes int64 as bigint and indexed repeated scalars", () => {
    const state = run(
      { type: "loadPlan", plan: loadAbilene() },
      { type: "setField", path: "run.monte_carlo.seed", value: 7 },
      { type: "setField", path: "costs.gpu.residual_curve[0]", value: 0.6 },
    );
    expect(state.plan!.run!.monteCarlo!.seed).toBe(7n);
    expect(state.plan!.costs!.gpu!.residualCurve[0]).toBe(0.6);
  });

  test("creates missing sub-messages and appends at index == length", () => {
    const state = run(
      { type: "loadPlan", plan: loadAbilene() },
      { type: "setField", path: "phasing.phases[0].it_load_mw", value: 50 },
      { type: "setField", path: "phasing.policy.max_phases", value: 3 },
    );
    expect(state.error).toBeNull();
    expect(state.plan!.phasing!.phases[0]!.itLoadMw).toBe(50);
    expect(state.plan!.phasing!.policy!.maxPhases).toBe(3);
  });

  test("does not mutate the previous plan", () => {
    const before = loaded();
    const after = reduce(before, { type: "setField", path: "compute.pue", value: 1.5 });
    expect(before.plan!.compute!.pue).toBe(1.2);
    expect(after.plan!.compute!.pue).toBe(1.5);
  });

  test.each<[string, string | number | boolean, string]>([
    ["compute.nope", 1, 'has no field "nope"'],
    ["compute", 1, "must end at a scalar or enum"],
    ["compute.kw_per_rack", "fast", "expected number"],
    ["compute.kw_per_rack", Number.NaN, "not a finite number"],
    ["power.interconnection.grid_energize_month", 1.5, "not an integer"],
    ["compute.cooling", "WATER", "is not a CoolingMode"],
    ["phasing.phases.it_load_mw", 1, "is repeated; use phases[i]"],
    ["compute[0].pue", 1, "is not repeated"],
    ["phasing.phases[3].it_load_mw", 1, "out of range"],
    ["run.monte_carlo.enabled", "yes", "expected boolean"],
    ["", 1, "path is empty"],
    ["compute..pue", 1, "bad segment"],
  ])("rejects %s = %s with a visible error", (path, value, message) => {
    const before = loaded();
    const after = reduce(before, { type: "setField", path, value });
    expect(after.error).toMatchObject({ kind: "command" });
    expect(after.error!.message).toContain(message);
    expect(after.plan).toBe(before.plan);
    expect(after.history).toBe(before.history);
  });

  test("rejects when no plan is loaded", () => {
    const state = reduce(initialState, { type: "setField", path: "compute.pue", value: 1 });
    expect(state.error?.message).toBe("no plan loaded");
  });
});

describe("applyPatch", () => {
  test("applies all ops atomically", () => {
    const state = reduce(loaded(), {
      type: "applyPatch",
      patch: [
        { path: "compute.pue", value: 1.1 },
        { path: "compute.target_it_load_mw", value: 300 },
      ],
    });
    expect(state.plan!.compute!.pue).toBe(1.1);
    expect(state.plan!.compute!.targetItLoadMw).toBe(300);
    expect(state.history.past).toHaveLength(1);
  });

  test("one bad op rejects the whole patch", () => {
    const before = loaded();
    const after = reduce(before, {
      type: "applyPatch",
      patch: [
        { path: "compute.pue", value: 1.1 },
        { path: "compute.bogus", value: 1 },
      ],
    });
    expect(after.plan).toBe(before.plan);
    expect(after.error?.message).toContain("bogus");
  });
});

describe("undo / redo", () => {
  test("undo restores the prior plan byte-for-byte; redo re-applies", () => {
    const s0 = loaded();
    const s1 = reduce(s0, { type: "setField", path: "compute.kw_per_rack", value: 120 });
    const s2 = reduce(s1, { type: "setField", path: "compute.pue", value: 1.3 });
    const undone = reduce(s2, { type: "undo" });
    expect(bytes(undone.plan)).toEqual(bytes(s1.plan));
    const undoneTwice = reduce(undone, { type: "undo" });
    expect(bytes(undoneTwice.plan)).toEqual(bytes(s0.plan));
    const redone = reduce(undoneTwice, { type: "redo" });
    expect(bytes(redone.plan)).toEqual(bytes(s1.plan));
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toHaveLength(1);
  });

  test("a new mutation clears the redo stack", () => {
    const s = run(
      { type: "loadPlan", plan: loadAbilene() },
      { type: "setField", path: "compute.pue", value: 1.3 },
      { type: "undo" },
      { type: "setField", path: "compute.pue", value: 1.4 },
    );
    expect(s.history.future).toHaveLength(0);
  });

  test("undo/redo with nothing to do is a no-op", () => {
    const s = loaded();
    expect(reduce(s, { type: "undo" })).toBe(s);
    expect(reduce(s, { type: "redo" })).toBe(s);
    expect(reduce(initialState, { type: "undo" })).toBe(initialState);
  });
});

describe("proposals", () => {
  const propose: Command = {
    type: "proposeChange",
    id: "p1",
    summary: "Go liquid",
    patch: [
      { path: "compute.cooling", value: "LIQUID_DTC" },
      { path: "compute.kw_per_rack", value: 120 },
    ],
  };

  test("propose records a pending proposal without touching the plan", () => {
    const before = loaded();
    const after = reduce(before, propose);
    expect(after.plan).toBe(before.plan);
    expect(after.proposals).toEqual([
      { id: "p1", summary: "Go liquid", patch: propose.patch, status: "pending" },
    ]);
  });

  test("accept applies the patch, snapshots history and marks accepted", () => {
    const before = reduce(loaded(), propose);
    const after = reduce(before, { type: "acceptProposal", id: "p1" });
    expect(after.error).toBeNull();
    expect(after.plan!.compute!.cooling).toBe(CoolingMode.LIQUID_DTC);
    expect(after.plan!.compute!.kwPerRack).toBe(120);
    expect(after.proposals[0]!.status).toBe("accepted");
    expect(bytes(reduce(after, { type: "undo" }).plan)).toEqual(bytes(before.plan));
  });

  test("reject leaves the plan alone and marks rejected", () => {
    const before = reduce(loaded(), propose);
    const after = reduce(before, { type: "rejectProposal", id: "p1" });
    expect(after.plan).toBe(before.plan);
    expect(after.proposals[0]!.status).toBe("rejected");
  });

  test("a proposal with an invalid patch is rejected up front", () => {
    const after = reduce(loaded(), { ...propose, patch: [{ path: "compute.nope", value: 1 }] });
    expect(after.proposals).toHaveLength(0);
    expect(after.error?.message).toContain("proposal rejected");
  });

  test("unknown, duplicate, and already-settled proposals are errors", () => {
    const s = reduce(loaded(), propose);
    expect(reduce(s, { type: "acceptProposal", id: "zz" }).error?.message).toContain('no proposal "zz"');
    expect(reduce(s, propose).error?.message).toContain("already exists");
    const settled = reduce(s, { type: "rejectProposal", id: "p1" });
    expect(reduce(settled, { type: "acceptProposal", id: "p1" }).error?.message).toContain("already rejected");
  });

  test("accepting a proposal that no longer applies keeps it pending and reports why", () => {
    // Valid when proposed (index 1 appends after phase 0), invalid once the phase is undone.
    const s = run(
      { type: "loadPlan", plan: loadAbilene() },
      { type: "setField", path: "phasing.phases[0].id", value: "a" },
      { type: "proposeChange", id: "p1", summary: "x", patch: [{ path: "phasing.phases[1].id", value: "b" }] },
      { type: "undo" },
    );
    const after = reduce(s, { type: "acceptProposal", id: "p1" });
    expect(after.error?.message).toContain("out of range");
    expect(after.plan).toBe(s.plan);
    expect(after.proposals[0]!.status).toBe("pending");
  });
});

describe("selection, results, errors", () => {
  test("select replaces the selection", () => {
    const selection = { tab: "site" as const, path: "compute.pue", phaseId: null };
    expect(reduce(initialState, { type: "select", selection }).selection).toBe(selection);
  });

  test("resultReceived stores the result and clears any error", () => {
    const errored = reduce(loaded(), { type: "errorRaised", error: { kind: "worker", message: "boom" } });
    expect(errored.error?.message).toBe("boom");
    const result = fakeResult(loadAbilene());
    const s = reduce(errored, { type: "resultReceived", result });
    expect(s.result).toBe(result);
    expect(s.error).toBeNull();
    expect(reduce(errored, { type: "clearError" }).error).toBeNull();
  });
});
