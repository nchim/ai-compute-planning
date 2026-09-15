/** Reading plan mutations out of the command log (`bus/log.ts` shape). */
import type { CommandLogEntry, Json } from "../../src/session";

export interface Mutation {
  readonly seq: number;
  readonly type: string;
  /** SitePlan paths written; `["*"]` for a whole-plan load, `[]` for undo/redo. */
  readonly paths: readonly string[];
}

const mutatingTypes = new Set(["loadPlan", "setField", "applyPatch", "acceptProposal", "undo", "redo"]);

/** Accepted (not rejected) plan mutations with `seq > afterSeq`, oldest first. */
export function mutationsSince(log: readonly CommandLogEntry[], afterSeq: number): Mutation[] {
  return log
    .filter((e) => e.seq > afterSeq && e.rejected === null && mutatingTypes.has(e.command.type))
    .map((e) => ({ seq: e.seq, type: e.command.type, paths: pathsOf(log, e) }));
}

export function lastSeq(log: readonly CommandLogEntry[]): number {
  return log.at(-1)?.seq ?? 0;
}

function pathsOf(log: readonly CommandLogEntry[], entry: CommandLogEntry): string[] {
  const c = entry.command;
  switch (c.type) {
    case "loadPlan":
      return ["*"];
    case "setField":
      return [String(c["path"])];
    case "applyPatch":
      return patchPaths(c["patch"]);
    case "acceptProposal": {
      const proposal = log.find((e) => e.command.type === "proposeChange" && e.command["id"] === c["id"]);
      if (proposal === undefined) throw new Error(`command log: acceptProposal ${String(c["id"])} without its proposeChange`);
      return patchPaths(proposal.command["patch"]);
    }
    default:
      return [];
  }
}

function patchPaths(patch: Json | undefined): string[] {
  if (!Array.isArray(patch)) throw new Error("command log: patch is not an array");
  return patch.map((op) => {
    if (op === null || typeof op !== "object" || Array.isArray(op)) throw new Error("command log: patch op is not an object");
    return String(op["path"]);
  });
}
