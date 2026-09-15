import { useEffect, useId, useRef, useState, type RefObject } from "react";

import { useStore } from "../../bus";
import { useCopilotSend } from "../../copilot/handle";
import { BlockKind, type Block, type Schematic } from "../../gen/capplanner/v1/engine_pb";
import { num, quarterLabel } from "./fmt";
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
const kindLabel: Record<BlockKind, string> = {
  [BlockKind.BLOCK_UNSPECIFIED]: "block",
  [BlockKind.DATA_HALL]: "data hall",
  [BlockKind.SUBSTATION]: "substation / switchyard",
  [BlockKind.COOLING_YARD]: "cooling yard",
  [BlockKind.GAS_PAD]: "gas generation pad",
  [BlockKind.EXPANSION_PAD]: "expansion pad (reserved)",
  [BlockKind.WATER]: "water",
  [BlockKind.SETBACK]: "setback",
};
const sqmPerAcre = 4046.86;

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
  // Hovering previews a block's card; clicking pins it so the Explain link can be reached.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
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
  const focusId = pinned ?? hovered;
  const focused = focusId === null ? undefined : schematic.blocks.find((b) => b.id === focusId);

  return (
    <Region
      id="site_schematic"
      title="Site schematic · phase reveal"
      dimensions={["space", "time"]}
      actions={
        <>
          <span className="chip" data-metric="parcel_acres">
            {num(state.plan?.site?.landAcres ?? 0)} acres · {num(state.plan?.site?.usableAcres ?? 0)} usable
          </span>
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
          <g
            key={b.id}
            className={`block ${kindClass[b.kind]} phase-${phases.get(b.phaseId) ?? "none"}${focusId === b.id ? " focused" : ""}`}
            data-block={b.id}
            data-phase={b.phaseId}
            onMouseEnter={() => setHovered(b.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => setPinned((p) => (p === b.id ? null : b.id))}
            tabIndex={0}
            onFocus={() => setHovered(b.id)}
            onBlur={() => setHovered(null)}
            role="button"
            aria-label={`${kindLabel[b.kind]} ${b.id}`}
          >
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
      {focused !== undefined ? (
        <BlockCard block={focused} schematic={schematic} pinned={pinned === focused.id} onUnpin={() => setPinned(null)} />
      ) : (
        <p className="block-hint">Hover a block for details; click to pin it.</p>
      )}
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

/** Details for one block, and an "Explain" link that hands the selection to the Copilot. */
function BlockCard(props: { block: Block; schematic: Schematic; pinned: boolean; onUnpin: () => void }) {
  const { state } = useStore();
  const send = useCopilotSend();
  const b = props.block;
  const acres = (b.wM * b.hM) / sqmPerAcre;
  const parcelAcres = (props.schematic.parcelWM * props.schematic.parcelHM) / sqmPerAcre;
  const phase = state.plan?.phasing?.phases.find((p) => p.id === b.phaseId);
  // A single-shot build has no explicit phases: the engine's one phase carries the whole target.
  const phaseMw = phase?.itLoadMw ?? (b.phaseId !== "" ? state.plan?.compute?.targetItLoadMw : undefined);
  const totalMw = state.result?.summary?.mwOnlineFinal ?? 0;
  const racks = state.result?.summary?.extra["racks"];
  const hallRacks = b.kind === BlockKind.DATA_HALL && racks !== undefined && totalMw > 0 && phaseMw !== undefined ? Math.round((racks * phaseMw) / totalMw) : undefined;
  const explain = () =>
    send?.(
      `Explain the "${b.id}" block on the site schematic (${kindLabel[b.kind]}${b.phaseId ? `, phase ${b.phaseId}` : ""}, energizes month ${b.energizeMonth}, ` +
        `${b.wM.toFixed(0)}×${b.hM.toFixed(0)} m ≈ ${acres.toFixed(1)} acres): what it is, how it was sized, and what drives it.`,
    ).catch(() => undefined); // failures surface in the rail
  return (
    <div className={`block-card${props.pinned ? " pinned" : ""}`} data-block-card={b.id} role="group" aria-label={`details for ${b.id}`}>
      <div className="block-card-hd">
        <b>{b.id}</b>
        <span className="chip">{kindLabel[b.kind]}</span>
        {props.pinned && (
          <button type="button" className="x" aria-label="unpin" onClick={props.onUnpin}>
            ×
          </button>
        )}
      </div>
      <dl>
        {b.phaseId !== "" && (
          <>
            <dt>phase</dt>
            <dd>{b.phaseId}{phaseMw !== undefined && ` · ${num(phaseMw)} MW IT`}</dd>
          </>
        )}
        {b.kind !== BlockKind.SETBACK && b.kind !== BlockKind.EXPANSION_PAD && (
          <>
            <dt>energizes</dt>
            <dd>m{b.energizeMonth} · {quarterLabel(b.energizeMonth)}</dd>
          </>
        )}
        <dt>footprint</dt>
        <dd>
          {b.wM.toFixed(0)} × {b.hM.toFixed(0)} m · {acres.toFixed(1)} acres ({parcelAcres > 0 ? ((100 * acres) / parcelAcres).toFixed(1) : "—"}% of parcel)
        </dd>
        {hallRacks !== undefined && (
          <>
            <dt>racks</dt>
            <dd>≈ {num(hallRacks)}</dd>
          </>
        )}
      </dl>
      <button type="button" className="mini explain" disabled={send === null} title={send === null ? "Copilot not available" : "Ask the Copilot about this block"} onClick={explain}>
        Explain →
      </button>
    </div>
  );
}
