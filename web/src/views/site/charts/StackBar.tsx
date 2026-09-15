import { money } from "../fmt";

export interface Segment {
  readonly name: string;
  readonly value: number;
}

/** One horizontal 100% stacked bar with a legend; segment class `seg-i` picks the palette colour. */
export function StackBar(props: { segments: readonly Segment[] }) {
  const total = props.segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;
  const widths = props.segments.map((s) => (s.value / total) * 520);
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="stackbar">
      <svg viewBox="0 0 520 22" role="img" aria-label="capex stack">
        {props.segments.map((s, i) => (
          <rect key={s.name} className={`seg seg-${i}`} x={offsets[i]} y={0} width={widths[i]} height={22} />
        ))}
      </svg>
      <ul className="legend">
        {props.segments.map((s, i) => (
          <li key={s.name}>
            <span className={`swatch seg-${i}`} /> {s.name} <b>{money(s.value)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
