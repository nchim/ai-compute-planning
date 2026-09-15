// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { StoreProvider, createStore, type Command, type Store } from "../../bus";
import type { Engine } from "../../engine/client";
import type { Result } from "../../gen/capplanner/v1/engine_pb";
import { ContextMap } from "./ContextMap";
import { CriticalPath } from "./CriticalPath";
import { OptimizationPanel, patchFromBestPlan } from "./OptimizationPanel";
import { PhasingLever } from "./PhasingLever";
import { ProForma } from "./ProForma";
import { Risk } from "./Risk";
import { SiteFeasibilityView } from "./SiteFeasibilityView";
import { SiteSchematic } from "./SiteSchematic";
import { loadGoldenPlan, loadGoldenResult } from "./testdata";

interface Harness {
  readonly store: Store;
  readonly dispatched: Command[];
  readonly optimizeCalls: number[];
}

/** A store on the golden plan+Result whose dispatches and optimize() calls are recorded. */
function harness(result: Result | null = loadGoldenResult()): Harness {
  const optimizeCalls: number[] = [];
  const engine: Engine = {
    analyze: () => new Promise<Result>(() => undefined), // never resolves: the golden stays on screen
    optimize: () => {
      optimizeCalls.push(1);
      return new Promise<Result>(() => undefined);
    },
    dispose() {},
  };
  const inner = createStore({ engine, debounceMs: 100_000 });
  inner.dispatch({ type: "loadPlan", plan: loadGoldenPlan() });
  if (result !== null) inner.dispatch({ type: "resultReceived", result });
  const dispatched: Command[] = [];
  const store: Store = {
    ...inner,
    dispatch(c) {
      dispatched.push(c);
      inner.dispatch(c);
    },
  };
  return { store, dispatched, optimizeCalls };
}

function mount(h: Harness, ui: React.ReactElement) {
  return render(<StoreProvider store={h.store}>{ui}</StoreProvider>);
}

afterEach(cleanup);

