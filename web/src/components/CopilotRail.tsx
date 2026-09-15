import { useState, type FormEvent } from "react";

import { useStore, viewContext } from "../bus";

interface Message {
  readonly role: "user" | "bot";
  readonly text: string;
}

const tabLabels = { site: "Site Feasibility", portfolio: "Portfolio", scenario: "Scenario", demand: "Demand" };

// STUB: placeholder rail until WS8 wires the Copilot. Messages are local UI state; nothing is sent.
export function CopilotRail() {
  const { state } = useStore();
  const ctx = viewContext(state);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<readonly Message[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    setMessages((m) => [...m, { role: "user", text }, { role: "bot", text: "Copilot not wired yet (WS8)" }]);
    setDraft("");
  };

  return (
    <aside className="rail" aria-label="Copilot">
      <div className="rail-hd">
        Copilot
        <span className="vaware">
          viewing: {tabLabels[ctx.activeTab]}
          {ctx.selectedSiteId === null ? "" : ` · ${ctx.selectedSiteId}`}
        </span>
      </div>
      <div className="thread">
        {messages.length === 0 && <div className="msg bot">Ask about the plan on screen, or tell me what to change.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          aria-label="Message Copilot"
          placeholder="Bridge with gas so we energize by Q3-27…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" type="submit">
          Send
        </button>
      </form>
    </aside>
  );
}
