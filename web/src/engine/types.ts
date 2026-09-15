import type { Result, SitePlan } from "../gen/capplanner/v1/engine_pb";

/**
 * The SPA's view of the engine (WS5 implements the WASM-backed version; `fake.ts` is the stand-in).
 * Every failure — module load, encode/decode, a recovered panic — is a rejected promise carrying an
 * `EngineError`, never a thrown exception or a silently-empty Result.
 */
export interface Engine {
  analyze(plan: SitePlan): Promise<Result>;
  optimize(plan: SitePlan): Promise<Result>;
  dispose(): void;
}

export type EngineErrorKind = "load" | "encode" | "decode" | "internal" | "disposed";

export class EngineError extends Error {
  readonly kind: EngineErrorKind;

  constructor(kind: EngineErrorKind, message: string) {
    super(message);
    this.name = "EngineError";
    this.kind = kind;
  }
}

export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}
