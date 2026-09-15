import { ScalarType, create, fromJsonString, toJson, toJsonString, type DescEnum, type DescField, type DescMessage } from "@bufbuild/protobuf";

import { logToJson, viewContext, type Command, type Proposal, type Store } from "../bus";
import {
  DiagnosticSchema,
  ResultSchema,
  SitePlanSchema,
  SummaryMetricsSchema,
} from "../gen/capplanner/v1/engine_pb";
import type { CommandLogEntry, Control, ControlValue, CopilotHandle, HarnessApi } from "./api";

export type { CommandLogEntry, Control, ControlValue, CopilotFn, CopilotHandle, HarnessApi, Json, PatchEntry } from "./api";

/** Proto field names (snake_case) so plan JSON lines up with bus paths and diagnostics' proto_path. */
const jsonOptions = { useProtoFieldName: true } as const;

export interface HarnessOptions {
  /** Registered up front, or later through `__harness.setCopilot` (WS8). */
  readonly copilot?: CopilotHandle;
}

/**
 * Attaches `window.__harness` in dev builds and when `VITE_HARNESS=1`; a no-op (returns null)
 * otherwise, so production bundles carry no remote control. Everything goes through the command
 * bus — the harness exercises exactly the code paths a human or the Copilot would.
 */
export function installHarness(store: Store, options: HarnessOptions = {}): HarnessApi | null {
  if (!(import.meta.env.DEV || import.meta.env.VITE_HARNESS === "1")) return null;
  const api = createHarnessApi(store, options, captureConsoleErrors());
  window.__harness = api;
  return api;
}

/** The API itself, independent of `window` so it can be unit-tested against a store. */
export function createHarnessApi(store: Store, options: HarnessOptions = {}, errors: readonly string[] = []): HarnessApi {
  let copilot: CopilotHandle | null = options.copilot ?? null;

  /** Dispatches and rejects with the reducer's message when the command was refused. */
  const run = (command: Command): void => {
    store.dispatch(command);
    const entry = store.getLog().at(-1);
    if (entry?.rejected) throw new Error(`${command.type}: ${entry.rejected.message}`);
  };

  const requirePlan = () => {
    const plan = store.getState().plan;
    if (plan === null) throw new Error("no plan loaded");
    return plan;
  };

  const requireCopilot = (): CopilotHandle => {
    if (copilot === null) throw new Error("Copilot not installed");
    return copilot;
  };

  const pickProposal = (id: string | undefined): Proposal => {
    const proposals = store.getState().proposals;
    const found =
      id === undefined ? [...proposals].reverse().find((p) => p.status === "pending") : proposals.find((p) => p.id === id);
    if (found === undefined) throw new Error(id === undefined ? "no pending proposal" : `no proposal "${id}"`);
    return found;
  };

  return {
    async loadPlan(protojson) {
      expectString("protojson", protojson);
      let plan;
      try {
        plan = fromJsonString(SitePlanSchema, protojson);
      } catch (err) {
        throw new Error(`loadPlan: invalid SitePlan protojson: ${describe(err)}`);
      }
      run({ type: "loadPlan", plan });
    },

    async getPlan() {
      return toJsonString(SitePlanSchema, requirePlan(), jsonOptions);
    },

    async getResult() {
      const result = store.getState().result;
      return result === null ? null : toJsonString(ResultSchema, result, jsonOptions);
    },

    async setControl(path, value) {
      expectString("path", path);
      if (!["string", "number", "boolean"].includes(typeof value)) {
        throw new Error(`setControl: value must be a string, number or boolean, got ${typeof value}`);
      }
      run({ type: "setField", path, value });
    },

    async listControls() {
      const out: Control[] = [];
      collectControls(SitePlanSchema, requirePlan() as unknown as Node, "", out);
      return out;
    },

    async optimize() {
      requirePlan();
      const result = await store.optimize();
      return toJsonString(ResultSchema, result, jsonOptions);
    },

    async proposeChange(summary, patch) {
      expectString("summary", summary);
      if (!Array.isArray(patch) || patch.length === 0) throw new Error("proposeChange: patch must be a non-empty array");
      const id = store.proposeChange(summary, patch);
      const entry = store.getLog().at(-1);
      if (entry?.rejected) throw new Error(`proposeChange: ${entry.rejected.message}`);
      return id;
    },

    async sendCopilot(text) {
      expectString("text", text);
      await requireCopilot().send(text);
    },

    async setCopilot(handle) {
      if (handle !== null && (typeof handle?.send !== "function" || typeof handle.snapshot !== "function")) {
        throw new Error("setCopilot: expected { send, snapshot } or null");
      }
      copilot = handle;
    },

    async getCopilotSnapshot() {
      return requireCopilot().snapshot();
    },

    async acceptCard(id) {
      run({ type: "acceptProposal", id: pickProposal(id).id });
    },

    async rejectCard(id) {
      run({ type: "rejectProposal", id: pickProposal(id).id });
    },

    async undo() {
      if (store.getState().history.past.length === 0) throw new Error("undo: nothing to undo");
      run({ type: "undo" });
    },

    async redo() {
      if (store.getState().history.future.length === 0) throw new Error("redo: nothing to redo");
      run({ type: "redo" });
    },

    async getViewContext() {
      const ctx = viewContext(store.getState());
      return {
        ...ctx,
        selection: { ...ctx.selection },
        plan: ctx.plan === null ? null : toJson(SitePlanSchema, ctx.plan, jsonOptions),
        resultSummary: ctx.resultSummary === null ? null : toJson(SummaryMetricsSchema, ctx.resultSummary, jsonOptions),
        diagnostics: ctx.diagnostics.map((d) => toJson(DiagnosticSchema, d, jsonOptions)),
      };
    },

    async getCommandLog() {
      // logToJson is typed as generic JSON; its shape is exactly CommandLogEntry (see bus/log.ts).
      return logToJson(store.getLog()) as unknown as CommandLogEntry[];
    },

    async waitIdle(timeoutMs = 10_000) {
      await withTimeout(store.whenIdle(), timeoutMs, `waitIdle: not idle after ${timeoutMs} ms`);
      const error = store.getState().error;
      // Command rejections already failed the call that caused them; anything else is the engine.
      if (error !== null && error.kind !== "command") throw new Error(`engine error (${error.kind}): ${error.message}`);
    },

    async getConsoleErrors() {
      return [...errors];
    },
  };
}

