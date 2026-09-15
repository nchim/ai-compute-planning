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

export interface HarnessApi {
  loadPlan(protojson: string): Promise<void>;
  getPlan(): Promise<string>;
  getResult(): Promise<string | null>;
  setControl(path: string, value: ControlValue): Promise<void>;
  listControls(): Promise<Control[]>;
  /** Resolves when the Copilot turn ends; rejects until a Copilot is registered via `setCopilot`. */
  sendCopilot(text: string): Promise<void>;
  setCopilot(fn: CopilotFn | null): Promise<void>;
  /** Accepts the given proposal, or the latest pending one when `id` is omitted. */
  acceptCard(id?: string): Promise<void>;
  rejectCard(id?: string): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  getViewContext(): Promise<Json>;
  getCommandLog(): Promise<CommandLogEntry[]>;
  /** Resolves when no analyze is debounced or in flight; rejects on an engine error or timeout. */
  waitIdle(timeoutMs?: number): Promise<void>;
  /** console.error calls, uncaught errors and unhandled rejections seen since install, oldest first. */
  getConsoleErrors(): Promise<string[]>;
}

export type CopilotFn = (text: string) => Promise<void>;

declare global {
  interface Window {
    __harness?: HarnessApi;
  }
}
