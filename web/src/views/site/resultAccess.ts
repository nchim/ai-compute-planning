import type { Cell, Chart, Diagnostic, Result, SitePlan, Table } from "../../gen/capplanner/v1/engine_pb";
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
