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

/** Horizontal bars by month with a vertical energize marker (and an optional second, e.g. grid). */
export function Gantt(props: { tasks: readonly Task[]; energizeMonth?: number; gridMonth?: number }) {
  const h = props.tasks.length * rowH + 30;
  const maxMonth = Math.max(1, ...props.tasks.map((t) => t.end), props.energizeMonth ?? 0, props.gridMonth ?? 0);
  const x = linear([0, maxMonth], [labelWidth, frame.w - frame.right]);
  const marker = (month: number, cls: string, text: string) => (
    <g className={`marker ${cls}`}>
      <line x1={x(month)} x2={x(month)} y1={4} y2={h - 18} />
      <text x={x(month) + 3} y={12}>{text}</text>
    </g>
  );
  return (
    <svg className="chart gantt" viewBox={`0 0 ${frame.w} ${h}`} role="img" aria-label="critical path">
      {props.tasks.map((t, i) => (
        <g key={t.name} className="task" data-label={t.label} transform={`translate(0,${16 + i * rowH})`}>
          <text x={labelWidth - 6} y={11} textAnchor="end">{t.name}</text>
          <rect x={x(t.start)} y={2} width={Math.max(2, x(t.end) - x(t.start))} height={rowH - 8} rx={2} />
        </g>
      ))}
      {ticks([0, maxMonth], 7).map((t) => (
        <text key={t} className="tick" x={x(t)} y={h - 4} textAnchor="middle">m{t}</text>
      ))}
      {props.gridMonth !== undefined && marker(props.gridMonth, "grid", `grid ${quarterLabel(props.gridMonth)}`)}
      {props.energizeMonth !== undefined && marker(props.energizeMonth, "energize", `energize ${quarterLabel(props.energizeMonth)}`)}
    </svg>
  );
}
