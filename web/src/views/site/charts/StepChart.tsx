import { extent, frame, linear, plot, ticks } from "./scale";

export interface XY {
  readonly x: number;
  readonly y: number;
}

/**
 * Demand (line) vs online capacity (step) with the engine's per-month `shortfall` / `stranded`
 * series drawn as columns above / below the capacity step, so both halves of the asymmetry show.
 * All four series share the engine's month grid (`charts[demand_vs_capacity]`).
 */
export function StepChart(props: {
  demand: readonly XY[];
  capacity: readonly XY[];
  shortfall: readonly XY[];
  stranded: readonly XY[];
  xLabel: string;
  yLabel: string;
}) {
  const all = [...props.demand, ...props.capacity];
  const x = linear(extent(all.map((p) => p.x), [0, 1]), [plot.x0, plot.x1]);
  const y = linear([0, Math.max(1, ...all.map((p) => p.y)) * 1.05], [plot.y0, plot.y1]);
  const capacityAt = new Map(props.capacity.map((p) => [p.x, p.y]));

  const column = (p: XY, kind: "shortfall" | "stranded") => {
    const cap = capacityAt.get(p.x) ?? 0;
    const [top, bottom] = kind === "shortfall" ? [y(cap + p.y), y(cap)] : [y(cap), y(cap - p.y)];
    return <rect key={`${kind}${p.x}`} className={`shade ${kind}`} x={x(p.x)} y={top} width={x(p.x + 1) - x(p.x)} height={bottom - top} />;
  };

  const demandPath = props.demand.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
  const capacityPath = props.capacity.map((p, i) => (i === 0 ? `M${x(p.x)},${y(p.y)}` : `H${x(p.x)} V${y(p.y)}`)).join(" ");

  return (
    <svg className="chart step-chart" viewBox={`0 0 ${frame.w} ${frame.h}`} role="img" aria-label="demand vs capacity">
      {props.shortfall.filter((p) => p.y > 0).map((p) => column(p, "shortfall"))}
      {props.stranded.filter((p) => p.y > 0).map((p) => column(p, "stranded"))}
      {ticks(y.domain, 4).map((t) => (
        <g key={t} className="tick">
          <line x1={plot.x0} x2={plot.x1} y1={y(t)} y2={y(t)} />
          <text x={plot.x0 - 4} y={y(t) + 3} textAnchor="end">{t}</text>
        </g>
      ))}
      {ticks(x.domain, 7).map((t) => (
        <text key={t} className="tick" x={x(t)} y={frame.h - 8} textAnchor="middle">m{t}</text>
      ))}
      <path className="line demand" d={demandPath} />
      <path className="line capacity" d={capacityPath} />
      <text className="axis-label" x={plot.x1} y={frame.h - 8} textAnchor="end">{props.xLabel}</text>
      <text className="axis-label" x={plot.x0 + 4} y={plot.y1 + 8}>{props.yLabel}</text>
    </svg>
  );
}
