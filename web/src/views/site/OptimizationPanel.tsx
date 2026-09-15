import { useStore, type PatchOp } from "../../bus";
import {
  CompareOpSchema,
  ObjectiveTypeSchema,
  PhasingModeSchema,
  PowerTypeSchema,
  type SitePlan,
} from "../../gen/capplanner/v1/engine_pb";
import { Scatter, type Dot } from "./charts/Scatter";
import { NotComputed, Region } from "./chrome";
import { NumberField, SelectField, TextField } from "./controls";
import { Explainer } from "./Explainer";
import { num } from "./fmt";

const enumName = (e: { values: readonly { name: string; number: number }[] }, n: number) =>
  e.values.find((v) => v.number === n)?.name ?? n;

/**
 * The patch that turns the current plan into the optimizer's `best_plan`: explicit phasing, the
 * phases themselves, and the power sources they reference. Other best_plan fields are left alone —
 * the optimizer only varies phasing + power in the POC (decision vars), so this is the whole diff.
 */
export function patchFromBestPlan(best: SitePlan): PatchOp[] {
  const ops: PatchOp[] = [{ path: "phasing.mode", value: enumName(PhasingModeSchema, best.phasing?.mode ?? 0) }];
  (best.phasing?.phases ?? []).forEach((p, i) => {
    const at = `phasing.phases[${i}]`;
    ops.push(
      { path: `${at}.id`, value: p.id },
      { path: `${at}.it_load_mw`, value: p.itLoadMw },
      { path: `${at}.start_month`, value: p.startMonth },
      { path: `${at}.energize_month`, value: p.energizeMonth },
      { path: `${at}.power_source_id`, value: p.powerSourceId },
      { path: `${at}.cooling`, value: p.cooling },
      { path: `${at}.footprint_acres`, value: p.footprintAcres },
    );
  });
  (best.power?.sources ?? []).forEach((s, i) => {
    const at = `power.sources[${i}]`;
    ops.push(
      { path: `${at}.id`, value: s.id },
      { path: `${at}.type`, value: enumName(PowerTypeSchema, s.type) },
      { path: `${at}.capacity_mw`, value: s.capacityMw },
      { path: `${at}.available_month`, value: s.availableMonth },
      { path: `${at}.cost_per_mwh`, value: s.costPerMwh },
      { path: `${at}.capex_per_kw`, value: s.capexPerKw },
      { path: `${at}.lead_time_months`, value: s.leadTimeMonths },
    );
  });
  return ops;
}

/** Sensible starting policy for the optimizer, applied atomically when the plan has none. */
export const defaultPolicyPatch: readonly PatchOp[] = [
  { path: "phasing.policy.max_phases", value: 4 },
  { path: "phasing.policy.min_phase_mw", value: 25 },
  { path: "phasing.policy.max_phase_mw", value: 100 },
  { path: "phasing.policy.min_months_between_phases", value: 6 },
  { path: "phasing.policy.max_shortfall_mw", value: 20 },
];

