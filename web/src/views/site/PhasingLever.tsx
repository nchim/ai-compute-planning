import { useStore, type PatchOp } from "../../bus";
import { PhasingModeSchema } from "../../gen/capplanner/v1/engine_pb";
import { StepChart } from "./charts/StepChart";
import { MetricTile, NotComputed, Region } from "./chrome";
import { NumberField, SelectField, TextField } from "./controls";
import { Explainer } from "./Explainer";
import { num, pct } from "./fmt";
import { chartById } from "./resultAccess";

/** Appends a phase via one atomic patch (repeated fields accept index == length). */
export function newPhasePatch(index: number, afterMonth: number): PatchOp[] {
  const p = `phasing.phases[${index}]`;
  return [
    { path: `${p}.id`, value: `p${index + 1}` },
    { path: `${p}.it_load_mw`, value: 50 },
    { path: `${p}.start_month`, value: afterMonth },
    { path: `${p}.energize_month`, value: afterMonth + 12 },
    { path: `${p}.power_source_id`, value: "grid" },
  ];
}

export function PhasingLever() {
  const { state, store } = useStore();
  const phases = state.plan?.phasing?.phases ?? [];
  const chart = chartById(state.result, "demand_vs_capacity");
  const demand = chart?.series.find((s) => s.name === "demand")?.points ?? [];
  const capacity = chart?.series.find((s) => s.name === "capacity")?.points ?? [];
  const summary = state.result?.summary;
  const lastEnergize = Math.max(0, ...phases.map((p) => p.energizeMonth));

  return (
    <Region
      id="phasing"
      title="Phasing — demand ramp vs. staged capacity"
      dimensions={["time"]}
      actions={
        <button type="button" className="btnp" onClick={() => store.optimize()}>
          Optimize phasing
        </button>
      }
    >
      <div className="two-col">
        <div>
          <SelectField path="phasing.mode" label="Mode" enum={PhasingModeSchema} />
          <div className="phase-list">
            <Explainer term="phasing.phases">Phases</Explainer>
            {phases.map((p, i) => (
              <fieldset key={i} className="phase" data-phase={p.id}>
                <legend>{p.id || `phase ${i + 1}`}</legend>
                <TextField path={`phasing.phases[${i}].id`} label="id" />
                <NumberField path={`phasing.phases[${i}].it_load_mw`} label="IT MW" />
                <NumberField path={`phasing.phases[${i}].start_month`} label="start m" integer />
                <NumberField path={`phasing.phases[${i}].energize_month`} label="energize m" integer />
                <TextField path={`phasing.phases[${i}].power_source_id`} label="power source" />
              </fieldset>
            ))}
            <button
              type="button"
              className="mini"
              disabled={state.plan === null}
              onClick={() => store.dispatch({ type: "applyPatch", patch: newPhasePatch(phases.length, lastEnergize) })}
            >
              + Add phase
            </button>
          </div>
        </div>
        <div>
          {chart === undefined ? (
            <NotComputed what="Demand vs capacity chart" />
          ) : (
            <StepChart demand={demand} capacity={capacity} xLabel={chart.meta["x"] ?? "month"} yLabel={chart.meta["y"] ?? "MW"} />
          )}
          <ul className="legend">
            <li><span className="swatch demand" /> demand</li>
            <li><span className="swatch capacity" /> phased capacity</li>
            <li><span className="swatch shortfall" /> shortfall</li>
            <li><span className="swatch stranded" /> stranded</li>
          </ul>
          {summary !== undefined && (
            <div className="tiles">
              <MetricTile metricKey="demand_capture_pct" label="demand captured" value={pct(summary.demandCapturePct)} />
              <MetricTile metricKey="shortfall_mw_months" label="shortfall MW·mo" value={num(summary.shortfallMwMonths)} />
              <MetricTile metricKey="stranded_capacity_mw_months" label="stranded MW·mo" value={num(summary.strandedCapacityMwMonths)} />
            </div>
          )}
        </div>
      </div>
    </Region>
  );
}
