export interface Swing {
  readonly label: string;
  readonly target: string;
  readonly low: number;
  readonly high: number;
  readonly base: number;
}

const labelWidth = 200;
const rowH = 22;
const w = 520;

/** Tornado: per input, the relative swing of its target metric at -delta (low) and +delta (high). */
export function Tornado(props: { swings: readonly Swing[] }) {
  const rel = (s: Swing, v: number) => (s.base === 0 ? 0 : (v - s.base) / Math.abs(s.base));
  const maxAbs = Math.max(0.01, ...props.swings.flatMap((s) => [Math.abs(rel(s, s.low)), Math.abs(rel(s, s.high))]));
  const mid = labelWidth + (w - labelWidth) / 2;
  const half = (w - labelWidth) / 2 - 8;
  const px = (fraction: number) => mid + (fraction / maxAbs) * half;
  const h = props.swings.length * rowH + 8;
  return (
    <svg className="chart tornado" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="sensitivity tornado">
      <line className="axis" x1={mid} x2={mid} y1={0} y2={h} />
      {props.swings.map((s, i) => {
        const y = 4 + i * rowH;
        const bar = (v: number, cls: string) => {
          const f = rel(s, v);
          return <rect className={`bar ${cls}`} x={Math.min(mid, px(f))} y={y + 3} width={Math.abs(px(f) - mid)} height={rowH - 8} />;
        };
        return (
          <g key={`${s.target}:${s.label}`} data-input={s.label} data-target={s.target}>
            <text x={labelWidth - 6} y={y + 14} textAnchor="end">{s.label} <tspan className="muted">→ {s.target}</tspan></text>
            {bar(s.low, "low")}
            {bar(s.high, "high")}
          </g>
        );
      })}
    </svg>
  );
}
