import { useStore, type PatchOp } from "../../bus";
import { PhasingMode, PhasingModeSchema } from "../../gen/capplanner/v1/engine_pb";
import { StepChart } from "./charts/StepChart";
import { MetricTile, Region, useCompareBaseline } from "./chrome";
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
  const optimizing = state.engine.optimizing;
  // OPTIMIZE is an action, not a plan state: the button runs the optimizer on a clone. A plan that
  // still carries mode=OPTIMIZE (older fixtures, an agent edit) cannot be analyzed, so offer the way out.
  const modeIsOptimize = state.plan?.phasing?.mode === PhasingMode.OPTIMIZE;
  const runOptimize = () => void store.optimize().catch(() => undefined); // failures surface via state.error

  return (
    <Region
      id="phasing"
      title="Phasing — demand ramp vs. staged capacity"
      dimensions={["time"]}
      actions={
        <button type="button" className="btnp" disabled={optimizing || state.plan === null} onClick={runOptimize} aria-busy={optimizing}>
          {optimizing ? "Optimizing…" : "Optimize phasing"}
        </button>
      }
    >
      <div className="two-col">
        <div>
          <SelectField path="phasing.mode" label="Mode" enum={PhasingModeSchema} exclude={["OPTIMIZE"]} />
          {modeIsOptimize && (
            <p className="notice" data-notice="mode-optimize">
              This plan is set to OPTIMIZE, which the analyzer cannot run. Choose a mode above or{" "}
              <button type="button" className="mini" onClick={runOptimize} disabled={optimizing}>
                run the optimizer
              </button>
              .
            </p>
          )}
          <div className="phase-list">
            <Explainer term="phasing.phases">Phases</Explainer>
            {phases.map((p, i) => (
              <fieldset key={i} className="phase" data-phase={p.id}>
                <legend>{p.id || `phase ${i + 1}`}</legend>
                <TextField path={`phasing.phases[${i}].id`} label="Phase id" />
                <NumberField path={`phasing.phases[${i}].it_load_mw`} label="IT load (MW)" />
                <NumberField path={`phasing.phases[${i}].start_month`} label="Construction start (month)" integer />
                <NumberField path={`phasing.phases[${i}].energize_month`} label="Energize (month)" integer />
                <TextField path={`phasing.phases[${i}].power_source_id`} label="Power source id" />
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
          {optimizing ? (
            <div className="running" role="status" aria-live="polite" data-running="optimize">
              <span className="spinner" aria-hidden="true" />
              <div>
                <b>Optimizing phasing…</b>
                <div className="running-sub">Enumerating phase counts and power sources, then refining sizes and timing against the demand ramp.</div>
              </div>
            </div>
          ) : chart === undefined ? (
            <div className="empty blank" data-blank="phasing">
              <b>No phasing plan yet.</b>
              <div>
                Add phases by hand (mode EXPLICIT), or let the optimizer stage capacity against the demand ramp
                {state.plan?.phasing?.policy === undefined ? " using a default policy" : " using the policy in the optimization panel"}.
              </div>
              <button type="button" className="mini" onClick={runOptimize} disabled={state.plan === null}>
                Optimize phasing
              </button>
            </div>
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
