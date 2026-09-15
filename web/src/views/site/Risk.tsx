import { useStore } from "../../bus";
import { Bands } from "./charts/Bands";
import { Radar } from "./charts/Radar";
import { Tornado } from "./charts/Tornado";
import { MetricTile, NotComputed, Region } from "./chrome";
import { Toggle } from "./controls";
import { Explainer } from "./Explainer";
import { money, num } from "./fmt";
import { chartById } from "./resultAccess";

const bandMetrics = [
  { key: "lcoc_per_gpu_hour", label: "LCOC distribution ($/GPU-hr)", format: (n: number) => `$${n.toFixed(2)}` },
  { key: "npv", label: "NPV distribution", format: money },
] as const;

export function Risk() {
  const { state } = useStore();
  const radar = chartById(state.result, "risk_radar");
  const axes = (radar?.series[0]?.points ?? []).map((p) => ({ label: p.label, value: p.y }));
  const mc = state.result?.monteCarlo;
  const bands = bandMetrics.flatMap((m) => {
    const dist = mc?.metrics[m.key];
    return dist === undefined ? [] : [{ ...m, dist }];
  });
  const swings = (state.result?.sensitivity?.vars ?? []).map((v) => ({
    label: v.inputPath,
    target: v.targetMetric,
    low: v.lowOutput,
    high: v.highOutput,
    base: v.baseOutput,
  }));
  const summary = state.result?.summary;

  return (
    <Region id="risk" title="Risk · Monte Carlo (P10/P50/P90)" dimensions={["risk"]}>
      <div className="two-col">
        <div>
          <Explainer term="chart.risk_radar">Risk radar</Explainer>
          {radar === undefined ? <NotComputed what="Risk radar" /> : <Radar axes={axes} />}
          {summary !== undefined && (
            <div className="tiles">
              <MetricTile metricKey="composite_risk_score" label="composite risk" value={`${num(summary.compositeRiskScore)} /100`} />
              <MetricTile metricKey="utilization_breakeven_pct" label="utilization breakeven" value={`${num(summary.utilizationBreakevenPct)}%`} />
            </div>
          )}
        </div>
        <div>
          <Toggle path="run.monte_carlo.enabled" label="Enable Monte Carlo" />
          {bands.length === 0 ? (
            <NotComputed what="Monte Carlo bands" />
          ) : (
            <>
              <p className="kpi-s">{mc?.iterations ?? 0} iterations</p>
              {bands.map((b) => (
                <Bands key={b.key} label={b.label} dist={b.dist} format={b.format} />
              ))}
            </>
          )}
        </div>
      </div>
      <Explainer term="chart.tornado">Top sensitivities</Explainer>
      {swings.length === 0 ? <NotComputed what="Sensitivity" /> : <Tornado swings={swings} />}
    </Region>
  );
}
