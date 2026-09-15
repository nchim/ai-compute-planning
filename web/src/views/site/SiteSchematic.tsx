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

/** Phase colours by order of first appearance so p1/p2/p3 stay stable across the canvas. */
export function phaseIndex(blocks: readonly Block[]): Map<string, number> {
  const ids = new Map<string, number>();
  for (const b of blocks) if (b.phaseId !== "" && !ids.has(b.phaseId)) ids.set(b.phaseId, ids.size);
  return ids;
}

function lastEnergizeMonth(schematic: Schematic): number {
  return Math.max(0, ...schematic.blocks.map((b) => b.energizeMonth));
}

/**
 * Parcel + blocks from `Result.schematic`. The time scrubber writes the month into `selection.month`
 * (so the ViewContext knows it); blocks with `energize_month` after that month are not drawn.
 */
export function SiteSchematic() {
  const { state, store } = useStore();
  const schematic = state.result?.schematic;
  const baseline = useCompareBaseline()?.result.schematic;
  if (schematic === undefined) {
    return (
      <Region id="site_schematic" title="Site schematic · phase reveal" dimensions={["space", "time"]}>
        <NotComputed what="Schematic" />
      </Region>
    );
  }
  const maxMonth = lastEnergizeMonth(schematic);
  const month = state.selection.month ?? maxMonth;
  const phases = phaseIndex(schematic.blocks);
  const visible = schematic.blocks.filter((b) => b.energizeMonth <= month);
  const setMonth = (m: number) => store.dispatch({ type: "select", selection: { ...state.selection, month: m } });

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
      <svg className="schematic" viewBox={`0 0 ${schematic.parcelWM} ${schematic.parcelHM}`} role="img" aria-label="site schematic">
        <rect className="parcel" x={0} y={0} width={schematic.parcelWM} height={schematic.parcelHM} />
        {visible.map((b) => (
          <g key={b.id} className={`block ${kindClass[b.kind]} phase-${phases.get(b.phaseId) ?? "none"}`} data-block={b.id} data-phase={b.phaseId}>
            <rect x={b.xM} y={b.yM} width={b.wM} height={b.hM} />
            <text x={b.xM + 8} y={b.yM + 22}>{b.id}</text>
          </g>
        ))}
        {baseline !== undefined && (
          <g className="baseline" aria-label="baseline footprint">
            {baseline.blocks.map((b) => <rect key={b.id} x={b.xM} y={b.yM} width={b.wM} height={b.hM} data-block={b.id} />)}
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
