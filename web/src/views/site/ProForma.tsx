import { useStore } from "../../bus";
import { CoolingModeSchema, type Chart } from "../../gen/capplanner/v1/engine_pb";
import { LineChart } from "./charts/LineChart";
import { StackBar, type Segment } from "./charts/StackBar";
import { MetricTile, NotComputed, Region, useCompareBaseline } from "./chrome";
import { SelectField, SliderField } from "./controls";
import { money, num, pct, quarterLabel } from "./fmt";
import { chartById, columnLabel, formatCell, tableById } from "./resultAccess";

// Engine encoding: one series per capex component, one point per phase → sum the phases per component.
const capexSegments = (chart: Chart | undefined): Segment[] => (chart?.series ?? []).map((s) => ({ name: s.name, value: s.points.reduce((sum, p) => sum + p.y, 0) }));
const netCashflow = (chart: Chart | undefined) => chart?.series.find((s) => s.name === "net")?.points;

export function ProForma() {
  const { state } = useStore();
  const baseline = useCompareBaseline()?.result ?? null;
  const summary = state.result?.summary;
  const stack = chartById(state.result, "capex_stack");
  const baselineStack = chartById(baseline, "capex_stack");
  const table = tableById(state.result, "capex_stack");
  const cashflow = netCashflow(chartById(state.result, "cashflow"));
  const baselineCashflow = netCashflow(chartById(baseline, "cashflow"));

  return (
    <Region id="pro_forma" title="Pro forma · LCOC · master levers" dimensions={["capital"]}>
      {summary === undefined ? (
        <NotComputed what="Summary metrics" />
      ) : (
        <div className="tiles">
          <MetricTile metricKey="lcoc_per_gpu_hour" label="LCOC / GPU-hr" value={money(summary.lcocPerGpuHour)} format={money} />
          <MetricTile metricKey="total_capex" label="capex" value={money(summary.totalCapex)} sub={`${money(summary.capexPerMw)}/MW`} format={money} />
          <MetricTile metricKey="yield_on_cost_pct" label="yield-on-cost" value={pct(summary.yieldOnCostPct)} format={pct} />
          <MetricTile metricKey="npv" label="NPV" value={money(summary.npv)} format={money} />
          <MetricTile metricKey="unlevered_irr_pct" label="unlevered IRR" value={pct(summary.unleveredIrrPct)} format={pct} />
          <MetricTile metricKey="time_to_energize_months" label="time to energize" value={`m${summary.timeToEnergizeMonths}`} format={(n) => `${n} mo`} />
        </div>
      )}
      {stack === undefined ? (
        <NotComputed what="Capex stack" />
      ) : (
        <StackBar segments={capexSegments(stack)} {...(baselineStack === undefined ? {} : { baseline: capexSegments(baselineStack) })} />
      )}
      {cashflow !== undefined && (
        <>
          <LineChart label="annual net cashflow" series={cashflow} {...(baselineCashflow === undefined ? {} : { baseline: baselineCashflow })} format={(n) => money(n, 0)} xLabel="year" />
          <ul className="legend">
            <li><span className="swatch net" /> net cashflow</li>
            {baselineCashflow !== undefined && <li><span className="swatch baseline" /> baseline</li>}
          </ul>
        </>
      )}
      {table !== undefined && (
        <table className="capex-table">
          <thead>
            <tr>{table.columns.map((c) => <th key={c}>{columnLabel(c)}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.cells.map((c, j) => (
                  <td key={j} className={c.v.case === "n" ? "num" : ""}>{formatCell(table.columns[j] ?? "", c, { money, pct, num })}</td>
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
