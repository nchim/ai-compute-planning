import type { ReactNode } from "react";

/** Paragraphs, bullet lists and **bold** — enough for the Copilot's answers without a markdown dependency. */
export function renderMarkdownLite(text: string): ReactNode[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block, i) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return (
          <ul key={i}>
            {lines.map((l, j) => (
              <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
            ))}
          </ul>
        );
      }
      const heading = /^#{1,6}\s+(.*)$/.exec(block);
      if (heading !== null) return <p key={i}><strong>{inline(heading[1] as string)}</strong></p>;
      return <p key={i}>{inline(block)}</p>;
    });
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}
