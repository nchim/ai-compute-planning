// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { create, fromJsonString } from "@bufbuild/protobuf";
import { useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CopilotHandleProvider, useRegisterCopilotSend } from "../../copilot/handle";

import { StoreProvider, createStore, type Command, type Store } from "../../bus";
import type { Engine } from "../../engine/client";
import { CellSchema, PhasingMode, ResultSchema, type Result } from "../../gen/capplanner/v1/engine_pb";
import { ContextMap } from "./ContextMap";
import { CriticalPath } from "./CriticalPath";
import { layoutMarkers } from "./charts/Gantt";
import { columnLabel, formatCell } from "./resultAccess";
import { OptimizationPanel, patchFromBestPlan } from "./OptimizationPanel";
import { PhasingLever, newPhasePatch } from "./PhasingLever";
import { ProForma } from "./ProForma";
import { Risk } from "./Risk";
import { SiteFeasibilityView } from "./SiteFeasibilityView";
import { SiteSchematic } from "./SiteSchematic";
import { loadGoldenPlan, loadGoldenResult } from "./testdata";
import novaResultJson from "../../../../engine/core/testdata/nova-colo.result.json?raw";

// jsdom cannot lay out a Leaflet map; the fake records layers instead (see ContextMap.test.tsx).
vi.mock("leaflet", async () => (await import("./testdata/fakeLeaflet")).fakeLeafletModule);
vi.mock("leaflet/dist/leaflet.css", () => ({}));

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
    expect(screen.getByText(/^OK/)).toBeTruthy();
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

  test("context map mounts the Leaflet provider with every overlay on and a legend, no toggles", () => {
    const { container } = mount(harness(), <ContextMap />);
    expect(container.querySelector(".leaflet-map")).not.toBeNull();
    expect(screen.queryByRole("group", { name: /overlays/ })).toBeNull();
    expect(screen.getByText(/stress index 0.60/)).toBeTruthy();
    expect(screen.getByText(/serves training/)).toBeTruthy();
    expect(screen.getByText(/placement illustrative/)).toBeTruthy();
  });

  test("schematic renders all blocks at the final month with the footprint badge and phase legend", () => {
    const { container } = mount(harness(), <SiteSchematic />);
    expect(container.querySelectorAll("[data-block]")).toHaveLength(9);
    expect(screen.getByText(/footprint \d+% used/)).toBeTruthy();
    expect(container.querySelectorAll(".legend li")).toHaveLength(1);
  });

  test("phasing shows the step chart with shortfall and stranded shading plus the capture metrics", () => {
    const { container } = mount(harness(), <PhasingLever />);
    expect(container.querySelector(".shade.shortfall")).not.toBeNull();
    expect(container.querySelector(".shade.stranded")).not.toBeNull();
    expect(screen.getByText("82.1%")).toBeTruthy();
  });

  test("phasing: OPTIMIZE is not a selectable mode, and a blank state explains the two ways to get phases", () => {
    const h = harness(null);
    const { container } = mount(h, <PhasingLever />);
    const options = Array.from(container.querySelectorAll("select option")).map((o) => o.getAttribute("value"));
    expect(options).toContain("EXPLICIT");
    expect(options).not.toContain("OPTIMIZE");
    const blank = container.querySelector("[data-blank='phasing']");
    expect(blank).not.toBeNull();
    fireEvent.click(within(blank as HTMLElement).getByRole("button", { name: /optimize phasing/i }));
    expect(h.optimizeCalls).toHaveLength(1);
  });

  test("phasing shows a running panel and disables the trigger while the optimizer is in flight", () => {
    const h = harness();
    const { container } = mount(h, <PhasingLever />);
    fireEvent.click(screen.getByRole("button", { name: /optimize phasing/i }));
    expect(h.store.getState().engine.optimizing).toBe(true);
    expect(container.querySelector("[data-running='optimize']")).not.toBeNull();
    expect((screen.getByRole("button", { name: /optimizing/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".shade.shortfall")).toBeNull(); // the chart yields to the running panel
  });

  test("hovering a schematic block shows its card; Explain hands the selection to the Copilot", () => {
    const h = harness();
    const sent: string[] = [];
    function Registrar() {
      const register = useRegisterCopilotSend();
      useEffect(() => register(async (t) => void sent.push(t)), [register]);
      return null;
    }
    const { container } = render(
      <StoreProvider store={h.store}>
        <CopilotHandleProvider>
          <Registrar />
          <SiteSchematic />
        </CopilotHandleProvider>
      </StoreProvider>,
    );
    expect(container.querySelector("[data-block-card]")).toBeNull();
    const hall = container.querySelector("[data-block^='hall']") as SVGGElement;
    fireEvent.mouseEnter(hall);
    const card = container.querySelector("[data-block-card]") as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toMatch(/data hall/);
    expect(card.textContent).toMatch(/energizes/);
    expect(card.textContent).toMatch(/acres/);
    fireEvent.mouseLeave(hall);
    expect(container.querySelector("[data-block-card]")).toBeNull();

    fireEvent.click(hall); // pin
    fireEvent.click(within(container.querySelector("[data-block-card]") as HTMLElement).getByRole("button", { name: /explain/i }));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/Explain the ".*" block on the site schematic/);
  });

  test("gantt markers never overlap: same month merges into one label, near months stack on two lines", () => {
    const x = (m: number) => 150 + m * 10;
    const same = layoutMarkers([{ month: 30, cls: "grid", text: "grid m30 · Q3-28" }, { month: 30, cls: "energize", text: "energize m30 · Q3-28" }], x, 700);
    expect(same).toHaveLength(1);
    expect(same[0]!.text).toBe("grid · energize m30 · Q3-28");
    expect(same[0]!.cls).toBe("grid energize");
    const near = layoutMarkers([{ month: 30, cls: "grid", text: "grid m30" }, { month: 33, cls: "energize", text: "energize m33" }], x, 700);
    expect(near.map((m) => m.line)).toEqual([0, 1]);
    const far = layoutMarkers([{ month: 12, cls: "energize", text: "energize m12" }, { month: 30, cls: "grid", text: "grid m30" }], x, 700);
    expect(far.map((m) => m.line)).toEqual([0, 0]);
    expect(layoutMarkers([{ month: 54, cls: "grid", text: "grid m54" }], x, 700)[0]!.anchorEnd).toBe(true);
  });

  test("engine table cells format by column unit and headers are humanized", () => {
    const fmt = { money: (n: number) => `$${n}`, pct: (n: number) => `${n.toFixed(1)}%`, num: (n: number) => String(n) };
    const n = (v: number) => create(CellSchema, { v: { case: "n", value: v } });
    expect(formatCell("share_pct", n(9.196811771919068), fmt)).toBe("9.2%");
    expect(formatCell("amount_usd", n(600e6), fmt)).toBe("$600000000");
    expect(formatCell("it_mw", n(200), fmt)).toBe("200 MW");
    expect(formatCell("energize_month", n(30), fmt)).toBe("m30");
    expect(formatCell("component", create(CellSchema, { v: { case: "s", value: "shell" } }), fmt)).toBe("shell");
    expect(["component", "amount_usd", "per_mw_usd", "share_pct"].map(columnLabel)).toEqual(["component", "amount", "per MW", "share"]);
  });

  test("each phase has a delete control that removes exactly that phase through the bus", () => {
    const h = harness();
    h.store.dispatch({ type: "applyPatch", patch: newPhasePatch(0, 0) });
    h.store.dispatch({ type: "applyPatch", patch: newPhasePatch(1, 12) });
    h.dispatched.length = 0;
    mount(h, <PhasingLever />);
    fireEvent.click(screen.getByRole("button", { name: /delete phase p1/ }));
    expect(h.dispatched).toEqual([{ type: "removeAt", path: "phasing.phases", index: 0 }]);
    expect(h.store.getState().plan?.phasing?.phases.map((p) => p.id)).toEqual(["p2"]);
  });

  test("schematic header states the parcel size in acres", () => {
    mount(harness(), <SiteSchematic />);
    expect(screen.getByText(/400 acres · 300 usable/)).toBeTruthy();
  });

  test("pro forma draws the annual net cashflow line from the cashflow chart", () => {
    const { container } = mount(harness(), <ProForma />);
    const net = container.querySelector(".line-chart path.line.net");
    expect(net).not.toBeNull();
    expect(net!.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/);
  });

  test("critical path renders each task and the energize + grid markers", () => {
    const { container } = mount(harness(), <CriticalPath />);
    expect(container.querySelectorAll(".task")).toHaveLength(4);
    expect(container.querySelectorAll('.task[data-kind="grid"]')).toHaveLength(2);
    // Energize and grid coincide at m30 on the golden plan: one merged marker, never two overlapping labels.
    const markers = container.querySelectorAll(".marker");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.classList.contains("grid") && markers[0]!.classList.contains("energize")).toBe(true);
    expect(screen.getByText("grid · energize m30 · Q3-28")).toBeTruthy();
  });

  test("pro forma renders the KPI tiles, the capex stack and the table", () => {
    const { container } = mount(harness(), <ProForma />);
    const tiles = within(container.querySelector(".tiles") as HTMLElement);
    expect(tiles.getByText("$2.32")).toBeTruthy();
    expect(tiles.getByText("$6.5B")).toBeTruthy();
    expect(tiles.getByText("26.4%")).toBeTruthy();
    expect(container.querySelectorAll(".stackbar rect")).toHaveLength(7);
    expect(container.querySelectorAll(".capex-table tbody tr")).toHaveLength(8);
  });

  test("risk renders the radar, Monte Carlo bands and the tornado", () => {
    const { container } = mount(harness(), <Risk />);
    expect(container.querySelectorAll(".radar text")).toHaveLength(5);
    expect(container.querySelectorAll(".bands")).toHaveLength(2);
    expect(screen.getByText("P10 $1.98")).toBeTruthy();
    expect(screen.getByText("P90 $2.46")).toBeTruthy();
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
    expect(visible).toEqual(["setback_n", "setback_s", "setback_w", "setback_e", "expansion", "expansion_e"]);
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
    expect(h.store.getState().plan?.phasing?.mode).toBe(PhasingMode.EXPLICIT); // optimize did not flip the mode
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

  test("the phasing policy editor applies defaults in one patch, then binds each field", () => {
    const h = harness();
    const { container } = mount(h, <OptimizationPanel />);
    fireEvent.click(screen.getByText(/Set default policy/));
    expect(h.dispatched).toHaveLength(1);
    expect(h.dispatched[0]).toMatchObject({ type: "applyPatch" });
    const policy = h.store.getState().plan?.phasing?.policy;
    expect([policy?.maxPhases, policy?.minPhaseMw, policy?.maxPhaseMw, policy?.minMonthsBetweenPhases, policy?.maxShortfallMw]).toEqual([4, 25, 100, 6, 200]); // shortfall cap defaults to the target MW (uncapped)
    fireEvent.change(container.querySelector('[data-path="phasing.policy.max_shortfall_mw"] input')!, { target: { value: "15" } });
    expect(h.dispatched[1]).toEqual({ type: "setField", path: "phasing.policy.max_shortfall_mw", value: 15 });
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

describe("compare mode", () => {
  /** Golden pinned as baseline, then a moved Result (LCOC/NPV worse, capture better) with compare on. */
  function compared(): Harness {
    const h = harness();
    h.store.dispatch({ type: "setBaseline", label: "golden" });
    const moved = loadGoldenResult();
    moved.summary!.lcocPerGpuHour *= 1.1;
    moved.summary!.npv -= Math.abs(moved.summary!.npv) * 0.1; // 10% worse whatever the golden's sign
    moved.summary!.demandCapturePct += 5;
    for (const p of moved.charts.find((c) => c.id === "demand_vs_capacity")!.series.find((s) => s.name === "capacity")!.points) p.y *= 0.8;
    h.store.dispatch({ type: "resultReceived", result: moved });
    h.store.dispatch({ type: "toggleCompare" });
    return h;
  }

  test("tiles show signed, coloured deltas per the glossary's betterWhen", () => {
    const { container } = mount(compared(), <ProForma />);
    const lcoc = container.querySelector('[data-metric="lcoc_per_gpu_hour"] .delta') as HTMLElement;
    expect(lcoc.className).toBe("delta worse");
    expect(lcoc.textContent).toBe(`+$${(loadGoldenResult().summary!.lcocPerGpuHour * 0.1).toFixed(2)} (+10.0%) vs. baseline`);
    const npv = container.querySelector('[data-metric="npv"] .delta') as HTMLElement;
    expect(npv.className).toBe("delta worse");
    expect(npv.textContent?.startsWith("-$")).toBe(true);
    expect(npv.textContent).toContain("(-10.0%)");
    expect((container.querySelector('[data-metric="time_to_energize_months"] .delta') as HTMLElement).className).toBe("delta same");
  });

  test("phasing shows a better-coloured capture delta and the ghosted baseline series", () => {
    const { container } = mount(compared(), <PhasingLever />);
    const capture = container.querySelector('[data-metric="demand_capture_pct"] .delta') as HTMLElement;
    expect(capture.className).toBe("delta better");
    expect(capture.textContent?.startsWith("+5.0%")).toBe(true);
    expect(container.querySelectorAll(".step-chart .line.baseline")).toHaveLength(2);
    expect(container.querySelectorAll(".step-chart .line.capacity")).toHaveLength(1);
    expect(screen.getByText("baseline")).toBeTruthy();
  });

  test("capex stack, cashflow, Monte Carlo bands and the schematic carry the baseline overlay", () => {
    const h = compared();
    const pro = mount(h, <ProForma />);
    expect(pro.container.querySelectorAll(".stackbar .baseline rect")).toHaveLength(7);
    expect(pro.container.querySelectorAll(".line-chart .line.baseline")).toHaveLength(1);
    cleanup();
    const risk = mount(h, <Risk />);
    expect(risk.container.querySelectorAll(".bands .baseline")).toHaveLength(2);
    cleanup();
    const schematic = mount(h, <SiteSchematic />);
    const blocks = h.store.getState().baseline!.result.schematic!.blocks.length;
    expect(schematic.container.querySelectorAll(".schematic .baseline rect")).toHaveLength(blocks);
    cleanup();
    mount(h, <SiteFeasibilityView />);
    expect(screen.getByText("vs. baseline: golden")).toBeTruthy();
  });

  test("with compare off (or no baseline) nothing baseline-related renders", () => {
    const h = compared();
    h.store.dispatch({ type: "toggleCompare" });
    const { container } = mount(h, <SiteFeasibilityView />);
    expect(container.querySelectorAll(".delta, .baseline, [data-baseline]")).toHaveLength(0);
  });
});

describe("schematic renders in screen pixels regardless of parcel size (#39)", () => {
  /** The golden with its schematic swapped for the nova-colo one (5 acres, 142 m; the golden is 400 acres, 1272 m). */
  function withNovaSchematic(): Result {
    const result = loadGoldenResult();
    result.schematic = fromJsonString(ResultSchema, novaResultJson).schematic;
    return result;
  }

  function labelScales(container: HTMLElement): { id: string; scale: number }[] {
    return [...container.querySelectorAll(".block .label")].map((g) => {
      const m = /scale\(([\d.e+-]+)\)/.exec(g.getAttribute("transform") ?? "");
      expect(m, `label transform ${g.getAttribute("transform")}`).not.toBeNull();
      return { id: g.closest("[data-block]")!.getAttribute("data-block")!, scale: Number(m![1]) };
    });
  }

  test("label font size on screen is the same on a 5-acre and a 400-acre parcel", () => {
    const sizes = new Set<string>();
    for (const result of [loadGoldenResult(), withNovaSchematic()]) {
      const { container } = mount(harness(result), <SiteSchematic />);
      const svg = container.querySelector("svg.schematic")!;
      const [, , w] = svg.getAttribute("viewBox")!.split(" ").map(Number);
      const pxPerM = Number(svg.getAttribute("data-px-per-m"));
      expect(pxPerM * w!, "rendered width in px").toBeGreaterThan(100);
      const labels = labelScales(container);
      expect(labels.length).toBeGreaterThan(3);
      for (const { id, scale } of labels) {
        const text = container.querySelector(`[data-block="${id}"] text`)!;
        const px = Number(text.getAttribute("font-size")) * scale * pxPerM; // screen px = font × label scale × px/m
        sizes.add(px.toFixed(3));
      }
      cleanup();
    }
    expect([...sizes]).toHaveLength(1);
  });

  test("a block narrower or shorter than its label gets no label", () => {
    const result = withNovaSchematic();
    const blocks = result.schematic!.blocks;
    blocks.find((b) => b.id === "hall_p1")!.wM = 3; // 3 m: a few px wide on any screen
    blocks.find((b) => b.id === "hall_p2")!.hM = 0.5;
    const { container } = mount(harness(result), <SiteSchematic />);
    expect(container.querySelector('[data-block="hall_p1"] text')).toBeNull();
    expect(container.querySelector('[data-block="hall_p2"] text')).toBeNull();
    expect(container.querySelector('[data-block="substation"] text')?.textContent).toBe("substation");
  });

  test("every rect and label lies inside the viewBox, and strokes do not scale with the parcel", () => {
    for (const result of [loadGoldenResult(), withNovaSchematic()]) {
      const { container } = mount(harness(result), <SiteSchematic />);
      const svg = container.querySelector("svg.schematic")!;
      const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
      for (const rect of svg.querySelectorAll("rect")) {
        const [x, y, rw, rh] = ["x", "y", "width", "height"].map((a) => Number(rect.getAttribute(a)));
        expect(x, rect.outerHTML).toBeGreaterThanOrEqual(0);
        expect(y, rect.outerHTML).toBeGreaterThanOrEqual(0);
        expect(x! + rw!, rect.outerHTML).toBeLessThanOrEqual(w! + 1e-6);
        expect(y! + rh!, rect.outerHTML).toBeLessThanOrEqual(h! + 1e-6);
        expect(rect.getAttribute("vector-effect")).toBe("non-scaling-stroke");
      }
      for (const g of svg.querySelectorAll(".label")) {
        const [tx, ty] = /translate\(([\d.e+-]+) ([\d.e+-]+)\)/.exec(g.getAttribute("transform")!)!.slice(1).map(Number);
        expect(tx).toBeGreaterThanOrEqual(0);
        expect(ty).toBeGreaterThanOrEqual(0);
        expect(tx).toBeLessThanOrEqual(w!);
        expect(ty).toBeLessThanOrEqual(h!);
      }
      expect(svg.querySelectorAll(".setback rect[fill^='url(#']").length).toBe(4);
      cleanup();
    }
  });
});
