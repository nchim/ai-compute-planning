import { useCallback, useEffect, useRef, useState } from "react";

export const RAIL_MIN_PX = 280;
export const RAIL_MAX_PX = 720;
export const RAIL_DEFAULT_PX = 320;
const STORAGE_KEY = "rail.width";

/** The persisted rail width, clamped; falls back to the default when storage is unavailable. */
export function useRailWidth(): [number, (px: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(stored) && stored > 0 ? clamp(stored) : RAIL_DEFAULT_PX;
    } catch {
      return RAIL_DEFAULT_PX;
    }
  });
  const update = useCallback((px: number) => {
    const next = clamp(px);
    setWidth(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Per-viewer convenience only; a blocked storage just means the width resets next load.
    }
  }, []);
  return [width, update];
}

function clamp(px: number): number {
  return Math.min(RAIL_MAX_PX, Math.max(RAIL_MIN_PX, Math.round(px)));
}

/**
 * Drag handle between the Copilot rail and the canvas. Pointer events are captured so a fast drag
 * past the handle keeps resizing; double-click restores the default width; arrow keys nudge it.
 */
export function RailResizer(props: { width: number; onResize: (px: number) => void }) {
  const dragging = useRef(false);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) props.onResize(e.clientX);
  };
  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") props.onResize(props.width - 16);
    if (e.key === "ArrowRight") props.onResize(props.width + 16);
  };
  useEffect(() => {
    document.body.classList.toggle("rail-resizing", dragging.current);
  });
  return (
    <div
      className="rail-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Copilot panel"
      aria-valuenow={props.width}
      aria-valuemin={RAIL_MIN_PX}
      aria-valuemax={RAIL_MAX_PX}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={() => props.onResize(RAIL_DEFAULT_PX)}
      onKeyDown={onKeyDown}
    />
  );
}
