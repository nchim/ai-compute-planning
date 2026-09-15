import { create } from "@bufbuild/protobuf";

import {
  ResultSchema,
  Severity,
  Status,
  type Result,
  type SitePlan,
} from "../gen/capplanner/v1/engine_pb";
import { EngineError, type Engine } from "./types";

// STUB: stands in for the WASM engine (WS5) so the shell, bus and tests work before it merges.
// Returns a plausible fixed Result (empty tables/charts) that echoes a few plan inputs, and always
// includes an INFO diagnostic so nobody mistakes these numbers for engine output.
export function createFakeEngine(): Engine {
  let disposed = false;

  const run = (plan: SitePlan): Promise<Result> => {
    if (disposed) {
      return Promise.reject(new EngineError("disposed", "fake engine has been disposed"));
    }
    return Promise.resolve(fakeResult(plan));
  };

  return {
    analyze: run,
    optimize: run,
    dispose() {
      disposed = true;
    },
  };
}

export function fakeResult(plan: SitePlan): Result {
  const targetMw = plan.compute?.targetItLoadMw ?? 0;
  const energizeMonth = plan.power?.interconnection?.gridEnergizeMonth ?? 0;
  return create(ResultSchema, {
    status: Status.OK,
    diagnostics: [
      {
        severity: Severity.INFO,
        code: "FAKE_ENGINE",
        message: "Result produced by the fake engine; numbers are placeholders, not model output.",
        hint: "Build the WASM engine (make wasm) and run with VITE_ENGINE=wasm.",
      },
    ],
    summary: {
      lcocPerGpuHour: 1.85,
      totalCapex: targetMw * 10_000_000,
      capexPerMw: 10_000_000,
      timeToEnergizeMonths: energizeMonth,
      mwOnlineFinal: targetMw,
      demandCapturePct: 72,
    },
    conservation: {
      allPassed: true,
      checks: [{ name: "fake_engine_placeholder", passed: true, residual: 0, tolerance: 1e-6 }],
    },
  });
}
