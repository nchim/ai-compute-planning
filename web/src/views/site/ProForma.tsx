import { useStore } from "../../bus";
import { CoolingModeSchema } from "../../gen/capplanner/v1/engine_pb";
import { StackBar } from "./charts/StackBar";
import { MetricTile, NotComputed, Region } from "./chrome";
import { SelectField, SliderField } from "./controls";
import { money, pct, quarterLabel } from "./fmt";
import { cellText, chartById, tableById } from "./resultAccess";

export function ProForma() {
  const { state } = useStore();
  const summary = state.result?.summary;
  const stack = chartById(state.result, "capex_stack");
  const table = tableById(state.result, "capex_stack");
  const segments = (stack?.series ?? []).flatMap((s) => (s.points[0] === undefined ? [] : [{ name: s.name, value: s.points[0].y }]));

  return (
    <Region id="pro_forma" title="Pro forma · LCOC · master levers" dimensions={["capital"]}>
      {summary === undefined ? (
        <NotComputed what="Summary metrics" />
      ) : (
        <div className="tiles">
          <MetricTile metricKey="lcoc_per_gpu_hour" label="LCOC / GPU-hr" value={money(summary.lcocPerGpuHour)} />
          <MetricTile metricKey="total_capex" label="capex" value={money(summary.totalCapex)} sub={`${money(summary.capexPerMw)}/MW`} />
          <MetricTile metricKey="yield_on_cost_pct" label="yield-on-cost" value={pct(summary.yieldOnCostPct)} />
          <MetricTile metricKey="npv" label="NPV" value={money(summary.npv)} />
          <MetricTile metricKey="unlevered_irr_pct" label="unlevered IRR" value={pct(summary.unleveredIrrPct)} />
        </div>
      )}
      {stack === undefined ? <NotComputed what="Capex stack" /> : <StackBar segments={segments} />}
      {table !== undefined && (
        <table className="capex-table">
          <thead>
            <tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.cells.map((c, j) => (
                  <td key={j}>{c.v.case === "n" && c.v.value >= 1e5 ? money(c.v.value) : cellText(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="levers">
        <SliderField path="revenue.compute.gpu_hour_price" label="GPU-hour price" min={0.5} max={6} step={0.05} format={(n) => `$${n.toFixed(2)}`} />
        <SliderField path="power.interconnection.grid_energize_month" label="Grid energize" min={0} max={84} step={1} format={(m) => `m${m} · ${quarterLabel(m)}`} />
        <SliderField path="costs.gpu.depreciation_years" label="Depreciation life" min={3} max={7} step={1} format={(n) => `${n} yr`} />
        <SliderField path="revenue.compute.utilization_pct" label="Utilization" min={30} max={100} step={1} format={(n) => pct(n, 0)} />
        <SliderField path="compute.kw_per_rack" label="Rack density" min={10} max={600} step={5} format={(n) => `${n} kW/rack`} />
        <SelectField path="compute.cooling" label="Cooling" enum={CoolingModeSchema} />
        <SliderField path="compute.pue" label="PUE" min={1.03} max={1.6} step={0.01} format={(n) => n.toFixed(2)} />
        <SliderField path="compute.target_it_load_mw" label="Target IT load" min={10} max={1000} step={10} format={(n) => `${n} MW`} />
      </div>
    </Region>
  );
}
