import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent, type KeyboardEvent } from "react";

import { useStore, viewContext, type Proposal } from "../bus";
import { saveSharePreference, useSessionShare } from "../telemetry";
import { createCopilot, emptySnapshot, type Activity, type Copilot } from "./client";
import { VIEW_CONTEXT_PREFIX } from "./context";
import { useEngine } from "./engineContext";
import { useRegisterCopilotSend } from "./handle";
import { resetSession } from "../session/reset";
import { safeStorage, type Message } from "./history";
import { Markdown } from "./Markdown";
import type { ToolEvent } from "./tools";
import { RELAY_PLACEHOLDER_KEY, transport } from "./transport";
import "./CopilotRail.css";

const KEY_STORAGE = "copilot.apiKey";
const RELAY_MODE = transport.mode === "relay";
const tabLabels = { site: "Site Feasibility", portfolio: "Portfolio", scenario: "Scenario", demand: "Demand" };

const noSubscribe = () => () => undefined;
const emptyGetter = () => emptySnapshot;

export function CopilotRail() {
  const { state, store } = useStore();
  const engine = useEngine();
  const ctx = viewContext(state);
  // In relay mode the server holds the key, so the Copilot is always enabled and nothing is stored.
  const [apiKey, setApiKey] = useState(() => (RELAY_MODE ? RELAY_PLACEHOLDER_KEY : (safeStorage("session")?.getItem(KEY_STORAGE) ?? "")));
  const [draft, setDraft] = useState("");

  // One Copilot per (store, engine, key); the effect owns its lifetime and registers it with the dev
  // harness (`window.__harness` exists only in dev/harness builds, hence the guard).
  const copilot = useMemo<Copilot | null>(
    () => (apiKey === "" ? null : createCopilot({ store, engine, apiKey })),
    [store, engine, apiKey],
  );
  const registerSend = useRegisterCopilotSend();
  const share = useSessionShare();
  useEffect(() => {
    const register = (fn: ((text: string) => Promise<void>) | null) => {
      registerSend(fn); // in-app readers ("Explain" links)
      window.__harness?.setCopilot(fn).catch((err: unknown) => console.error("harness.setCopilot failed", err));
    };
    register(copilot === null ? null : copilot.send);
    const detachShare = copilot === null ? null : share?.attachCopilot(copilot); // session sharing sees each turn
    return () => {
      detachShare?.();
      register(null);
      copilot?.dispose();
    };
  }, [copilot, registerSend, share]);

  const [sharing, setSharing] = useState(() => share?.isEnabled() ?? false);
  const updateSharing = (on: boolean) => {
    share?.setEnabled(on);
    saveSharePreference(safeStorage("local"), on);
    setSharing(on);
  };

  const snapshot = useSyncExternalStore(copilot?.subscribe ?? noSubscribe, copilot?.getSnapshot ?? emptyGetter);

  const updateKey = (key: string) => {
    const storage = safeStorage("session");
    if (key === "") storage?.removeItem(KEY_STORAGE);
    else storage?.setItem(KEY_STORAGE, key);
    setApiKey(key);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (copilot === null || draft.trim() === "") return;
    const text = draft;
    setDraft("");
    // The rejection is already shown in the snapshot's error banner; here it only needs observing.
    copilot.send(text).catch(() => undefined);
  };
  // Enter sends; Shift+Enter inserts a newline (the textarea grows to fit).
  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <aside className="rail" aria-label="Copilot">
      <div className="rail-hd">
        Copilot
        {share !== null && sharing && <span className="share-dot" role="img" aria-label="Sharing this session with the developer" />}
        {import.meta.env.DEV && snapshot.lastUsage !== null && (
          <span className="copilot-usage" title="Last turn's token usage (dev only)">
            cache read {snapshot.lastUsage.cache_read_input_tokens ?? 0} · in {snapshot.lastUsage.input_tokens} · out{" "}
            {snapshot.lastUsage.output_tokens}
          </span>
        )}
        <span className="vaware">
          viewing: {tabLabels[ctx.activeTab]}
          {ctx.selectedSiteId === null ? "" : ` · ${ctx.selectedSiteId}`}
        </span>
        {state.plan !== null && (
          <button
            type="button"
            className="btn mini-btn"
            data-action="reset-session"
            disabled={snapshot.running}
            title="Start over on this fixture: forgets the conversation and every edit, result, proposal and baseline"
            onClick={() => {
              if (window.confirm("Reset this session? The conversation, all plan edits, results, proposals and the baseline are discarded and the fixture reloads fresh.")) {
                resetSession(store, copilot);
              }
            }}
          >
            Reset
          </button>
        )}
      </div>
      {share !== null && <ShareToggle on={sharing} onChange={updateSharing} />}
      {RELAY_MODE ? (
        <div className="copilot-key">
          <div className="copilot-notice">Relay mode — key held server-side.</div>
        </div>
      ) : (
        <KeyPanel apiKey={apiKey} onChange={updateKey} />
      )}
      {snapshot.transcript.droppedTurns > 0 && (
        <div className="copilot-notice">
          The oldest {snapshot.transcript.droppedTurns} turn(s) were dropped from the saved transcript to stay under the size cap.
        </div>
      )}
      {snapshot.notice !== null && <div className="copilot-notice">{snapshot.notice}</div>}
      {snapshot.error !== null && (
        <div className="banner" role="alert">
          <span className="kind">copilot</span>
          {snapshot.error}
        </div>
      )}
      <div className="thread">
        {copilot !== null && snapshot.transcript.messages.length === 0 && (
          <div className="msg bot">Ask about the plan on screen, or tell me what to change.</div>
        )}
        {snapshot.transcript.messages.map((m, i) => (
          <MessageView key={i} message={m} toolEvents={snapshot.toolEvents} />
        ))}
        {snapshot.streamingText !== "" && <div className="msg bot"><Markdown text={snapshot.streamingText} /></div>}
        {snapshot.running && snapshot.activity.kind !== "writing" && <ActivityIndicator activity={snapshot.activity} />}
        {state.proposals.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            onAccept={() => store.dispatch({ type: "acceptProposal", id: p.id })}
            onUndo={() => store.dispatch({ type: "rejectProposal", id: p.id })}
          />
        ))}
      </div>
      {copilot === null ? (
        <div className="copilot-disabled">Paste an API key above to enable the Copilot.</div>
      ) : state.plan === null ? (
        <div className="copilot-disabled">Load a plan to start a conversation.</div>
      ) : (
        <form className="composer" onSubmit={submit}>
          <GrowingTextarea
            aria-label="Message Copilot"
            placeholder="Ask or instruct… (Shift+Enter for a new line)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKey}
            disabled={snapshot.running}
          />
          {snapshot.running ? (
            <button className="btn" type="button" onClick={() => copilot.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn primary" type="submit" disabled={draft.trim() === ""}>
              Send
            </button>
          )}
        </form>
      )}
    </aside>
  );
}

