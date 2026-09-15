// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";

import { historyKey, loadTranscript, saveTranscript, trimTranscript, type Message, type Transcript } from "./history";

const turn = (i: number, size = 10): Message[] => [
  { role: "user", content: [{ type: "text", text: `q${i} ${"x".repeat(size)}` }] },
  { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "run_analyze", input: {} }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "{}" }] },
  { role: "assistant", content: [{ type: "text", text: `a${i}` }] },
];

describe("history", () => {
  beforeEach(() => window.localStorage.clear());

  test("round-trips the full messages array, tool blocks included", () => {
    const t: Transcript = { messages: [...turn(1), ...turn(2)], droppedTurns: 0 };
    expect(saveTranscript(window.localStorage, "abilene-1", t).warning).toBeNull();
    const loaded = loadTranscript(window.localStorage, "abilene-1");
    expect(loaded.warning).toBeNull();
    expect(loaded.transcript).toEqual(t);
    expect(loadTranscript(window.localStorage, "other-plan").transcript.messages).toEqual([]);
  });

  test("trims whole turns from the front and counts them", () => {
    const t: Transcript = { messages: [...turn(1), ...turn(2), ...turn(3)], droppedTurns: 0 };
    const trimmed = trimTranscript(t, 700);
    expect(trimmed.droppedTurns).toBeGreaterThan(0);
    expect(trimmed.messages[0]).toEqual(turn(1 + trimmed.droppedTurns)[0]);
    expect(trimmed.messages.length + 4 * trimmed.droppedTurns).toBe(12);
    // The last turn is always kept, even when it alone exceeds the cap.
    const one = trimTranscript({ messages: turn(9, 5000), droppedTurns: 0 }, 100);
    expect(one.messages).toHaveLength(4);
  });

  test("unreadable or absent storage yields an empty transcript with a visible warning", () => {
    window.localStorage.setItem(historyKey("p"), "{not json");
    const corrupt = loadTranscript(window.localStorage, "p");
    expect(corrupt.transcript.messages).toEqual([]);
    expect(corrupt.warning).toContain("unreadable");

    window.localStorage.setItem(historyKey("p"), JSON.stringify({ version: 1, messages: [{ role: "bot" }], droppedTurns: 0 }));
    expect(loadTranscript(window.localStorage, "p").warning).toContain("malformed");

    const none = loadTranscript(null, "p");
    expect(none.transcript.messages).toEqual([]);
    expect(none.warning).toContain("unavailable");
    expect(saveTranscript(null, "p", { messages: turn(1), droppedTurns: 0 }).warning).toBeNull();
  });
});
