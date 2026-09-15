// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";

import { RAIL_DEFAULT_PX, RAIL_MAX_PX, RAIL_MIN_PX, RailResizer, useRailWidth } from "./RailResizer";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

test("useRailWidth clamps, persists and restores", () => {
  const { result } = renderHook(() => useRailWidth());
  expect(result.current[0]).toBe(RAIL_DEFAULT_PX);
  act(() => result.current[1](10_000));
  expect(result.current[0]).toBe(RAIL_MAX_PX);
  act(() => result.current[1](10));
  expect(result.current[0]).toBe(RAIL_MIN_PX);
  act(() => result.current[1](400));
  expect(window.localStorage.getItem("rail.width")).toBe("400");
  const again = renderHook(() => useRailWidth());
  expect(again.result.current[0]).toBe(400);
});

test("dragging the separator resizes; double-click resets; arrow keys nudge", () => {
  const seen: number[] = [];
  const { getByRole } = render(<RailResizer width={320} onResize={(px) => seen.push(px)} />);
  const sep = getByRole("separator");
  Object.assign(sep, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false });
  fireEvent.pointerDown(sep, { pointerId: 1, clientX: 320 });
  fireEvent.pointerMove(sep, { pointerId: 1, clientX: 450 });
  fireEvent.pointerUp(sep, { pointerId: 1 });
  fireEvent.pointerMove(sep, { pointerId: 1, clientX: 600 }); // after release: ignored
  fireEvent.doubleClick(sep);
  fireEvent.keyDown(sep, { key: "ArrowRight" });
  expect(seen).toEqual([450, RAIL_DEFAULT_PX, 336]);
});
