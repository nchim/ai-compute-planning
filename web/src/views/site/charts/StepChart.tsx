import { extent, frame, linear, plot, ticks } from "./scale";

export interface XY {
  readonly x: number;
  readonly y: number;
}

/** Piecewise-linear demand at month m. */
function interpolate(points: readonly XY[], m: number): number {
  const first = points[0];
  if (first === undefined) return 0;
  if (m <= first.x) return first.y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as XY;
    const b = points[i] as XY;
    if (m <= b.x) return a.y + ((m - a.x) / (b.x - a.x || 1)) * (b.y - a.y);
  }
  return (points[points.length - 1] as XY).y;
}

/** Step capacity at month m: the last point at or before m. */
function stepAt(points: readonly XY[], m: number): number {
  let y = 0;
  for (const p of points) if (p.x <= m) y = p.y;
  return y;
}

/**
 * Demand ramp (line) vs staged capacity (step). Month-by-month columns shade shortfall
 * (demand > capacity) and stranded (capacity > demand) so both halves of the asymmetry are visible.
 */
export function StepChart(props: { demand: readonly XY[]; capacity: readonly XY[]; xLabel: string; yLabel: string }) {
  const all = [...props.demand, ...props.capacity];
  const x = linear(extent(all.map((p) => p.x), [0, 1]), [plot.x0, plot.x1]);
  const y = linear([0, Math.max(1, ...all.map((p) => p.y)) * 1.05], [plot.y0, plot.y1]);
  const [m0, m1] = x.domain;

  const columns = [];
  for (let m = m0; m < m1; m++) {
    const d = interpolate(props.demand, m + 0.5);
    const c = stepAt(props.capacity, m + 0.5);
    if (d === c) continue;
    columns.push({ m, kind: d > c ? "shortfall" : "stranded", top: y(Math.max(d, c)), bottom: y(Math.min(d, c)) });
  }

  const demandPath = props.demand.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x)},${y(p.y)}`).join(" ");
  const capacityPath = props.capacity
    .map((p, i) => (i === 0 ? `M${x(p.x)},${y(p.y)}` : `H${x(p.x)} V${y(p.y)}`))
    .join(" ");

  return (
    <svg className="chart step-chart" viewBox={`0 0 ${frame.w} ${frame.h}`} role="img" aria-label="demand vs capacity">
      {columns.map((c) => (
        <rect key={c.m} className={`shade ${c.kind}`} x={x(c.m)} y={c.top} width={x(c.m + 1) - x(c.m)} height={c.bottom - c.top} />
      ))}
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
