import { useStore } from "../../bus";
import { Severity, Status } from "../../gen/capplanner/v1/engine_pb";
import { ContextMap } from "./ContextMap";
import { CriticalPath } from "./CriticalPath";
import { OptimizationPanel } from "./OptimizationPanel";
import { PhasingLever } from "./PhasingLever";
import { ProForma } from "./ProForma";
import { Risk } from "./Risk";
import { SiteSchematic } from "./SiteSchematic";
import { DiagnosticLine, DimensionChip, NotComputed } from "./chrome";
import "./site.css";

const statusLabel: Record<Status, string> = {
  [Status.STATUS_UNSPECIFIED]: "unknown",
  [Status.OK]: "OK",
  [Status.OK_WITH_WARNINGS]: "OK with warnings",
  [Status.INVALID_INPUT]: "invalid input",
  [Status.INFEASIBLE]: "infeasible",
};

/** Paths that have a control on this canvas; their diagnostics render inline, everything else on top. */
const inlinePaths = /^(revenue\.compute\.|power\.interconnection\.grid_energize_month|costs\.gpu\.depreciation_years|compute\.|phasing\.|run\.monte_carlo\.enabled|optimization\.)/;

export function SiteFeasibilityView() {
  const { state } = useStore();
  const { plan, result, baseline, compare } = state;
  // Errors always surface here (a path with no control on this canvas would otherwise be invisible);
  // warnings/infos on controlled paths render inline next to their control.
  const topDiagnostics = (result?.diagnostics ?? []).filter((d) => d.severity === Severity.ERROR || !inlinePaths.test(d.protoPath));
  const conservation = result?.conservation;

  return (
    <div className="site-view" data-view="site">
      <header className="canvas-hd">
        <span className="h-title">Site Feasibility{plan !== null && ` — ${plan.meta?.siteName ?? plan.meta?.planId ?? ""}`}</span>
        {plan !== null && (
          <span className="h-sub">
            {plan.site?.market} · {plan.compute?.targetItLoadMw ?? 0} MW · {plan.meta?.scenarioName}
          </span>
        )}
        {compare && baseline !== null && (
          <span className="h-sub" data-baseline={baseline.label}>
            vs. baseline: {baseline.label}
          </span>
        )}
        {result !== null && (
          <span className="score" data-status={statusLabel[result.status]}>
            {statusLabel[result.status]}
            {conservation !== undefined && ` · conservation ${conservation.allPassed ? "green" : "FAILED"}`}
          </span>
        )}
        <span className="legend-chips">
          <DimensionChip dimension="space" />
          <DimensionChip dimension="time" />
          <DimensionChip dimension="capital" />
          <DimensionChip dimension="risk" />
        </span>
      </header>

      {plan === null && <NotComputed what="Plan" />}
      {topDiagnostics.length > 0 && (
        <ul className="diags top">
          {topDiagnostics.map((d) => (
            <DiagnosticLine key={d.code} diagnostic={d} />
          ))}
        </ul>
      )}

      <div className="canvas-grid">
        <ContextMap />
        <SiteSchematic />
        <div className="span-2"><PhasingLever /></div>
        <CriticalPath />
        <ProForma />
        <Risk />
        <OptimizationPanel />
      </div>
    </div>
  );
}
