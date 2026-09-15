/**
 * Grounding checks on the Copilot's prose (live mode only): every number it states must trace to
 * an engine fact within rounding, and the steering-committee summary must cover the four dimensions.
 */

/**
 * Numeric tokens in prose: `$6.5B`, `2.34`, `82%`, `1,909 bps`, `−232M`. A token glued to a letter
 * (`P10`, `Q3-28`, `GB300`, `m30`, `NVL72`) is an identifier, not a number, and is skipped.
 */
export function numbersIn(text: string): number[] {
  const re = /(?<![A-Za-z0-9_.])([-−–]?)\$?(\d[\d,]*(?:\.\d+)?)\s?(%|bps|[kKmMbB](?![A-Za-z])|bn|billion|million|thousand)?/g;
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const digits = (m[2] as string).replace(/,/g, "");
    if (/^\d{4}$/.test(digits) && Number(digits) >= 2020 && Number(digits) <= 2050) continue; // a year
    const n = Number(digits) * scaleOf(m[3]) * (m[1] === "" ? 1 : -1);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function scaleOf(suffix: string | undefined): number {
  switch ((suffix ?? "").toLowerCase()) {
    case "k":
    case "thousand":
      return 1e3;
    case "m":
    case "million":
      return 1e6;
    case "b":
    case "bn":
    case "billion":
      return 1e9;
    default:
      return 1;
  }
}

/** Small counts ("4 phases", "two-sided", month numbers ≤ 12) are not claims that need a Result. */
const trivialMax = 12;

/** Scales a stated number may be quoted in relative to the stored fact (thousands, %, fractions…). */
const scales = [1, 1e3, 1e6, 1e9, 1e-3, 1e-6, 1e-9, 100, 0.01];

/** True when `stated` equals some fact to two significant figures under one of the usual scalings. */
export function traceable(stated: number, facts: readonly number[]): boolean {
  if (Math.abs(stated) <= trivialMax && Number.isInteger(stated)) return true;
  return facts.some((f) => scales.some((s) => sameTo2Sig(stated * s, f)));
}

function sameTo2Sig(a: number, b: number): boolean {
  if (a === b) return true;
  if (a === 0 || b === 0) return Math.abs(a - b) < 1e-9;
  if (Math.sign(a) !== Math.sign(b)) return false;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(b))) - 1);
  return Math.abs(a - b) <= 0.5 * magnitude + 1e-12 || Math.round(a / magnitude) === Math.round(b / magnitude);
}

/** The stated numbers that no fact explains — empty when the narration is fully grounded. */
export function untraceable(text: string, facts: readonly number[]): number[] {
  return numbersIn(text).filter((n) => !traceable(n, facts));
}

export const dimensions = ["space", "time", "capital", "risk"] as const;

export function missingDimensions(text: string): string[] {
  const lower = text.toLowerCase();
  return dimensions.filter((d) => !lower.includes(d));
}

/** Facts a comparison can legitimately quote: each metric's change and % change between two summaries. */
export function deltaFacts(before: Readonly<Record<string, unknown>>, after: Readonly<Record<string, unknown>>): number[] {
  const out: number[] = [];
  for (const [k, b] of Object.entries(before)) {
    const a = after[k];
    if (typeof a !== "number" || typeof b !== "number") continue;
    out.push(a - b);
    if (b !== 0) out.push(((a - b) / Math.abs(b)) * 100);
  }
  return out;
}
