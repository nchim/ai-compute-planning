import { describe, expect, test } from "vitest";

import { LatencyClass, PowerType } from "../../gen/capplanner/v1/engine_pb";
import { latencyRings, offsetKm, powerSourcePlacement, ringBounds } from "./geo";

const abilene = { lat: 32.45, lng: -99.73 };

describe("geo helpers", () => {
  test("offsetKm moves due north by one degree per 111.32 km and scales longitude by cos(lat)", () => {
    const north = offsetKm(abilene, 0, 111.32);
    expect(north.lat).toBeCloseTo(33.45, 6);
    expect(north.lng).toBeCloseTo(abilene.lng, 6);
    const east = offsetKm({ lat: 60, lng: 0 }, 90, 111.32);
    expect(east.lat).toBeCloseTo(60, 6);
    expect(east.lng).toBeCloseTo(2, 3); // cos(60°) = 0.5 → twice the degrees
  });

  test("ringBounds is the square that contains a ring of the given radius", () => {
    const [[s, w], [n, e]] = ringBounds(abilene, 111.32);
    expect(n - s).toBeCloseTo(2, 6);
    expect(e - w).toBeGreaterThan(2); // longitude degrees are shorter than latitude degrees off the equator
    expect((n + s) / 2).toBeCloseTo(abilene.lat, 6);
    expect((e + w) / 2).toBeCloseTo(abilene.lng, 6);
  });

  test("latency rings nest: every tier the site can serve up to its own, in km", () => {
    const km = (tier: LatencyClass) => latencyRings(tier).map((r) => r.km);
    expect(km(LatencyClass.INFERENCE_METRO)).toEqual([80]);
    expect(km(LatencyClass.INFERENCE_REGIONAL)).toEqual([80, 400]);
    expect(km(LatencyClass.TRAINING_REMOTE)).toEqual([80, 400, 1500]);
    expect(latencyRings(LatencyClass.TRAINING_REMOTE).at(-1)?.tier).toBe(LatencyClass.TRAINING_REMOTE);
    expect(km(LatencyClass.LATENCY_UNSPECIFIED)).toEqual([]);
  });

  test("power sources get a distinct schematic bearing each and a distance by type", () => {
    const grid = powerSourcePlacement(abilene, 0, PowerType.GRID);
    const gas = powerSourcePlacement(abilene, 1, PowerType.BTM_GAS);
    expect(grid.bearingDeg).not.toBe(gas.bearingDeg);
    expect(grid.km).toBeGreaterThan(gas.km); // a BTM plant sits on or next to the parcel; a grid tie is a line away
    expect(grid.at.lat).not.toBeCloseTo(abilene.lat, 3);
  });
});
