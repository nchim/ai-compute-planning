import promptDoc from "../../../docs/agent-system-prompt.md?raw";

const HEADING = "## PROMPT TEXT";

/** Everything after the PROMPT TEXT heading of the source doc — the verbatim, cached system prompt. */
export function extractPromptText(doc: string): string {
  const at = doc.indexOf(HEADING);
  if (at < 0) throw new Error(`agent-system-prompt.md has no "${HEADING}" heading`);
  return doc.slice(doc.indexOf("\n", at) + 1).trim();
}

export const SYSTEM_PROMPT = extractPromptText(promptDoc);
