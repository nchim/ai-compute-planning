export interface Axis {
  readonly label: string;
  readonly value: number; // 0..100
}

const size = 220;
const cx = size / 2;
const cy = size / 2;
const r = 78;

function polar(i: number, n: number, radius: number): [number, number] {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

/** Radar of 0..100 scores; the area polygon is the profile, rings at 25/50/75/100. */
export function Radar(props: { axes: readonly Axis[] }) {
  const n = props.axes.length;
  if (n < 3) return null;
  const ring = (frac: number) => props.axes.map((_, i) => polar(i, n, r * frac).join(",")).join(" ");
  const shape = props.axes.map((a, i) => polar(i, n, (r * Math.min(100, Math.max(0, a.value))) / 100).join(",")).join(" ");
  return (
    <svg className="chart radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="risk radar">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} className="ring" points={ring(f)} />
      ))}
      {props.axes.map((a, i) => {
        const [x, y] = polar(i, n, r);
        const [lx, ly] = polar(i, n, r + 16);
        return (
          <g key={a.label}>
            <line className="spoke" x1={cx} y1={cy} x2={x} y2={y} />
            <text x={lx} y={ly + 3} textAnchor="middle">{a.label}</text>
          </g>
        );
      })}
      <polygon className="area" points={shape} />
    </svg>
  );
}