describe("regions render from the golden Result", () => {
  test("the whole view renders every region, the status and the top-level diagnostics", () => {
    const { container } = mount(harness(), <SiteFeasibilityView />);
    for (const id of ["context_map", "site_schematic", "phasing", "critical_path", "pro_forma", "risk", "optimization"]) {
      expect(container.querySelector(`[data-region="${id}"]`), id).not.toBeNull();
    }
    expect(screen.getByText(/OK with warnings/)).toBeTruthy();
    expect(screen.getByText(/conservation green/)).toBeTruthy();
    // GOLDEN_FIXTURE has no proto_path → top list; DENSITY_NEAR_AIR_CEILING is inline at its control.
    expect(within(container.querySelector(".diags.top")!).getByText("GOLDEN_FIXTURE")).toBeTruthy();
    const density = container.querySelector('[data-path="compute.kw_per_rack"]')!;
    expect(within(density as HTMLElement).getByText("DENSITY_NEAR_AIR_CEILING")).toBeTruthy();
  });

  test("every region shows a neutral state when there is no Result", () => {
    const { container } = mount(harness(null), <SiteFeasibilityView />);
    expect(container.querySelectorAll(".empty").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByText("Schematic not computed yet")).toBeTruthy();
  });

  test("context map draws the site and toggles overlays", () => {
    const { container } = mount(harness(), <ContextMap />);
    expect(container.querySelector(".ov-power")).not.toBeNull();
    expect(container.querySelector(".ov-water")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /water/ }));
    expect(container.querySelector(".ov-water")).not.toBeNull();
    expect(screen.getByText(/water stress 0.60/)).toBeTruthy();
  });

  test("schematic renders all blocks at the final month with the footprint badge and phase legend", () => {
    const { container } = mount(harness(), <SiteSchematic />);
    expect(container.querySelectorAll("[data-block]")).toHaveLength(11);
    expect(screen.getByText("footprint 41% used")).toBeTruthy();
    expect(container.querySelectorAll(".legend li")).toHaveLength(3);
  });

  test("phasing shows the step chart with shortfall and stranded shading plus the capture metrics", () => {
    const { container } = mount(harness(), <PhasingLever />);
    expect(container.querySelector(".shade.shortfall")).not.toBeNull();
    expect(container.querySelector(".shade.stranded")).not.toBeNull();
    expect(screen.getByText("91.4%")).toBeTruthy();
  });

  test("critical path renders each task and the energize + grid markers", () => {
    const { container } = mount(harness(), <CriticalPath />);
    expect(container.querySelectorAll(".task")).toHaveLength(6);
    expect(screen.getByText("energize Q3-27")).toBeTruthy();
    expect(screen.getByText("grid Q3-28")).toBeTruthy();
  });

  test("pro forma renders the KPI tiles, the capex stack and the table", () => {
    const { container } = mount(harness(), <ProForma />);
    expect(screen.getByText("$1.72")).toBeTruthy();
    expect(screen.getByText("$7.4B")).toBeTruthy();
    expect(screen.getByText("12.1%")).toBeTruthy();
    expect(container.querySelectorAll(".stackbar rect")).toHaveLength(7);
    expect(container.querySelectorAll(".capex-table tbody tr")).toHaveLength(7);
  });

  test("risk renders the radar, Monte Carlo bands and the tornado", () => {
    const { container } = mount(harness(), <Risk />);
    expect(container.querySelectorAll(".radar text")).toHaveLength(6);
    expect(container.querySelectorAll(".bands")).toHaveLength(2);
    expect(screen.getByText("P10 $1.58")).toBeTruthy();
    expect(screen.getByText("P90 $1.94")).toBeTruthy();
    expect(container.querySelectorAll(".tornado [data-input]")).toHaveLength(5);
  });

  test("risk without Monte Carlo shows the enable toggle and a neutral state", () => {
    const result = loadGoldenResult();
    result.monteCarlo = undefined;
    mount(harness(result), <Risk />);
    expect(screen.getByRole("checkbox", { name: /Enable Monte Carlo/ })).toBeTruthy();
    expect(screen.getByText("Monte Carlo bands not computed yet")).toBeTruthy();
  });

  test("optimization renders the frontier with the best candidate ringed", () => {
    const { container } = mount(harness(), <OptimizationPanel />);
    expect(container.querySelectorAll(".scatter .dot")).toHaveLength(9);
    expect(container.querySelectorAll(".scatter .dot.best")).toHaveLength(1);
    expect(screen.getByText(/214 evaluations · converged/)).toBeTruthy();
  });
});

