import type { Cell, Chart, Diagnostic, Result, SitePlan, SummaryMetrics, Table } from "../../gen/capplanner/v1/engine_pb";
import type { FieldValue } from "../../bus";

/** Lookups that return `undefined` (never throw) so a missing Result section renders as "not computed". */
export function chartById(result: Result | null, id: string): Chart | undefined {
  return result?.charts.find((c) => c.id === id);
}

export function tableById(result: Result | null, id: string): Table | undefined {
  return result?.tables.find((t) => t.id === id);
}

export function cellText(cell: Cell | undefined): string {
  if (cell === undefined || cell.v.case === undefined) return "";
  return String(cell.v.value);
}

export function cellNumber(cell: Cell | undefined): number | undefined {
  return cell?.v.case === "n" ? cell.v.value : undefined;
}

export function diagnosticsAt(result: Result | null, path: string): Diagnostic[] {
  return result?.diagnostics.filter((d) => d.protoPath === path) ?? [];
}

const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** A numeric `Result.summary` field by its proto (snake_case) name; `undefined` if absent or not a number. */
export function summaryValue(summary: SummaryMetrics | undefined, key: string): number | undefined {
  const v = summary === undefined ? undefined : (summary as unknown as Record<string, unknown>)[snakeToCamel(key)];
  return typeof v === "number" ? v : undefined;
}
const segmentRe = /^([a-z0-9_]+)(?:\[(\d+)\])?$/i;

/**
 * Reads a scalar/enum at a protojson dotted path (`compute.kw_per_rack`, `phasing.phases[0].id`).
 * Returns `undefined` for anything unset or unreadable; writes are validated by the bus, not here.
 */
export function readPlanValue(plan: SitePlan | null, path: string): FieldValue | undefined {
  let node: unknown = plan;
  for (const raw of path.split(".")) {
    const m = segmentRe.exec(raw);
    if (m === null || node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[snakeToCamel(m[1] as string)];
    if (m[2] !== undefined) node = Array.isArray(node) ? node[Number(m[2])] : undefined;
  }
  if (typeof node === "bigint") return Number(node);
  return typeof node === "string" || typeof node === "number" || typeof node === "boolean" ? node : undefined;
}

/** Human header for an engine table column: `per_mw_usd` → "per MW", `share_pct` → "share", `amount_usd` → "amount". */
export function columnLabel(column: string): string {
  return column
    .replace(/_usd$/, "")
    .replace(/_pct$/, "")
    .replace(/_mw\b/g, " MW")
    .replace(/_/g, " ")
    .replace(/\bmw\b/g, "MW")
    .trim();
}

/**
 * Formats a cell by its column's unit suffix: `_usd` as money, `_pct` as a percentage (1 decimal),
 * `_mw` as megawatts, `_month`/`_months` as month indices; other numbers with thousands separators.
 */
export function formatCell(column: string, cell: Cell | undefined, fmt: { money: (n: number) => string; pct: (n: number) => string; num: (n: number) => string }): string {
  const n = cellNumber(cell);
  if (n === undefined) return cellText(cell);
  if (column.endsWith("_usd")) return fmt.money(n);
  if (column.endsWith("_pct")) return fmt.pct(n);
  if (column.endsWith("_mw")) return `${fmt.num(n)} MW`;
  if (/_months?$/.test(column)) return `m${fmt.num(n)}`;
  return fmt.num(n);
}
