import type { ReactNode } from "react";

import { useStore } from "../../bus";
import { Severity, type Diagnostic } from "../../gen/capplanner/v1/engine_pb";
import { Explainer } from "./Explainer";
import { diagnosticsAt } from "./resultAccess";

export type Dimension = "space" | "time" | "capital" | "risk";

const dimensionLabel: Record<Dimension, string> = { space: "Space", time: "Time", capital: "Capital", risk: "Risk" };

export function DimensionChip(props: { dimension: Dimension }) {
  return (
    <span className="dim" data-dimension={props.dimension}>
      <span className={`dot d-${props.dimension}`} />
      {dimensionLabel[props.dimension]}
    </span>
  );
}

/** One canvas region: uppercase title, glossary explainer, dimension chips, optional header actions. */
export function Region(props: {
  id: string;
  title: string;
  dimensions: readonly Dimension[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel" data-region={props.id} aria-label={props.title}>
      <header className="panel-hd">
        <span className="t">{props.title}</span>
        <Explainer term={`region.${props.id}`} />
        {props.dimensions.map((d) => (
          <DimensionChip key={d} dimension={d} />
        ))}
        {props.actions !== undefined && <span className="actions">{props.actions}</span>}
      </header>
      {props.children}
    </section>
  );
}

/** Neutral state for a Result section the engine has not produced (never a crash, never a fake number). */
export function NotComputed(props: { what: string }) {
  return <p className="empty">{props.what} not computed yet</p>;
}

export function MetricTile(props: { metricKey: string; label: string; value: string; sub?: string }) {
  return (
    <div className="tile" data-metric={props.metricKey}>
      <div className="kpi">{props.value}</div>
      <div className="kpi-s">
        <Explainer term={props.metricKey}>{props.label}</Explainer>
        {props.sub !== undefined && <span className="kpi-sub"> · {props.sub}</span>}
      </div>
    </div>
  );
}

const severityClass: Record<Severity, string> = {
  [Severity.SEVERITY_UNSPECIFIED]: "info",
  [Severity.ERROR]: "error",
  [Severity.WARNING]: "warning",
  [Severity.INFO]: "info",
};

export function DiagnosticLine(props: { diagnostic: Diagnostic }) {
  const d = props.diagnostic;
  return (
    <li className={`diag diag-${severityClass[d.severity]}`} data-code={d.code}>
      <b>{d.code}</b> {d.message}
      {d.hint !== "" && <span className="hint"> Hint: {d.hint}</span>}
    </li>
  );
}

/** Diagnostics whose `proto_path` is exactly this control's path, rendered next to it. */
export function InlineDiagnostics(props: { path: string }) {
  const { state } = useStore();
  const found = diagnosticsAt(state.result, props.path);
  if (found.length === 0) return null;
  return (
    <ul className="diags inline">
      {found.map((d) => (
        <DiagnosticLine key={d.code} diagnostic={d} />
      ))}
    </ul>
  );
}
