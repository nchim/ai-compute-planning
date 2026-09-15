import type { Distribution } from "../../../gen/capplanner/v1/engine_pb";
import { linear } from "./scale";

const w = 520;
const h = 90;

/**
 * Monte Carlo distribution: histogram bars with P10 / P50 / P90 markers and their values. A baseline
 * distribution, if given, contributes its band and markers ghosted (no labels) on the same scale.
 */
export function Bands(props: { label: string; dist: Distribution; baseline?: Distribution; format: (n: number) => string }) {
  const bins = props.dist.histogram;
  const b = props.baseline;
  const lo = Math.min(props.dist.p10, b?.p10 ?? Infinity, ...bins.map((x) => x.low));
  const hi = Math.max(props.dist.p90, b?.p90 ?? -Infinity, ...bins.map((x) => x.high));
  const x = linear([lo, hi], [8, w - 8]);
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const y = linear([0, maxCount], [h - 22, 6]);
  const marker = (v: number, name: string) => (
    <g className={`marker ${name}`} key={name}>
      <line x1={x(v)} x2={x(v)} y1={4} y2={h - 20} />
      <text x={x(v)} y={h - 6} textAnchor="middle">{name.toUpperCase()} {props.format(v)}</text>
    </g>
  );
  return (
    <figure className="bands" data-metric={props.label}>
      <figcaption>{props.label}</figcaption>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${props.label} P10/P50/P90`}>
        <rect className="band" x={x(props.dist.p10)} y={4} width={x(props.dist.p90) - x(props.dist.p10)} height={h - 24} />
        {bins.map((b, i) => (
          <rect key={i} className="bin" x={x(b.low)} y={y(b.count)} width={Math.max(1, x(b.high) - x(b.low) - 1)} height={h - 22 - y(b.count)} />
        ))}
        {b !== undefined && (
          <g className="baseline" aria-label="baseline">
            <rect className="band" x={x(b.p10)} y={4} width={x(b.p90) - x(b.p10)} height={h - 24} />
            {[b.p10, b.p50, b.p90].map((v, i) => <line key={i} x1={x(v)} x2={x(v)} y1={4} y2={h - 20} />)}
          </g>
        )}
        {marker(props.dist.p10, "p10")}
        {marker(props.dist.p50, "p50")}
        {marker(props.dist.p90, "p90")}
      </svg>
    </figure>
  );
}
