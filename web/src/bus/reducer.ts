import { clone } from "@bufbuild/protobuf";

import { ResultSchema, SitePlanSchema, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import { PathError, applyPatch } from "./paths";
import type { AppError, Command, PatchOp, Proposal, State } from "./types";

/**
 * Pure reducer: `(state, command) → state`. No clock, no ids, no I/O — the store supplies those.
 * A command that cannot be applied is *rejected*: the returned state equals the input except for
 * `error`, which carries a precise message. Nothing throws.
 */
export function reduce(state: State, cmd: Command): State {
  switch (cmd.type) {
    case "loadPlan":
      return commitPlan(state, clone(SitePlanSchema, cmd.plan));
    case "setField":
      return patchPlan(state, [{ path: cmd.path, value: cmd.value }]);
    case "applyPatch":
      return patchPlan(state, cmd.patch);
    case "proposeChange":
      return propose(state, { id: cmd.id, summary: cmd.summary, patch: cmd.patch, status: "pending" });
    case "acceptProposal":
      return settleProposal(state, cmd.id, "accepted");
    case "rejectProposal":
      return settleProposal(state, cmd.id, "rejected");
    case "undo":
      return shiftHistory(state, "past", "future");
    case "redo":
      return shiftHistory(state, "future", "past");
    case "setBaseline":
      return setBaseline(state, cmd.label);
    case "clearBaseline":
      return state.baseline === null ? reject(state, "no baseline is set") : { ...state, baseline: null, compare: false };
    case "toggleCompare":
      return state.baseline === null ? reject(state, "no baseline is set: pin one before comparing") : { ...state, compare: !state.compare };
    case "select":
      return { ...state, selection: cmd.selection };
    case "optimizeStarted":
      return { ...state, optimizing: true };
    case "optimizeSettled":
      return { ...state, optimizing: false };
    case "resultReceived":
      return { ...state, result: cmd.result, error: null };
    case "errorRaised":
      return { ...state, error: cmd.error };
    case "clearError":
      return { ...state, error: null };
  }
}

/** True when `next` differs from `prev` by a plan mutation — the trigger for re-analysis. */
export function planChanged(prev: State, next: State): boolean {
  return next.plan !== prev.plan;
}

function reject(state: State, message: string): State {
  const error: AppError = { kind: "command", message };
  return { ...state, error };
}

function commitPlan(state: State, plan: SitePlan): State {
  const past = state.plan === null ? state.history.past : [...state.history.past, state.plan];
  return { ...state, plan, history: { past, future: [] } };
}

function patchPlan(state: State, patch: readonly PatchOp[]): State {
  if (state.plan === null) return reject(state, "no plan loaded");
  try {
    return commitPlan(state, applyPatch(state.plan, patch));
  } catch (err) {
    if (err instanceof PathError) return reject(state, err.message);
    throw err;
  }
}

function propose(state: State, proposal: Proposal): State {
  if (state.plan === null) return reject(state, "no plan loaded");
  if (state.proposals.some((p) => p.id === proposal.id)) {
    return reject(state, `proposal "${proposal.id}" already exists`);
  }
  // Validate now so the Copilot learns about a bad path immediately, not when the human clicks Accept.
  try {
    applyPatch(state.plan, proposal.patch);
  } catch (err) {
    if (err instanceof PathError) return reject(state, `proposal rejected: ${err.message}`);
    throw err;
  }
  return { ...state, proposals: [...state.proposals, proposal] };
}

function settleProposal(state: State, id: string, status: "accepted" | "rejected"): State {
  const proposal = state.proposals.find((p) => p.id === id);
  if (proposal === undefined) return reject(state, `no proposal "${id}"`);
  if (proposal.status !== "pending") return reject(state, `proposal "${id}" is already ${proposal.status}`);
  const next = status === "accepted" ? patchPlan(state, proposal.patch) : state;
  if (next.error !== state.error) return next; // the patch was rejected; keep the proposal pending
  return {
    ...next,
    proposals: next.proposals.map((p) => (p.id === id ? { ...p, status } : p)),
  };
}

/** Pins the current plan + Result as clones so later edits (and undo/redo, which touch only `plan`) never reach them. */
function setBaseline(state: State, label: string): State {
  if (state.plan === null || state.result === null) return reject(state, "no result to pin as baseline yet");
  if (label.trim() === "") return reject(state, "baseline label must not be empty");
  const baseline = { label, plan: clone(SitePlanSchema, state.plan), result: clone(ResultSchema, state.result) };
  return { ...state, baseline };
}

function shiftHistory(state: State, from: "past" | "future", to: "past" | "future"): State {
  const source = state.history[from];
  const plan = source[source.length - 1];
  if (plan === undefined || state.plan === null) return state; // nothing to undo/redo: a no-op, not an error
  return {
    ...state,
    plan,
    history: { ...state.history, [from]: source.slice(0, -1), [to]: [...state.history[to], state.plan] },
  };
}
