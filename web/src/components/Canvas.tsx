import { fromJsonString, toJson } from "@bufbuild/protobuf";

import abileneJson from "../../../fixtures/abilene-1.json?raw";
import { useStore, viewContext, type FieldValue, type Proposal } from "../bus";
import type { Store } from "../bus";
import {
  ConservationReportSchema,
  DiagnosticSchema,
  Severity,
  SitePlanSchema,
  SummaryMetricsSchema,
  type Diagnostic,
} from "../gen/capplanner/v1/engine_pb";
import { JsonTree } from "./JsonTree";

const dimensions = [
  ["Space", "var(--d-space)"],
  ["Time", "var(--d-time)"],
  ["Capital", "var(--d-cap)"],
  ["Risk", "var(--d-risk)"],
] as const;

export function Canvas() {
  const { state, store } = useStore();
  const ctx = viewContext(state);
  const plan = state.plan;

  const loadFixture = () => {
    try {
      store.dispatch({ type: "loadPlan", plan: fromJsonString(SitePlanSchema, abileneJson) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      store.dispatch({ type: "errorRaised", error: { kind: "parse", message: `abilene-1.json: ${message}` } });
    }
  };

  return (
    <main className="canvas">
      <div className="canvas-hd">
        <span className="h-title">{plan?.meta?.siteName ?? "No site loaded"}</span>
        <span className="h-sub">{plan?.meta?.scenarioName ?? "load a plan to begin"}</span>
        <div className="legend">
          {dimensions.map(([name, color]) => (
            <span key={name} className="dim">
              <span className="dot" style={{ background: color }} /> {name}
            </span>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <button className="btn primary" onClick={loadFixture}>
          Load Abilene-1 fixture
        </button>
        <button className="btn" disabled={state.history.past.length === 0} onClick={() => store.dispatch({ type: "undo" })}>
          Undo
        </button>
        <button className="btn" disabled={state.history.future.length === 0} onClick={() => store.dispatch({ type: "redo" })}>
          Redo
        </button>
      </div>

      {state.error !== null && (
        <div className="banner" role="alert">
          <span className="kind">{state.error.kind}</span>
          <span>{state.error.message}</span>
          <button className="btn" onClick={() => store.dispatch({ type: "clearError" })}>
            Dismiss
          </button>
        </div>
      )}

      {plan !== null && (
        <div className="grid">
          <Controls store={store} plan={plan} />
          <Summary summary={ctx.resultSummary === null ? null : toJson(SummaryMetricsSchema, ctx.resultSummary)} />
        </div>
      )}

      {state.proposals.length > 0 && (
        <section className="panel">
          <div className="panel-hd">
            <span className="t">Proposed changes</span>
          </div>
          {state.proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} store={store} />
          ))}
        </section>
      )}

      <section className="panel">
        <div className="panel-hd">
          <span className="t">Diagnostics</span>
        </div>
        <Diagnostics diagnostics={ctx.diagnostics} />
      </section>

      <section className="panel">
        <div className="panel-hd">
          <span className="t">Raw result</span>
        </div>
        {state.result === null ? (
          <div className="empty">No result yet.</div>
        ) : (
          <>
            <JsonTree label="summary" value={state.result.summary ? toJson(SummaryMetricsSchema, state.result.summary) : null} />
            <JsonTree label="diagnostics" value={state.result.diagnostics.map((d) => toJson(DiagnosticSchema, d))} open={false} />
            <JsonTree
              label="conservation"
              value={state.result.conservation ? toJson(ConservationReportSchema, state.result.conservation) : null}
              open={false}
            />
          </>
        )}
      </section>
    </main>
  );
}

// A handful of live controls so a mutation → analyze → render cycle is visible before WS7 lands the
// full view. Each writes a protojson path through the bus like any other driver.
const controls: readonly { path: string; label: string; min: number; max: number; step: number }[] = [
  { path: "compute.target_it_load_mw", label: "Target IT load (MW)", min: 10, max: 1000, step: 10 },
  { path: "compute.kw_per_rack", label: "Rack density (kW/rack)", min: 10, max: 200, step: 5 },
  { path: "compute.pue", label: "PUE", min: 1.05, max: 1.8, step: 0.01 },
  { path: "power.interconnection.grid_energize_month", label: "Grid energize (month)", min: 0, max: 72, step: 1 },
  { path: "revenue.compute.gpu_hour_price", label: "GPU-hour price ($)", min: 0.5, max: 6, step: 0.05 },
];

function Controls(props: { store: Store; plan: NonNullable<ReturnType<typeof useStore>["state"]["plan"]> }) {
  const { store, plan } = props;
  const json = toJson(SitePlanSchema, plan) as Record<string, unknown>;
  const read = (path: string): number => {
    const v = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], json);
    return typeof v === "number" ? v : 0;
  };
  const set = (path: string, value: FieldValue) => store.dispatch({ type: "setField", path, value });
  return (
    <section className="panel">
      <div className="panel-hd">
        <span className="t">Controls</span>
      </div>
      {controls.map((c) => (
        <label key={c.path} className="field">
          <span>
            {c.label}
            <br />
            <code>{c.path}</code>
          </span>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step}
            value={read(c.path)}
            onChange={(e) => set(c.path, Number(e.target.value))}
            onFocus={() => store.dispatch({ type: "select", selection: { ...store.getState().selection, path: c.path } })}
          />
          <span>{read(c.path)}</span>
        </label>
      ))}
    </section>
  );
}

function Summary(props: { summary: ReturnType<typeof toJson> | null }) {
  const entries = props.summary !== null && typeof props.summary === "object" ? Object.entries(props.summary) : [];
  return (
    <section className="panel">
      <div className="panel-hd">
        <span className="t">Summary metrics</span>
      </div>
      {entries.length === 0 ? (
        <div className="empty">Awaiting analysis.</div>
      ) : (
        <div className="kpis">
          {entries.map(([k, v]) => (
            <div key={k}>
              <div className="kpi">{typeof v === "number" ? formatNumber(v) : String(v)}</div>
              <div className="kpi-s">{k}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatNumber(n: number): string {
  return Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Diagnostics(props: { diagnostics: readonly Diagnostic[] }) {
  if (props.diagnostics.length === 0) return <div className="empty">None.</div>;
  return (
    <div>
      {props.diagnostics.map((d, i) => {
        const sev = Severity[d.severity];
        return (
          <div key={i} className="diag">
            <span className={`sev sev-${sev}`}>{sev}</span>
            <code>{d.code}</code>
            <span>
              {d.message}
              {d.protoPath !== "" && <span className="path"> · {d.protoPath}</span>}
              {d.hint !== "" && <span className="path"> · hint: {d.hint}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ProposalCard(props: { proposal: Proposal; store: Store }) {
  const { proposal: p, store } = props;
  return (
    <div className="proposal">
      <b>{p.summary}</b> · {p.patch.map((op) => `${op.path} = ${String(op.value)}`).join(", ")}
      {p.status === "pending" ? (
        <div className="acts">
          <button className="btn primary" onClick={() => store.dispatch({ type: "acceptProposal", id: p.id })}>
            Accept
          </button>
          <button className="btn" onClick={() => store.dispatch({ type: "rejectProposal", id: p.id })}>
            Reject
          </button>
        </div>
      ) : (
        <div className="status">{p.status}</div>
      )}
    </div>
  );
}
