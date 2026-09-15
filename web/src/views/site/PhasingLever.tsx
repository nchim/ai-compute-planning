import { useStore, type PatchOp } from "../../bus";
import { PhasingModeSchema } from "../../gen/capplanner/v1/engine_pb";
import { StepChart } from "./charts/StepChart";
import { MetricTile, NotComputed, Region, useCompareBaseline } from "./chrome";
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
  const baselineChart = chartById(useCompareBaseline()?.result ?? null, "demand_vs_capacity");
  // Engine encoding (render.go demandChart): per-month series demand / capacity / shortfall / stranded.
  const series = (name: string, from = chart) => from?.series.find((s) => s.name === name)?.points ?? [];
  const baseline = baselineChart === undefined ? undefined : { demand: series("demand", baselineChart), capacity: series("capacity", baselineChart) };
  const summary = state.result?.summary;
  const lastEnergize = Math.max(0, ...phases.map((p) => p.energizeMonth));

  return (
    <Region
      id="phasing"
      title="Phasing — demand ramp vs. staged capacity"
      dimensions={["time"]}
      actions={
        <button type="button" className="btnp" onClick={() => void store.optimize().catch(() => undefined) /* surfaced via state.error */}>
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
            <StepChart demand={series("demand")} capacity={series("capacity")} shortfall={series("shortfall")} stranded={series("stranded")} xLabel={chart.meta["x"] ?? "month"} yLabel={chart.meta["y"] ?? "MW"} {...(baseline === undefined ? {} : { baseline })} />
          )}
          <ul className="legend">
            <li><span className="swatch demand" /> demand</li>
            <li><span className="swatch capacity" /> phased capacity</li>
            <li><span className="swatch shortfall" /> shortfall</li>
            <li><span className="swatch stranded" /> stranded</li>
            {baseline !== undefined && <li><span className="swatch baseline" /> baseline</li>}
          </ul>
          {summary !== undefined && (
            <div className="tiles">
              <MetricTile metricKey="demand_capture_pct" label="demand captured" value={pct(summary.demandCapturePct)} format={pct} />
              <MetricTile metricKey="shortfall_mw_months" label="shortfall MW·mo" value={num(summary.shortfallMwMonths)} format={num} />
              <MetricTile metricKey="stranded_capacity_mw_months" label="stranded MW·mo" value={num(summary.strandedCapacityMwMonths)} format={num} />
            </div>
          )}
        </div>
      </div>
    </Region>
  );
}
