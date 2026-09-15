import { extent, frame, linear, plot, ticks } from "./scale";
import type { XY } from "./StepChart";

/** One line series (e.g. annual net cashflow) with a zero line; the baseline series, if any, is ghosted. */
export function LineChart(props: { label: string; series: readonly XY[]; baseline?: readonly XY[]; format: (n: number) => string; xLabel: string }) {
  const all = [...props.series, ...(props.baseline ?? [])];
  const x = linear(extent(all.map((p) => p.x), [0, 1]), [plot.x0, plot.x1]);
  const [lo, hi] = extent(all.map((p) => p.y), [0, 1]);
  const y = linear([Math.min(0, lo), Math.max(0, hi) * 1.05 || 1], [plot.y0, plot.y1]);
  const path = (pts: readonly XY[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
  return (
    <svg className="chart line-chart" viewBox={`0 0 ${frame.w} ${frame.h}`} role="img" aria-label={props.label}>
      {ticks(y.domain, 4).map((t) => (
        <g key={t} className="tick">
          <line x1={plot.x0} x2={plot.x1} y1={y(t)} y2={y(t)} />
          <text x={plot.x0 - 4} y={y(t) + 3} textAnchor="end">{props.format(t)}</text>
        </g>
      ))}
      <line className="line zero" x1={plot.x0} x2={plot.x1} y1={y(0)} y2={y(0)} />
      {ticks(x.domain, 7).map((t) => (
        <text key={t} className="tick" x={x(t)} y={frame.h - 8} textAnchor="middle">{t}</text>
      ))}
      {props.baseline !== undefined && <path className="line baseline" d={path(props.baseline)} />}
      <path className="line net" d={path(props.series)} />
      <text className="axis-label" x={plot.x1} y={frame.h - 8} textAnchor="end">{props.xLabel}</text>
    </svg>
  );
}
