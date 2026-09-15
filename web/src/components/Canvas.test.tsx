// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { StoreProvider, createStore } from "../bus";
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

  test("a rejected toggle surfaces in the error banner", () => {
    const store = mount();
    act(() => store.dispatch({ type: "toggleCompare" }));
    expect(screen.getAllByRole("alert")[0]?.textContent).toContain("no baseline");
  });
});
