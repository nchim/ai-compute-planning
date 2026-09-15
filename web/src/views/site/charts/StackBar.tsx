import { money } from "../fmt";

export interface Segment {
  readonly name: string;
  readonly value: number;
}

const sum = (segments: readonly Segment[]) => segments.reduce((s, x) => s + x.value, 0);

/**
 * One horizontal stacked bar with a legend; segment class `seg-i` picks the palette colour. Alone it
 * fills the width; with a `baseline` both bars share one scale and the baseline row is ghosted below.
 */
export function StackBar(props: { segments: readonly Segment[]; baseline?: readonly Segment[] }) {
  const total = sum(props.segments);
  const baselineTotal = props.baseline === undefined ? 0 : sum(props.baseline);
  const scale = Math.max(total, baselineTotal);
  if (scale <= 0) return null;
  const row = (segments: readonly Segment[], y: number) => {
    const widths = segments.map((s) => (s.value / scale) * 520);
    const offsets = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
    return segments.map((s, i) => <rect key={s.name} className={`seg seg-${i}`} x={offsets[i]} y={y} width={widths[i]} height={22} />);
  };
  const withBaseline = props.baseline !== undefined;
  return (
    <div className={`stackbar${withBaseline ? " with-baseline" : ""}`}>
      <svg viewBox={`0 0 520 ${withBaseline ? 48 : 22}`} role="img" aria-label="capex stack">
        {row(props.segments, 0)}
        {props.baseline !== undefined && <g className="baseline" aria-label="baseline">{row(props.baseline, 26)}</g>}
      </svg>
      <ul className="legend">
        {props.segments.map((s, i) => (
          <li key={s.name}>
            <span className={`swatch seg-${i}`} /> {s.name} <b>{money(s.value)}</b>
          </li>
        ))}
        {withBaseline && (
          <li>
            <span className="swatch baseline" /> baseline <b>{money(baselineTotal)}</b>
          </li>
        )}
      </ul>
    </div>
  );
}
