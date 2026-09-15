// Wire protocol between the main-thread client and the engine worker, plus the one error type every
// engine failure is reported as.

export type Op = "analyze" | "optimize";

/** The functions the Go module publishes on `globalThis.capplanner`. */
export type EngineOps = Record<Op, (bytes: Uint8Array) => Uint8Array>;

export type EngineErrorKind = "load" | "encode" | "decode" | "worker" | "timeout";

export class EngineError extends Error {
  override readonly name = "EngineError";
  constructor(
    readonly kind: EngineErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface Request {
  id: number;
  op: Op;
  bytes: Uint8Array;
}

export type Reply =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: false; error: { kind: "load" | "worker"; message: string } };

/**
 * Runs one request against loaded ops. A throw here means the Go side broke its own contract
 * (it recovers panics into a Result), so it is reported as a worker error rather than crashing.
 */
export function serve(ops: EngineOps, req: Request): Reply {
  try {
    return { id: req.id, ok: true, bytes: ops[req.op](req.bytes) };
  } catch (err) {
    return { id: req.id, ok: false, error: { kind: "worker", message: describe(err) } };
  }
}

export function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
