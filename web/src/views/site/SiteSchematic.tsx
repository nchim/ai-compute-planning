import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { useStore } from "../../bus";
import { BlockKind, type Block, type Schematic } from "../../gen/capplanner/v1/engine_pb";
import { quarterLabel } from "./fmt";
import { NotComputed, Region, useCompareBaseline } from "./chrome";

const kindClass: Record<BlockKind, string> = {
  [BlockKind.BLOCK_UNSPECIFIED]: "unspecified",
  [BlockKind.DATA_HALL]: "data-hall",
  [BlockKind.SUBSTATION]: "substation",
  [BlockKind.COOLING_YARD]: "cooling-yard",
  [BlockKind.GAS_PAD]: "gas-pad",
  [BlockKind.EXPANSION_PAD]: "expansion-pad",
  [BlockKind.WATER]: "water",
  [BlockKind.SETBACK]: "setback",
};

/** Screen-pixel typography: the SVG's user unit is the metre, so these are converted per render. */
const labelFontPx = 11;
const labelPadPx = 6;
const labelCharWidth = 0.62; // em per character, a safe estimate for the 600-weight UI font
const hatchPitchPx = 7;
/** Width assumed until the SVG has been measured (and under jsdom, which never lays out). */
const fallbackWidthPx = 640;

/** Phase colours by order of first appearance so p1/p2/p3 stay stable across the canvas. */
export function phaseIndex(blocks: readonly Block[]): Map<string, number> {
  const ids = new Map<string, number>();
  for (const b of blocks) if (b.phaseId !== "" && !ids.has(b.phaseId)) ids.set(b.phaseId, ids.size);
  return ids;
}

function lastEnergizeMonth(schematic: Schematic): number {
  return Math.max(0, ...schematic.blocks.map((b) => b.energizeMonth));
}

/** The element's rendered width in CSS px, tracked through resizes; `fallbackWidthPx` until measured. */
function useRenderedWidth(ref: RefObject<SVGSVGElement | null>): number {
  const [width, setWidth] = useState(fallbackWidthPx);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A label fits when the block, in screen px, is wider than the estimated text and taller than a line. */
function labelFits(b: Block, pxPerM: number): boolean {
  const textPx = b.id.length * labelCharWidth * labelFontPx;
  return b.wM * pxPerM >= textPx + 2 * labelPadPx && b.hM * pxPerM >= labelFontPx + 2 * labelPadPx;
}

/**
 * Parcel + blocks from `Result.schematic`. The time scrubber writes the month into `selection.month`
 * (so the ViewContext knows it); blocks with `energize_month` after that month are not drawn.
 *
 * The viewBox is in metres, so strokes use `non-scaling-stroke` and each label sits in a group
 * counter-scaled to 1 px units: text and lines stay the same size on a 5-acre and a 400-acre parcel.
 */
export function SiteSchematic() {
  const { state, store } = useStore();
  const schematic = state.result?.schematic;
  const baseline = useCompareBaseline()?.result.schematic;
  const svgRef = useRef<SVGSVGElement>(null);
  const widthPx = useRenderedWidth(svgRef);
  const hatchId = useId();
  if (schematic === undefined) {
    return (
      <Region id="site_schematic" title="Site schematic · phase reveal" dimensions={["space", "time"]}>
        <NotComputed what="Schematic" />
      </Region>
    );
  }
  const pxPerM = widthPx / schematic.parcelWM;
  const mPerPx = 1 / pxPerM;
  const maxMonth = lastEnergizeMonth(schematic);
  const month = state.selection.month ?? maxMonth;
  const phases = phaseIndex(schematic.blocks);
  const visible = schematic.blocks.filter((b) => b.energizeMonth <= month);
  const setMonth = (m: number) => store.dispatch({ type: "select", selection: { ...state.selection, month: m } });
  const hatchPitch = hatchPitchPx * mPerPx;

  return (
    <Region
      id="site_schematic"
      title="Site schematic · phase reveal"
      dimensions={["space", "time"]}
      actions={
        <>
          <span className="chip" data-metric="footprint_used_pct">footprint {schematic.footprintUsedPct.toFixed(0)}% used</span>
          {baseline !== undefined && <span className="chip" data-metric="baseline_footprint_used_pct">baseline {baseline.footprintUsedPct.toFixed(0)}%</span>}
        </>
      }
    >
      <svg
        ref={svgRef}
        className="schematic"
        viewBox={`0 0 ${schematic.parcelWM} ${schematic.parcelHM}`}
        preserveAspectRatio="xMidYMid meet"
        data-px-per-m={pxPerM}
        role="img"
        aria-label="site schematic"
      >
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width={hatchPitch} height={hatchPitch} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={hatchPitch} className="hatch" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect className="parcel" x={0} y={0} width={schematic.parcelWM} height={schematic.parcelHM} vectorEffect="non-scaling-stroke" />
        {visible.map((b) => (
          <g key={b.id} className={`block ${kindClass[b.kind]} phase-${phases.get(b.phaseId) ?? "none"}`} data-block={b.id} data-phase={b.phaseId}>
            <rect
              x={b.xM}
              y={b.yM}
              width={b.wM}
              height={b.hM}
              vectorEffect="non-scaling-stroke"
              {...(b.kind === BlockKind.SETBACK ? { fill: `url(#${hatchId})` } : {})}
            />
            {labelFits(b, pxPerM) && (
              <g className="label" transform={`translate(${b.xM} ${b.yM}) scale(${mPerPx})`}>
                <text x={labelPadPx} y={labelPadPx + labelFontPx} fontSize={labelFontPx}>{b.id}</text>
              </g>
            )}
          </g>
        ))}
        {baseline !== undefined && (
          <g className="baseline" aria-label="baseline footprint">
            {baseline.blocks.map((b) => <rect key={b.id} x={b.xM} y={b.yM} width={b.wM} height={b.hM} data-block={b.id} vectorEffect="non-scaling-stroke" />)}
          </g>
        )}
      </svg>
      <div className="scrubber">
        <input
          type="range"
          aria-label="time scrubber (month)"
          min={0}
          max={maxMonth}
          step={1}
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        />
        <span className="chip">m{month} · {quarterLabel(month)}</span>
      </div>
      <ul className="legend">
        {[...phases].map(([id, i]) => (
          <li key={id}><span className={`swatch phase-${i}`} /> {id}</li>
        ))}
        {baseline !== undefined && <li><span className="swatch baseline" /> baseline footprint</li>}
      </ul>
    </Region>
  );
}