type Node = Record<string, unknown>;

/** Every settable leaf reachable from `desc` (through unset sub-messages too), with its current value. */
function collectControls(desc: DescMessage, node: Node, prefix: string, out: Control[]): void {
  for (const field of desc.fields) {
    const path = prefix + field.name;
    const raw = node[field.localName];
    switch (field.fieldKind) {
      case "scalar":
      case "enum":
        pushLeaf(field, path, raw, out);
        break;
      case "message":
        collectControls(field.message, (raw ?? create(field.message)) as Node, `${path}.`, out);
        break;
      case "list":
        (raw as unknown[]).forEach((item, i) => {
          if (field.listKind === "message") collectControls(field.message, item as Node, `${path}[${i}].`, out);
          else pushLeaf(field, `${path}[${i}]`, item, out);
        });
        break;
      case "map":
        break; // not addressable through paths
    }
  }
}

function pushLeaf(field: DescField, path: string, raw: unknown, out: Control[]): void {
  if (field.fieldKind === "enum" || (field.fieldKind === "list" && field.listKind === "enum")) {
    out.push({ path, type: field.enum.name, options: field.enum.values.map((v) => v.name), value: enumName(field.enum, raw) });
    return;
  }
  if (field.fieldKind !== "scalar" && !(field.fieldKind === "list" && field.listKind === "scalar")) return;
  if (field.scalar === ScalarType.BYTES) return;
  out.push({ path, type: ScalarType[field.scalar].toLowerCase(), value: scalarValue(raw) });
}

function enumName(desc: DescEnum, raw: unknown): string {
  return desc.values.find((v) => v.number === raw)?.name ?? String(raw);
}

function scalarValue(raw: unknown): ControlValue {
  if (typeof raw === "bigint") return Number(raw);
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  throw new Error(`unexpected scalar value ${String(raw)}`);
}

function captureConsoleErrors(): string[] {
  const errors: string[] = [];
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    errors.push(args.map(describe).join(" "));
    original(...args);
  };
  window.addEventListener("error", (e) => errors.push(`uncaught: ${e.message}`));
  window.addEventListener("unhandledrejection", (e) => errors.push(`unhandled rejection: ${describe(e.reason)}`));
  return errors;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function expectString(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string") throw new Error(`${name} must be a string, got ${typeof value}`);
}

function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}