export function OptimizationPanel() {
  const { state, store } = useStore();
  const opt = state.plan?.optimization;
  const policy = state.plan?.phasing?.policy;
  const constraints = opt?.constraints ?? [];
  const vars = opt?.decisionVars ?? [];
  const result = state.result?.optimization;
  const best = result?.bestMetrics;
  const dots: Dot[] = (result?.frontier ?? []).map((c) => ({
    x: c.metrics?.lcocPerGpuHour ?? 0,
    y: c.metrics?.strandedCapacityMwMonths ?? 0,
    feasible: c.feasible,
    best: best !== undefined && c.metrics?.lcocPerGpuHour === best.lcocPerGpuHour && c.metrics?.strandedCapacityMwMonths === best.strandedCapacityMwMonths,
    title: Object.entries(c.decisionVarValues).map(([k, v]) => `${k}=${v}`).join(" · "),
  }));
  const apply = () => {
    if (result?.bestPlan !== undefined) store.proposeChange("Apply optimized phasing", patchFromBestPlan(result.bestPlan));
  };

  return (
    <Region
      id="optimization"
      title="Optimization · frontier"
      dimensions={["time", "capital"]}
      actions={
        <button
          type="button"
          className="btnp"
          disabled={state.engine.optimizing || state.plan === null}
          aria-busy={state.engine.optimizing}
          onClick={() => void store.optimize().catch(() => undefined) /* surfaced via state.error */}
        >
          {state.engine.optimizing ? "Optimizing…" : "Run optimize"}
        </button>
      }
    >
      <div className="two-col">
        <div>
          <SelectField path="optimization.objective.type" label="Objective" enum={ObjectiveTypeSchema} />
          <div className="phase-list" data-policy={policy === undefined ? "unset" : "set"}>
            <Explainer term="phasing.policy">Phasing policy</Explainer>
            {policy === undefined ? (
              <button type="button" className="mini" disabled={state.plan === null} onClick={() => store.dispatch({ type: "applyPatch", patch: defaultPolicyPatch })}>
                Set default policy (4 phases · 25–100 MW · ≥6 mo apart · ≤20 MW short)
              </button>
            ) : (
              <fieldset className="row3">
                <NumberField path="phasing.policy.max_phases" label="max phases" integer />
                <NumberField path="phasing.policy.min_phase_mw" label="min MW" />
                <NumberField path="phasing.policy.max_phase_mw" label="max MW" />
                <NumberField path="phasing.policy.min_months_between_phases" label="min months apart" integer />
                <NumberField path="phasing.policy.max_shortfall_mw" label="max shortfall MW" />
              </fieldset>
            )}
          </div>
          <div className="phase-list">
            <Explainer term="optimization.constraints">Constraints</Explainer>
            {constraints.map((_, i) => (
              <fieldset key={i} className="row3">
                <TextField path={`optimization.constraints[${i}].metric`} label="metric" />
                <SelectField path={`optimization.constraints[${i}].op`} label="op" enum={CompareOpSchema} />
                <NumberField path={`optimization.constraints[${i}].value`} label="value" step={1} />
              </fieldset>
            ))}
            <button
              type="button"
              className="mini"
              disabled={state.plan === null}
              onClick={() =>
                store.dispatch({
                  type: "applyPatch",
                  patch: [
                    { path: `optimization.constraints[${constraints.length}].metric`, value: "total_capex" },
                    { path: `optimization.constraints[${constraints.length}].op`, value: "LE" },
                    { path: `optimization.constraints[${constraints.length}].value`, value: 8e9 },
                  ],
                })
              }
            >
              + Add constraint
            </button>
          </div>
          <div className="phase-list">
            <Explainer term="optimization.decision_vars">Decision variables</Explainer>
            {vars.map((_, i) => (
              <fieldset key={i} className="row3">
                <TextField path={`optimization.decision_vars[${i}].input_path`} label="input path" />
                <NumberField path={`optimization.decision_vars[${i}].min`} label="min" />
                <NumberField path={`optimization.decision_vars[${i}].max`} label="max" />
                <NumberField path={`optimization.decision_vars[${i}].step`} label="step" />
              </fieldset>
            ))}
            <button
              type="button"
              className="mini"
              disabled={state.plan === null}
              onClick={() =>
                store.dispatch({
                  type: "applyPatch",
                  patch: [
                    { path: `optimization.decision_vars[${vars.length}].input_path`, value: "phasing.policy.max_phases" },
                    { path: `optimization.decision_vars[${vars.length}].min`, value: 1 },
                    { path: `optimization.decision_vars[${vars.length}].max`, value: 5 },
                    { path: `optimization.decision_vars[${vars.length}].step`, value: 1 },
                  ],
                })
              }
            >
              + Add decision var
            </button>
          </div>
        </div>
        <div>
          <Explainer term="chart.frontier">Frontier</Explainer>
          {result === undefined ? (
            <NotComputed what="Optimization" />
          ) : (
            <>
              <p className="kpi-s">
                {result.evaluations} evaluations · {result.converged ? "converged" : "not converged"}
                {best !== undefined && ` · best LCOC $${best.lcocPerGpuHour.toFixed(2)} · stranded ${num(best.strandedCapacityMwMonths)} MW·mo`}
              </p>
              <Scatter dots={dots} xLabel="LCOC $/GPU-hr" yLabel="stranded MW·mo" format={(n) => num(n)} />
              <button type="button" className="btnp" disabled={result.bestPlan === undefined} onClick={apply}>
                Apply best plan
              </button>
            </>
          )}
        </div>
      </div>
    </Region>
  );
}
