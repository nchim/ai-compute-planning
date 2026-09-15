// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fromJsonString } from "@bufbuild/protobuf";

import { StoreProvider, createStore, type Command, type Store } from "../../bus";
import { fixtureJson } from "../../fixtures";
import { SitePlanSchema } from "../../gen/capplanner/v1/engine_pb";
import type { Engine } from "../../engine/client";
import { ContextMap, schematicMapProvider } from "./ContextMap";
import { loadGoldenPlan } from "./testdata";
import { FakeTileLayer, leafLayers, registry, resetFakeLeaflet, type FakeMap } from "./testdata/fakeLeaflet";

vi.mock("leaflet", async () => (await import("./testdata/fakeLeaflet")).fakeLeafletModule);
vi.mock("leaflet/dist/leaflet.css", () => ({}));

const neverEngine: Engine = {
  analyze: () => new Promise(() => undefined),
  optimize: () => new Promise(() => undefined),
  dispose() {},
};

function mount(ui: React.ReactElement = <ContextMap />) {
  const inner = createStore({ engine: neverEngine, debounceMs: 100_000 });
  inner.dispatch({ type: "loadPlan", plan: loadGoldenPlan() });
  const dispatched: Command[] = [];
  const store: Store = {
    ...inner,
    dispatch(c) {
      dispatched.push(c);
      inner.dispatch(c);
    },
  };
  const view = render(<StoreProvider store={store}>{ui}</StoreProvider>);
  return { ...view, dispatched, store };
}

const theMap = (): FakeMap => {
  expect(registry.maps).toHaveLength(1);
  return registry.maps[0]!;
};
const layersOf = (className: string) => leafLayers(theMap()).filter((l) => l.options.className === className);
const tileLayer = () => [...theMap().layers].find((l): l is FakeTileLayer => l instanceof FakeTileLayer)!;

function stubColorScheme(dark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: dark && query.includes("dark"), addEventListener() {}, removeEventListener() {} }));
}

beforeEach(() => {
  resetFakeLeaflet();
  stubColorScheme(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContextMap on the Leaflet provider", () => {
  test("uses Leaflet by default: Esri Light Gray Canvas tiles with attribution, a scale bar and the site marker with a popup", () => {
    mount();
    const map = theMap();
    expect(map.options.zoomControl).toBe(true);
    expect(tileLayer().url).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}");
    expect(tileLayer().options.maxZoom).toBe(16);
    expect(String(tileLayer().options.attribution)).toMatch(/Esri.*OpenStreetMap.*contributors/);
    expect(map.controls.some((c) => c.kind === "scale")).toBe(true);
    const [site, ...rest] = layersOf("site-marker");
    expect(rest).toHaveLength(0);
    expect(site?.latlngs).toEqual([32.45, -99.73]);
    expect(site?.popup).toMatch(/Abilene-1/);
    expect(site?.popup).toMatch(/ERCOT \/ W\. Texas · ERCOT/);
    expect(site?.popup).toMatch(/32\.45, −99\.73/);
  });

  test("picks the dark basemap under prefers-color-scheme: dark", () => {
    stubColorScheme(true);
    mount();
    expect(tileLayer().url).toContain("/World_Dark_Gray_Base/");
  });

  test("every overlay is on by default, there are no layer toggles, and the legend explains each", () => {
    mount();
    expect(layersOf("ov-power").length).toBeGreaterThan(0);
    expect(layersOf("ov-water")).toHaveLength(1);
    expect(layersOf("ov-latency").length).toBeGreaterThan(0);
    expect(screen.queryByRole("group", { name: /overlays/ })).toBeNull();
    expect(screen.getByText(/stress index 0.60/)).toBeTruthy();
    expect(screen.getByText(/serves training \(remote\)/)).toBeTruthy();
  });

  test("switching to another fixture recenters the map on the new site after invalidating its size", () => {
    const { store } = mount();
    const before = theMap().fitBoundsCalls.length;
    expect(theMap().invalidateSizeCalls).toBeGreaterThan(0);
    act(() => store.dispatch({ type: "loadPlan", plan: fromJsonString(SitePlanSchema, fixtureJson("nova-colo")) }));
    expect(theMap().fitBoundsCalls.length).toBe(before + 1);
    const [[south, west]] = theMap().fitBoundsCalls.at(-1) as [[number, number], [number, number]];
    expect(south).toBeGreaterThan(35); // Northern Virginia, not West Texas
    expect(west).toBeGreaterThan(-80);
  });

  test("latency draws nested rings at true kilometre radii and the view fits the outer ring", () => {
    mount();
    const rings = layersOf("ov-latency").filter((l) => l.kind === "circle");
    expect(rings.map((r) => r.options.radius)).toEqual([80_000, 400_000, 1_500_000]);
    expect(screen.getByText(/serves training \(remote\) · ≈1,500 km/)).toBeTruthy();
    const [[south], [north]] = theMap().fitBoundsCalls.at(-1) as [[number, number], [number, number]];
    expect(north - south).toBeCloseTo(3000 / 111.32, 3);
  });

  test("power places one illustrative marker per source with a dashed line back to the site", () => {
    mount();
    const power = layersOf("ov-power");
    expect(power.filter((l) => l.kind === "circleMarker")).toHaveLength(1);
    expect(power.filter((l) => l.kind === "polyline")).toHaveLength(1);
    expect(power.find((l) => l.kind === "polyline")!.options.dashArray).toBeTruthy();
    expect(power.find((l) => l.kind === "circleMarker")!.tooltip).toMatch(/grid · GRID 260 MW · location illustrative/);
    expect(screen.getByText(/placement illustrative/)).toBeTruthy();
  });

  test("clicking the site marker dispatches select with the site path", () => {
    const { dispatched } = mount();
    layersOf("site-marker")[0]?.fire("click");
    expect(dispatched.at(-1)).toMatchObject({ type: "select", selection: { tab: "site", path: "site" } });
  });

  test("a tile error shows the fallback notice once and keeps the vector overlays", () => {
    mount();
    expect(screen.queryByRole("status")).toBeNull();
    act(() => {
      tileLayer().fire("tileerror");
      tileLayer().fire("tileerror");
    });
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/basemap tiles unavailable/i);
    expect(layersOf("ov-power").length).toBeGreaterThan(0);
  });

  test("unmounting destroys the map instance", () => {
    const { unmount } = mount();
    unmount();
    expect(theMap().removed).toBe(true);
  });

  test("the schematic provider still renders when injected", () => {
    const { container } = mount(<ContextMap provider={schematicMapProvider} />);
    expect(container.querySelector("svg.map .ov-power")).not.toBeNull();
    expect(registry.maps).toHaveLength(0);
  });
});
