/**
 * The research corpus, bundled at build time. Each file is a lazy chunk, so the app ships an index
 * and only fetches a document when the Copilot asks for it.
 */
const files = import.meta.glob("../../../research/**/*.md", { query: "?raw", import: "default" }) as Record<
  string,
  () => Promise<string>
>;

const PREFIX = "../../../";

/** Corpus paths as the system prompt cites them, e.g. `research/02-kpi-architecture.md`. */
export function researchPaths(): string[] {
  return Object.keys(files)
    .map((k) => k.slice(PREFIX.length))
    .sort();
}

function normalize(path: string): string {
  return path.replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

/** A whole corpus file, or just one `## section` of it. Unknown paths/sections are precise errors. */
export async function readResearch(path: string, section: string | null): Promise<string> {
  const loader = files[PREFIX + normalize(path)];
  if (loader === undefined) {
    throw new Error(`unknown research path "${path}"; valid paths:\n${researchPaths().join("\n")}`);
  }
  const text = await loader();
  return section === null ? text : extractSection(text, section, path);
}

const headingRe = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

function extractSection(text: string, section: string, path: string): string {
  const wanted = section.replace(/^#+\s*/, "").trim().toLowerCase();
  const lines = text.split("\n");
  const headings = lines.flatMap((line, i) => {
    const m = headingRe.exec(line);
    return m === null ? [] : [{ line: i, level: (m[1] as string).length, title: (m[2] as string) }];
  });
  const start = headings.find((h) => h.title.toLowerCase() === wanted);
  if (start === undefined) {
    const list = headings.map((h) => `${"#".repeat(h.level)} ${h.title}`).join("\n");
    throw new Error(`"${path}" has no section "${section}"; sections:\n${list}`);
  }
  const end = headings.find((h) => h.line > start.line && h.level <= start.level);
  return lines.slice(start.line, end?.line ?? lines.length).join("\n").trim();
}
