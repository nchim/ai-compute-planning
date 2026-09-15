/**
 * The slices of `SitePlan` / `Result` protojson (proto field names, defaults omitted) the acceptance
 * session asserts on. Typed loosely on purpose: anything not listed is read through `Json`.
 */
import type { Json } from "../../src/session";

export interface Summary {
  readonly lcoc_per_gpu_hour?: number;
  readonly total_capex?: number;
  readonly capex_per_mw?: number;
  readonly npv?: number;
  readonly time_to_energize_months?: number;
  readonly demand_capture_pct?: number;
  readonly stranded_capacity_mw_months?: number;
  readonly shortfall_mw_months?: number;
  readonly utilization_breakeven_pct?: number;
  readonly composite_risk_score?: number;
  readonly extra?: Readonly<Record<string, number>>;
}

export interface Diagnostic {
  readonly severity?: string;
  readonly code: string;
  readonly message?: string;
  readonly proto_path?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly hint?: string;
}

export interface Phase {
  readonly id?: string;
  readonly it_load_mw?: number;
  readonly start_month?: number;
  readonly energize_month?: number;
  readonly power_source_id?: string;
}

export interface PowerSource {
  readonly id?: string;
  readonly type?: string;
  readonly available_month?: number;
}

export interface Plan {
  readonly phasing?: { readonly mode?: string; readonly phases?: readonly Phase[] };
  readonly power?: { readonly sources?: readonly PowerSource[] };
  readonly run?: { readonly monte_carlo?: { readonly enabled?: boolean; readonly iterations?: number } };
}

export interface Distribution {
  readonly p10?: number;
  readonly p50?: number;
  readonly p90?: number;
  readonly mean?: number;
  readonly stddev?: number;
  readonly histogram?: readonly { readonly count?: number }[];
}

export interface SensitivityVar {
  readonly input_path: string;
  readonly target_metric: string;
  readonly low_output?: number;
  readonly high_output?: number;
  readonly base_output?: number;
}

export interface Candidate {
  readonly decision_var_values?: Readonly<Record<string, number>>;
  readonly metrics?: Summary;
  readonly feasible?: boolean;
}

export interface Result {
  readonly status: string;
  readonly diagnostics?: readonly Diagnostic[];
  readonly summary?: Summary;
  readonly conservation?: { readonly all_passed?: boolean; readonly checks?: readonly { readonly name: string; readonly passed?: boolean }[] };
  readonly schematic?: { readonly footprint_used_pct?: number; readonly blocks?: readonly { readonly id: string; readonly phase_id?: string; readonly energize_month?: number }[] };
  readonly monte_carlo?: { readonly iterations?: number; readonly metrics?: Readonly<Record<string, Distribution>> };
  readonly sensitivity?: { readonly vars?: readonly SensitivityVar[] };
  readonly optimization?: {
    readonly best_plan?: Plan;
    readonly best_metrics?: Summary;
    readonly frontier?: readonly Candidate[];
    readonly decision_var_values?: Readonly<Record<string, number>>;
    readonly evaluations?: number;
    readonly converged?: boolean;
  };
}

export function parseResult(protojson: string | null): Result {
  if (protojson === null) throw new Error("no Result yet");
  return JSON.parse(protojson) as Result;
}

export function parsePlan(protojson: string): Plan {
  return JSON.parse(protojson) as Plan;
}

/** `summary.<key>`, failing loudly when the engine did not report it. */
export function metric(result: Result, key: keyof Summary & string): number {
  const v = result.summary?.[key];
  if (typeof v !== "number") throw new Error(`Result.summary.${key} is missing`);
  return v;
}

export function findDiagnostic(result: Result, code: string): Diagnostic | undefined {
  return result.diagnostics?.find((d) => d.code === code);
}

/** Conservation is green only when the engine says so explicitly (protojson omits `false`). */
export function conservationGreen(result: Result): boolean {
  return result.conservation?.all_passed === true;
}

/** Every finite number reachable in a JSON value (used to ground narration against a Result). */
export function numbersOf(value: Json | undefined): number[] {
  const out: number[] = [];
  const walk = (v: Json | undefined): void => {
    if (typeof v === "number") {
      if (Number.isFinite(v)) out.push(v);
    } else if (typeof v === "string") {
      const n = Number(v);
      if (v !== "" && Number.isFinite(n)) out.push(n); // int64 fields and diagnostics' expected/actual
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v !== null && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return out;
}
