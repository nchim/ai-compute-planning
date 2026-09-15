/**
 * The `window.__harness` contract. Dependency-free on purpose: the Playwright package
 * (`harness/`) imports these types straight from this file, so both sides agree by construction.
 * Plans, Results and the command log cross the boundary as protojson strings.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A scalar/enum value written through a protojson dotted path (see bus/paths.ts). */
export type ControlValue = string | number | boolean;

export interface Control {
  /** Dotted proto path, e.g. `costs.gpu.depreciation_years` or `power.sources[0].capacity_mw`. */
  readonly path: string;
  /** Scalar type name (`double`, `int32`, `bool`, `string`, …) or the enum's name. */
  readonly type: string;
  /** Enum fields only: the accepted names. */
  readonly options?: readonly string[];
  readonly value: ControlValue;
}

/** One command-log entry as `bus/log.ts` serializes it; messages inside `command` are protojson. */
export interface CommandLogEntry {
  readonly seq: number;
  readonly ts: number;
  readonly command: { readonly type: string; readonly [field: string]: Json };
  readonly rejected: { readonly kind: string; readonly message: string } | null;
}

/** One SitePlan field write inside a proposal (mirrors bus `PatchOp`). */
export interface PatchEntry {
  readonly path: string;
  readonly value: ControlValue;
}

/** The pinned baseline as the harness sees it: its label and its Result.summary as protojson. */
export interface BaselineSnapshot {
  readonly label: string;
  readonly summary: Json;
}

export interface HarnessApi {
  loadPlan(protojson: string): Promise<void>;
  /** Loads `fixtures/<name>.json` (a name from the Canvas dropdown, e.g. "abilene-1"); rejects naming the known fixtures. */
  loadFixture(name: string): Promise<void>;
  getPlan(): Promise<string>;
  getResult(): Promise<string | null>;
  setControl(path: string, value: ControlValue): Promise<void>;
  listControls(): Promise<Control[]>;
  /** Runs the optimizer on the current plan (the "Run optimize" button) and returns the Result protojson. */
  optimize(): Promise<string>;
  /** Opens an accept/undo card (the Copilot's `propose_change`); returns the proposal id. */
  proposeChange(summary: string, patch: readonly PatchEntry[]): Promise<string>;
  /** Resolves when the Copilot turn ends; rejects until a Copilot is registered via `setCopilot`. */
  sendCopilot(text: string, options?: SendOptions): Promise<void>;
  setCopilot(copilot: CopilotHandle | null): Promise<void>;
  /** The registered Copilot's transcript, tool events and last usage; rejects until one is registered. */
  getCopilotSnapshot(): Promise<Json>;
  /** Accepts the given proposal, or the latest pending one when `id` is omitted. */
  acceptCard(id?: string): Promise<void>;
  rejectCard(id?: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  /** Pins the current plan + Result as the baseline; label defaults to the scenario name. Rejects without a Result. */
  setBaseline(label?: string): Promise<void>;
  clearBaseline(): Promise<void>;
  /** Rejects until a baseline is pinned. */
  toggleCompare(): Promise<void>;
  getBaseline(): Promise<BaselineSnapshot | null>;
  getViewContext(): Promise<Json>;
  getCommandLog(): Promise<CommandLogEntry[]>;
  /** Resolves when no analyze is debounced or in flight; rejects on an engine error or timeout. */
  waitIdle(timeoutMs?: number): Promise<void>;
  /** console.error calls, uncaught errors and unhandled rejections seen since install, oldest first. */
  getConsoleErrors(): Promise<string[]>;
}

/** Per-turn request options a caller may pass through to the Copilot. */
export interface SendOptions {
  /** `output_config.effort` for this turn; omitted = the API default. */
  readonly effort?: "low" | "medium" | "high";
}

export type CopilotFn = (text: string, options?: SendOptions) => Promise<void>;

/** What the Copilot registers: a way to send a turn and a JSON view of its state for assertions. */
export interface CopilotHandle {
  readonly send: CopilotFn;
  readonly snapshot: () => Json;
}

declare global {
  interface Window {
    __harness?: HarnessApi;
  }
}
