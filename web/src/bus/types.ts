import type { Result, SitePlan } from "../gen/capplanner/v1/engine_pb";

/** A scalar/enum value written through a protojson dotted path. Enums accept their name or number. */
export type FieldValue = string | number | boolean;

export interface PatchOp {
  readonly path: string;
  readonly value: FieldValue;
}

export type Tab = "site" | "portfolio" | "scenario" | "demand";

export interface Selection {
  readonly tab: Tab;
  /** Dotted SitePlan path of the focused control, if any. */
  readonly path: string | null;
  readonly phaseId: string | null;
  /** Month the schematic time scrubber is parked on (WS7); absent = show the final state. */
  readonly month?: number;
}

export type ProposalStatus = "pending" | "accepted" | "rejected";

export interface Proposal {
  readonly id: string;
  readonly summary: string;
  readonly patch: readonly PatchOp[];
  readonly status: ProposalStatus;
}

export interface AppError {
  /** "command" for rejected commands; engine error kinds for engine failures; "parse" for bad input. */
  readonly kind: string;
  readonly message: string;
}

/** A pinned scenario: independent clones of the plan and the Result it produced. */
export interface Baseline {
  readonly label: string;
  readonly plan: SitePlan;
  readonly result: Result;
}

export interface EngineActivity {
  /** A (debounced or in-flight) analyze is pending. */
  readonly analyzing: boolean;
  /** An optimizer run is in flight. */
  readonly optimizing: boolean;
}

export const idleEngine: EngineActivity = { analyzing: false, optimizing: false };

export interface State {
  readonly plan: SitePlan | null;
  readonly result: Result | null;
  readonly baseline: Baseline | null;
  /** Compare mode: the site view juxtaposes the current Result against `baseline`. */
  readonly compare: boolean;
  /** What the engine is doing right now; updated by the store outside the command log. */
  readonly engine: EngineActivity;
  readonly proposals: readonly Proposal[];
  readonly selection: Selection;
  readonly error: AppError | null;
  /** Plan snapshots for undo/redo; each is a structurally independent clone. */
  readonly history: { readonly past: readonly SitePlan[]; readonly future: readonly SitePlan[] };
}

export type Command =
  | { readonly type: "loadPlan"; readonly plan: SitePlan }
  | { readonly type: "setField"; readonly path: string; readonly value: FieldValue }
  | { readonly type: "applyPatch"; readonly patch: readonly PatchOp[] }
  | {
      readonly type: "proposeChange";
      readonly id: string;
      readonly summary: string;
      readonly patch: readonly PatchOp[];
    }
  | { readonly type: "acceptProposal"; readonly id: string }
  | { readonly type: "rejectProposal"; readonly id: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "setBaseline"; readonly label: string }
  | { readonly type: "clearBaseline" }
  | { readonly type: "toggleCompare" }
  | { readonly type: "select"; readonly selection: Selection }
  | { readonly type: "resultReceived"; readonly result: Result }
  | { readonly type: "errorRaised"; readonly error: AppError }
  | { readonly type: "clearError" };

export type CommandType = Command["type"];

/** One reduced command; `seq` and `ts` are supplied by the store, never by the reducer. */
export interface LogEntry {
  readonly seq: number;
  readonly ts: number;
  readonly command: Command;
  /** Set when the reducer rejected the command (state unchanged apart from `error`). */
  readonly rejected: AppError | null;
}

export const initialSelection: Selection = { tab: "site", path: null, phaseId: null };

export const initialState: State = {
  plan: null,
  result: null,
  baseline: null,
  compare: false,
  engine: idleEngine,
  proposals: [],
  selection: initialSelection,
  error: null,
  history: { past: [], future: [] },
};
