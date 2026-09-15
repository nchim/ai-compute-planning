import { toJson, type JsonValue } from "@bufbuild/protobuf";

import { ResultSchema, SitePlanSchema } from "../gen/capplanner/v1/engine_pb";
import type { Command, LogEntry } from "./types";

/** Protojson form of a command — messages become JSON so the log survives JSON.stringify. */
export function commandToJson(command: Command): JsonValue {
  switch (command.type) {
    case "loadPlan":
      return { type: command.type, plan: toJson(SitePlanSchema, command.plan) };
    case "resultReceived":
      return { type: command.type, result: toJson(ResultSchema, command.result) };
    default:
      // Every other command is built from strings, numbers, booleans and arrays of those.
      return { ...command } as unknown as JsonValue;
  }
}

export function logToJson(log: readonly LogEntry[]): JsonValue {
  return log.map((e) => ({
    seq: e.seq,
    ts: e.ts,
    command: commandToJson(e.command),
    rejected: e.rejected === null ? null : { ...e.rejected },
  }));
}