/** A single-line textarea that grows with its content up to `maxRows`, then scrolls. */
function GrowingTextarea(props: ComponentProps<"textarea"> & { maxRows?: number }) {
  const { maxRows = 8, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 18;
    el.style.height = "auto"; // shrink first so deleting lines also shrinks the box
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * maxRows + 16)}px`;
  }, [props.value, maxRows]);
  return <textarea ref={ref} rows={1} {...rest} />;
}

/** Progress feedback for the wait before any text streams: thinking, or a named tool running. */
function ActivityIndicator(props: { activity: Activity }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [props.activity]);
  const label =
    props.activity.kind === "tool" ? `Running ${props.activity.name}` : props.activity.kind === "thinking" ? "Thinking" : "Working";
  return (
    <div className="msg bot copilot-activity" role="status" aria-live="polite" data-activity={props.activity.kind}>
      <span className="copilot-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
      {seconds >= 3 && <span className="copilot-elapsed"> · {seconds}s</span>}
    </div>
  );
}

/** Opt-in session sharing (see telemetry/share.ts); the explainer says exactly what leaves the browser. */
function ShareToggle(props: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="copilot-share">
      <label>
        <input type="checkbox" checked={props.on} onChange={(e) => props.onChange(e.target.checked)} />
        Share session with developer
      </label>
      <span className="explainer copilot-share-why" tabIndex={0}>
        <span className="q" aria-hidden="true">
          ?
        </span>
        <span role="tooltip" className="pop">
          Sends what you do here — plan edits, Copilot questions and answers, result summaries and any errors — to this
          deployment's server log so the developer can see what worked and what broke. Never your API key.
        </span>
      </span>
    </div>
  );
}

function KeyPanel(props: { apiKey: string; onChange: (key: string) => void }) {
  const [draft, setDraft] = useState("");
  const masked = `${props.apiKey.slice(0, 7)}…${props.apiKey.slice(-4)}`;
  return (
    <div className="copilot-key">
      <div className="copilot-warn">
        Dev only — the key lives in this tab's sessionStorage and is sent straight from the browser. Never ship this.
      </div>
      {props.apiKey === "" ? (
        <div className="copilot-key-row">
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Anthropic API key (sk-ant-…)"
            aria-label="API key"
          />
          <button
            className="btn"
            type="button"
            disabled={draft.trim() === ""}
            onClick={() => {
              props.onChange(draft.trim());
              setDraft("");
            }}
          >
            Use key
          </button>
        </div>
      ) : (
        <div className="copilot-key-row">
          <code>{masked}</code>
          <button className="btn" type="button" onClick={() => props.onChange("")}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function MessageView(props: { message: Message; toolEvents: readonly ToolEvent[] }) {
  const { message } = props;
  const blocks = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
  if (message.role === "user") {
    const texts = blocks.flatMap((b) => (b.type === "text" && !b.text.startsWith(VIEW_CONTEXT_PREFIX) ? [b.text] : []));
    if (texts.length === 0) return null; // tool results show as chip status, not as messages
    return (
      <div className="msg user">
        {texts.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
      </div>
    );
  }
  return (
    <div className="msg bot">
      {blocks.map((b, i) => {
        if (b.type === "text") return <div key={i}><Markdown text={b.text} /></div>;
        if (b.type !== "tool_use") return null;
        const ev = props.toolEvents.find((e) => e.id === b.id);
        const status = ev?.status ?? "done";
        return (
          <span key={i} className={`copilot-chip copilot-chip-${status}`} title={ev?.detail || JSON.stringify(b.input)}>
            {b.name} · {status}
          </span>
        );
      })}
    </div>
  );
}

function ProposalCard(props: { proposal: Proposal; onAccept: () => void; onUndo: () => void }) {
  const { proposal } = props;
  const preview = proposal.patch.map((op) => `${op.path} = ${JSON.stringify(op.value)}`).join("\n");
  return (
    <div className="proposal" data-proposal-id={proposal.id}>
      <div>
        <strong>Proposed:</strong> {proposal.summary}
      </div>
      <pre>{preview}</pre>
      {proposal.status === "pending" ? (
        <div className="acts">
          <button className="btn primary" type="button" onClick={props.onAccept}>
            Accept
          </button>
          <button className="btn" type="button" onClick={props.onUndo}>
            Undo
          </button>
        </div>
      ) : (
        <span className="status">{proposal.status}</span>
      )}
    </div>
  );
}
