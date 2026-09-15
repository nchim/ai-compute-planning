import { frame, linear, ticks } from "./scale";
import { quarterLabel } from "../fmt";

export interface Task {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly label: string;
}

const labelWidth = 150;
const rowH = 22;

/** Colour family from the engine's task label: "interconnection queue (grid)", "BTM_GAS (gas)", "energize p1". */
function kindOf(task: Task): "grid" | "gas" | "energize" | "construction" {
  if (task.label.startsWith("energize")) return "energize";
  if (task.label.includes("BTM_GAS") || task.label.includes("(gas)")) return "gas";
  if (task.label.includes("(grid)") || task.label.includes("GRID")) return "grid";
  return "construction";
}

/** A vertical month marker; coincident/near markers get their labels laid out so they never overlap. */
interface Marker {
  readonly month: number;
  readonly cls: string;
  readonly text: string;
}

const labelLineH = 12;
const minLabelGapPx = 90; // labels closer than this (in px) are stacked on separate lines

/**
 * Lays markers out: same month → one merged marker ("energize · grid m30 · Q3-28"); otherwise each
 * marker gets its own line when its label would collide with a neighbour's, and a label near the right
 * edge is anchored to the left of its line.
 */
export function layoutMarkers(markers: readonly Marker[], x: (m: number) => number, rightEdge: number): readonly (Marker & { line: number; anchorEnd: boolean })[] {
  const merged = new Map<number, Marker>();
  for (const m of markers) {
    const existing = merged.get(m.month);
    merged.set(
      m.month,
      existing === undefined
        ? m
        : { month: m.month, cls: `${existing.cls} ${m.cls}`, text: `${existing.text.split(" ")[0]} · ${m.text}` },
    );
  }
  const sorted = [...merged.values()].sort((a, b) => a.month - b.month);
  return sorted.map((m, i) => ({
    ...m,
    line: i > 0 && x(m.month) - x(sorted[i - 1]!.month) < minLabelGapPx ? 1 : 0,
    anchorEnd: x(m.month) > rightEdge - 80,
  }));
}

/** Horizontal bars by month with a vertical energize marker (and an optional second, e.g. grid). */
export function Gantt(props: { tasks: readonly Task[]; energizeMonth?: number; gridMonth?: number }) {
  const maxMonth = Math.max(1, ...props.tasks.map((t) => t.end), props.energizeMonth ?? 0, props.gridMonth ?? 0);
  const x = linear([0, maxMonth], [labelWidth, frame.w - frame.right]);
  const markers = layoutMarkers(
    [
      ...(props.gridMonth !== undefined ? [{ month: props.gridMonth, cls: "grid", text: `grid m${props.gridMonth} · ${quarterLabel(props.gridMonth)}` }] : []),
      ...(props.energizeMonth !== undefined
        ? [{ month: props.energizeMonth, cls: "energize", text: `energize m${props.energizeMonth} · ${quarterLabel(props.energizeMonth)}` }]
        : []),
    ],
    x,
    frame.w - frame.right,
  );
  const labelLines = markers.some((m) => m.line > 0) ? 2 : 1;
  const top = 4 + labelLines * labelLineH;
  const h = props.tasks.length * rowH + top + 22;
  return (
    <svg className="chart gantt" viewBox={`0 0 ${frame.w} ${h}`} role="img" aria-label="critical path">
      {props.tasks.map((t, i) => (
        <g key={`${t.name}${i}`} className="task" data-kind={kindOf(t)} transform={`translate(0,${top + i * rowH})`}>
          <text x={labelWidth - 6} y={11} textAnchor="end">{t.name}</text>
          <rect x={x(t.start)} y={2} width={Math.max(2, x(t.end) - x(t.start))} height={rowH - 8} rx={2} />
        </g>
      ))}
      {ticks([0, maxMonth], 7).map((t) => (
        <text key={t} className="tick" x={x(t)} y={h - 4} textAnchor="middle">m{t}</text>
      ))}
      {markers.map((m) => (
        <g key={m.month} className={`marker ${m.cls}`} data-marker-month={m.month}>
          <line x1={x(m.month)} x2={x(m.month)} y1={top - 2} y2={h - 18} />
          <text x={x(m.month) + (m.anchorEnd ? -3 : 3)} y={12 + m.line * labelLineH} textAnchor={m.anchorEnd ? "end" : "start"}>
            {m.text}
          </text>
        </g>
      ))}
    </svg>
  );
}
