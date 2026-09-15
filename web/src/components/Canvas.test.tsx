// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { StoreProvider, createStore } from "../bus";
import type { Engine } from "../engine/client";
import { fixtureJson } from "../fixtures";
import { ResultSchema, SitePlanSchema, Status, type Result } from "../gen/capplanner/v1/engine_pb";
import { create, fromJsonString } from "@bufbuild/protobuf";
import { createFakeEngine } from "../engine";
import { fixtureNames } from "../fixtures";
import { Canvas } from "./Canvas";

afterEach(cleanup);

function mount() {
  const store = createStore({ engine: createFakeEngine(), debounceMs: 0 });
  render(
    <StoreProvider store={store}>
      <Canvas />
    </StoreProvider>,
  );
  return store;
}

describe("baseline toolbar", () => {
  test("Compare stays disabled until a baseline is pinned; pinning labels it from the scenario name", async () => {
    const store = mount();
    const setBaseline = screen.getByRole("button", { name: "Set as baseline" });
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(setBaseline.hasAttribute("disabled")).toBe(true);
    expect(compare.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByRole("combobox", { name: "Load fixture" }), { target: { value: "abilene-1" } });
    await store.whenIdle();
    expect(setBaseline.hasAttribute("disabled")).toBe(false);
    fireEvent.click(setBaseline);
    expect(store.getState().baseline?.label).toBe("Grid-only single shot");
    expect(screen.getByText("Grid-only single shot")).toBeTruthy();

    expect(compare.hasAttribute("disabled")).toBe(false);
    fireEvent.click(compare);
    expect(compare.getAttribute("aria-pressed")).toBe("true");
    expect(store.getState().compare).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "clear baseline" }));
    expect(store.getState().baseline).toBeNull();
    expect(compare.hasAttribute("disabled")).toBe(true);
    expect(store.getLog().map((e) => e.command.type)).toContain("clearBaseline");
  });

  test("the fixture dropdown lists every fixtures/*.json and loads the chosen one", async () => {
    const store = mount();
    const select = screen.getByRole("combobox", { name: "Load fixture" });
    const names = [...select.querySelectorAll("option")].map((o) => o.value).filter((v) => v !== "");
    expect(names).toEqual(fixtureNames);
    expect(names).toContain("nova-colo");
    fireEvent.change(select, { target: { value: "epoch-100mw" } });
    await store.whenIdle();
    expect(store.getState().plan?.meta?.planId).toBe("epoch-100mw");
    expect((select as HTMLSelectElement).value).toBe("");
  });

  test("the engine badge and progress bar show while an analyze is pending, from any driver", async () => {
    let resolveAnalyze: ((r: Result) => void) | null = null;
    const engine: Engine = {
      analyze: () => new Promise<Result>((resolve) => (resolveAnalyze = resolve)),
      optimize: () => new Promise<Result>(() => undefined),
      dispose() {},
    };
    const store = createStore({ engine, debounceMs: 0 });
    const { container } = render(
      <StoreProvider store={store}>
        <Canvas />
      </StoreProvider>,
    );
    expect(screen.getByRole("status").getAttribute("data-activity")).toBe("idle");

    act(() => store.dispatch({ type: "loadPlan", plan: fromJsonString(SitePlanSchema, fixtureJson("abilene-1")) }));
    expect(screen.getByRole("status").getAttribute("data-activity")).toBe("analyzing");
    expect(container.querySelector(".engine-progress")).not.toBeNull();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // let the 0 ms debounce fire
      resolveAnalyze?.(create(ResultSchema, { status: Status.OK }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole("status").getAttribute("data-activity")).toBe("idle");
    expect(container.querySelector(".engine-progress")).toBeNull();
  });

  test("the canvas shows only the latest proposal's headline, never the patch", () => {
    const store = mount();
    act(() => store.dispatch({ type: "loadPlan", plan: fromJsonString(SitePlanSchema, fixtureJson("abilene-1")) }));
    act(() => {
      store.proposeChange("first idea", [{ path: "compute.pue", value: 1.3 }]);
      store.proposeChange("Switch to 3-phase build", [{ path: "phasing.mode", value: "EXPLICIT" }, { path: "phasing.phases[0].id", value: "p1" }]);
    });
    const panel = document.querySelector("[data-panel='proposal']") as HTMLElement;
    expect(panel.querySelectorAll("[data-proposal-id]")).toHaveLength(1);
    expect(panel.textContent).toContain("Switch to 3-phase build");
    expect(panel.textContent).toContain("2 changes");
    expect(panel.textContent).not.toContain("first idea");
    expect(panel.textContent).not.toContain("phasing.mode");
    expect(panel.textContent).toContain("1 earlier in the Copilot thread");
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(panel.textContent).toContain("Accepted");
  });

  test("a rejected toggle surfaces in the error banner", () => {
    const store = mount();
    act(() => store.dispatch({ type: "toggleCompare" }));
    expect(screen.getAllByRole("alert")[0]?.textContent).toContain("no baseline");
  });
});
