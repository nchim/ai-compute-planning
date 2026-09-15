import { fromJsonString, toJson as protoToJson, type DescMessage, type MessageShape } from "@bufbuild/protobuf";

import abileneJson from "../../../fixtures/abilene-1.json?raw";
import { defaultBaselineLabel, useStore, viewContext, type Proposal } from "../bus";
import type { Store } from "../bus";
import {
  ConservationReportSchema,
  DiagnosticSchema,
  Severity,
  SitePlanSchema,
  SummaryMetricsSchema,
  type Diagnostic,
} from "../gen/capplanner/v1/engine_pb";
import { SiteFeasibilityView } from "../views/site";
import { Explainer } from "../views/site/Explainer";
import { JsonTree } from "./JsonTree";

// Proto field names (snake_case) everywhere on the canvas so keys match diagnostics' proto_path and bus paths.
function json<D extends DescMessage>(schema: D, msg: MessageShape<D>) {
  return protoToJson(schema, msg, { useProtoFieldName: true });
}

// The badge reflects the build-time engine choice (see engine/index.ts selectEngine); the fake engine
// additionally announces itself with a FAKE_ENGINE diagnostic in every Result.
const engineName = import.meta.env.VITE_ENGINE === "wasm" ? "wasm" : "fake";

/** The canvas: slim toolbar, proposal cards, the active tab's view, and a collapsible raw-Result inspector. */
export function Canvas() {
  const { state, store } = useStore();
  const ctx = viewContext(state);

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
        <BaselineControls store={store} />
        <span className="dim" data-engine={engineName}>
          engine: {engineName}
        </span>
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

      {ctx.activeTab === "site" ? <SiteFeasibilityView /> : <div className="empty">This tab is not part of the POC.</div>}

      <details className="panel inspector">
        <summary className="panel-hd">
          <span className="t">Result inspector</span>
        </summary>
        <Diagnostics diagnostics={ctx.diagnostics} />
        {state.result === null ? (
          <div className="empty">No result yet.</div>
        ) : (
          <>
            <JsonTree label="summary" value={state.result.summary ? json(SummaryMetricsSchema, state.result.summary) : null} />
            <JsonTree label="diagnostics" value={state.result.diagnostics.map((d) => json(DiagnosticSchema, d))} open={false} />
            <JsonTree
              label="conservation"
              value={state.result.conservation ? json(ConservationReportSchema, state.result.conservation) : null}
              open={false}
            />
          </>
        )}
      </details>
    </main>
  );
}

/** "Set as baseline" (label from the scenario name), the pinned label with a clear ×, and the Compare toggle. */
function BaselineControls(props: { store: Store }) {
  const { state, store } = useStore();
  const pin = () => store.dispatch({ type: "setBaseline", label: defaultBaselineLabel(state, props.store.getLog()) });
  return (
    <>
      <button className="btn" data-action="set-baseline" disabled={state.result === null} onClick={pin}>
        Set as baseline
      </button>
      <Explainer term="toolbar.set_baseline" />
      {state.baseline !== null && (
        <span className="baseline-chip" data-baseline-label={state.baseline.label}>
          baseline: <b>{state.baseline.label}</b>
          <button className="x" aria-label="clear baseline" onClick={() => store.dispatch({ type: "clearBaseline" })}>
            ×
          </button>
        </span>
      )}
      <button
        className="btn toggle"
        data-action="compare"
        aria-pressed={state.compare}
        disabled={state.baseline === null}
        onClick={() => store.dispatch({ type: "toggleCompare" })}
      >
        Compare
      </button>
      <Explainer term="toolbar.compare" />
    </>
  );
}

function Diagnostics(props: { diagnostics: readonly Diagnostic[] }) {
  if (props.diagnostics.length === 0) return <div className="empty">No diagnostics.</div>;
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
