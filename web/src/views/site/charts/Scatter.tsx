import { extent, frame, linear, plot, ticks } from "./scale";

export interface Dot {
  readonly x: number;
  readonly y: number;
  readonly feasible: boolean;
  readonly best: boolean;
  readonly title: string;
}

/** Frontier scatter: feasible candidates filled, infeasible hollow, the best one ringed. */
export function Scatter(props: { dots: readonly Dot[]; xLabel: string; yLabel: string; format?: (n: number) => string }) {
  const xs = extent(props.dots.map((d) => d.x));
  const ys = extent(props.dots.map((d) => d.y));
  const padX = (xs[1] - xs[0] || 1) * 0.1;
  const padY = (ys[1] - ys[0] || 1) * 0.1;
  const x = linear([xs[0] - padX, xs[1] + padX], [plot.x0, plot.x1]);
  const y = linear([Math.min(0, ys[0]), ys[1] + padY], [plot.y0, plot.y1]);
  const fmt = props.format ?? String;
  return (
    <svg className="chart scatter" viewBox={`0 0 ${frame.w} ${frame.h}`} role="img" aria-label="optimization frontier">
      {ticks(y.domain, 4).map((t) => (
        <g key={t} className="tick">
          <line x1={plot.x0} x2={plot.x1} y1={y(t)} y2={y(t)} />
          <text x={plot.x0 - 4} y={y(t) + 3} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      {ticks(x.domain, 5).map((t) => (
        <text key={t} className="tick" x={x(t)} y={frame.h - 8} textAnchor="middle">{t}</text>
      ))}
      {props.dots.map((d, i) => (
        <circle
          key={i}
          className={`dot ${d.feasible ? "feasible" : "infeasible"} ${d.best ? "best" : ""}`}
          cx={x(d.x)}
          cy={y(d.y)}
          r={d.best ? 7 : 4.5}
        >
          <title>{d.title}</title>
        </circle>
      ))}
      <text className="axis-label" x={plot.x1} y={frame.h - 8} textAnchor="end">{props.xLabel}</text>
      <text className="axis-label" x={plot.x0 + 4} y={plot.y1 + 8}>{props.yLabel}</text>
    </svg>
  );
}