describe("controls dispatch through the bus", () => {
  test("master-lever sliders and selects emit setField with the bound path and value", () => {
    const h = harness();
    const { container } = mount(h, <ProForma />);
    const slider = (path: string) => container.querySelector(`[data-path="${path}"] input`) as HTMLInputElement;
    fireEvent.change(slider("revenue.compute.gpu_hour_price"), { target: { value: "3" } });
    fireEvent.change(slider("power.interconnection.grid_energize_month"), { target: { value: "24" } });
    fireEvent.change(slider("costs.gpu.depreciation_years"), { target: { value: "4" } });
    fireEvent.change(container.querySelector('[data-path="compute.cooling"] select')!, { target: { value: "LIQUID_DTC" } });
    expect(h.dispatched).toEqual([
      { type: "setField", path: "revenue.compute.gpu_hour_price", value: 3 },
      { type: "setField", path: "power.interconnection.grid_energize_month", value: 24 },
      { type: "setField", path: "costs.gpu.depreciation_years", value: 4 },
      { type: "setField", path: "compute.cooling", value: "LIQUID_DTC" },
    ]);
    expect(h.store.getState().plan?.costs?.gpu?.depreciationYears).toBe(4);
    expect(h.store.getState().error).toBeNull();
  });

  test("the scrubber dispatches select with the month and hides blocks energized later", () => {
    const h = harness();
    const { container } = mount(h, <SiteSchematic />);
    fireEvent.change(screen.getByLabelText("time scrubber (month)"), { target: { value: "20" } });
    expect(h.dispatched[0]).toMatchObject({ type: "select", selection: { month: 20 } });
    const visible = [...container.querySelectorAll("[data-block]")].map((el) => el.getAttribute("data-block"));
    expect(visible).toEqual(["setback", "gas-pad", "hall-1", "cool-1", "water", "expansion"]);
    expect(h.store.getState().selection.month).toBe(20);
  });

  test("phasing mode, phase fields, add phase and Optimize phasing", () => {
    const h = harness();
    const { container } = mount(h, <PhasingLever />);
    fireEvent.change(container.querySelector('[data-path="phasing.mode"] select')!, { target: { value: "EXPLICIT" } });
    fireEvent.click(screen.getByText("+ Add phase"));
    expect(h.store.getState().plan?.phasing?.phases).toHaveLength(1);
    fireEvent.change(container.querySelector('[data-path="phasing.phases[0].it_load_mw"] input')!, { target: { value: "60" } });
    expect(h.dispatched).toEqual([
      { type: "setField", path: "phasing.mode", value: "EXPLICIT" },
      expect.objectContaining({ type: "applyPatch" }),
      { type: "setField", path: "phasing.phases[0].it_load_mw", value: 60 },
    ]);
    fireEvent.click(screen.getByText("Optimize phasing"));
    expect(h.optimizeCalls).toHaveLength(1);
  });

  test("the Monte Carlo toggle writes run.monte_carlo.enabled", () => {
    const h = harness();
    mount(h, <Risk />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Enable Monte Carlo/ }));
    expect(h.dispatched).toEqual([{ type: "setField", path: "run.monte_carlo.enabled", value: true }]);
  });

  test("objective select, constraint editing and Run optimize", () => {
    const h = harness();
    const { container } = mount(h, <OptimizationPanel />);
    fireEvent.change(container.querySelector('[data-path="optimization.objective.type"] select')!, { target: { value: "MIN_LCOC" } });
    fireEvent.click(screen.getByText("+ Add constraint"));
    fireEvent.change(container.querySelector('[data-path="optimization.constraints[0].value"] input')!, { target: { value: "9000000000" } });
    fireEvent.click(screen.getByText("Run optimize"));
    expect(h.dispatched[0]).toEqual({ type: "setField", path: "optimization.objective.type", value: "MIN_LCOC" });
    expect(h.dispatched[2]).toEqual({ type: "setField", path: "optimization.constraints[0].value", value: 9e9 });
    expect(h.store.getState().plan?.optimization?.constraints[0]?.metric).toBe("total_capex");
    expect(h.optimizeCalls).toHaveLength(1);
  });

  test("Apply best plan creates a pending proposal whose patch reproduces best_plan phasing + power", () => {
    const h = harness();
    mount(h, <OptimizationPanel />);
    fireEvent.click(screen.getByText("Apply best plan"));
    const proposals = h.store.getState().proposals;
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ summary: "Apply optimized phasing", status: "pending" });
    expect(proposals[0]!.patch).toContainEqual({ path: "phasing.mode", value: "EXPLICIT" });
    expect(proposals[0]!.patch).toContainEqual({ path: "phasing.phases[0].power_source_id", value: "gas" });
    expect(proposals[0]!.patch).toContainEqual({ path: "power.sources[1].type", value: "BTM_GAS" });
    expect(h.store.getState().error).toBeNull();

    h.store.dispatch({ type: "acceptProposal", id: proposals[0]!.id });
    const plan = h.store.getState().plan!;
    expect(plan.phasing?.phases.map((p) => p.energizeMonth)).toEqual([18, 30, 36]);
    expect(plan.power?.sources.map((s) => s.id)).toEqual(["grid", "gas"]);
    expect(patchFromBestPlan(loadGoldenResult().optimization!.bestPlan!)).toHaveLength(1 + 3 * 7 + 2 * 7);
  });
});
