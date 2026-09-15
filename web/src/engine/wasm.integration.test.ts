// Runs the real compiled engine in Node (no browser): wasm_exec.js + WebAssembly.instantiate, then
// round-trips the reference plan through the same `serve` the worker uses and through createEngine
// with an in-process worker. Build the artifacts first:
//
//   GOOS=js GOARCH=wasm go build -o web/public/engine.wasm ./engine/wasm
//   cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" web/public/     (or: make wasm)

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { clone, create, fromBinary, fromJsonString, toBinary } from "@bufbuild/protobuf";
import { beforeAll, describe, expect, test } from "vitest";

import { PhasingMode, PhasingSchema, ResultSchema, SitePlanSchema, Status, type SitePlan } from "../gen/capplanner/v1/engine_pb";
import { createEngine, type WorkerLike } from "./client";
import { serve, type EngineOps, type Reply, type Request } from "./protocol";

const wasmPath = fileURLToPath(new URL("../../public/engine.wasm", import.meta.url));
const execPath = fileURLToPath(new URL("../../public/wasm_exec.js", import.meta.url));
const fixturePath = fileURLToPath(new URL("../../../fixtures/abilene-1.json", import.meta.url));

const built = existsSync(wasmPath) && existsSync(execPath);

describe.skipIf(!built)("compiled engine.wasm", () => {
  let ops: EngineOps;
  let plan: SitePlan;

  beforeAll(async () => {
    await import(/* @vite-ignore */ pathToFileURL(execPath).href);
    const Go = (globalThis as { Go?: new () => { importObject: WebAssembly.Imports; run(i: WebAssembly.Instance): Promise<void> } }).Go;
    if (!Go) throw new Error("wasm_exec.js did not define globalThis.Go");
    const go = new Go();
    const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), go.importObject);
    void go.run(instance);
    const registered = (globalThis as { capplanner?: EngineOps }).capplanner;
    if (!registered) throw new Error("engine.wasm did not register globalThis.capplanner");
    ops = registered;
    plan = fromJsonString(SitePlanSchema, readFileSync(fixturePath, "utf8"));
  });

  const expectModelResult = (bytes: Uint8Array) => {
    const res = fromBinary(ResultSchema, bytes);
    const codes = res.diagnostics.map((d) => d.code);
    expect(res.status).toBe(Status.OK);
    expect(codes).not.toContain("MALFORMED_INPUT");
    expect(codes).not.toContain("INTERNAL_ERROR");
    return res;
  };

  test("analyze round-trips abilene-1 through serve", () => {
    const reply = serve(ops, { id: 1, op: "analyze", bytes: toBinary(SitePlanSchema, plan) });
    if (!reply.ok) throw new Error(reply.error.message);
    expect(expectModelResult(reply.bytes).conservation?.allPassed).toBe(true);
  });

  test("optimize designs phases for an OPTIMIZE-mode plan through serve", () => {
    const toOptimize = clone(SitePlanSchema, plan);
    toOptimize.phasing = create(PhasingSchema, {
      mode: PhasingMode.OPTIMIZE,
      policy: { maxPhases: 3, minPhaseMw: 25, maxPhaseMw: 100, minMonthsBetweenPhases: 6, maxShortfallMw: 20 },
    });
    const reply = serve(ops, { id: 2, op: "optimize", bytes: toBinary(SitePlanSchema, toOptimize) });
    if (!reply.ok) throw new Error(reply.error.message);
    const res = expectModelResult(reply.bytes);
    expect(res.optimization?.bestPlan?.phasing?.mode).toBe(PhasingMode.EXPLICIT);
    expect(res.optimization?.frontier.length).toBeGreaterThan(0);
  });

  test("optimize on a SINGLE_SHOT plan is rejected with USE_ANALYZE, not a crash", () => {
    const res = fromBinary(ResultSchema, ops.optimize(toBinary(SitePlanSchema, plan)));
    expect(res.status).toBe(Status.INVALID_INPUT);
    expect(res.diagnostics.map((d) => d.code)).toEqual(["USE_ANALYZE"]);
  });

  test("corrupted bytes yield a MALFORMED_INPUT diagnostic, not a crash", () => {
    const res = fromBinary(ResultSchema, ops.analyze(new Uint8Array([0xff, 0xff, 0xff, 0xff])));
    expect(res.status).toBe(Status.INVALID_INPUT);
    expect(res.diagnostics.map((d) => d.code)).toEqual(["MALFORMED_INPUT"]);
    expect(res.diagnostics[0]?.actual).not.toBe("");
  });

  test("a non-Uint8Array argument yields MALFORMED_INPUT", () => {
    const res = fromBinary(ResultSchema, ops.analyze("nope" as unknown as Uint8Array));
    expect(res.diagnostics.map((d) => d.code)).toEqual(["MALFORMED_INPUT"]);
  });

  test("createEngine over an in-process worker returns a Result", async () => {
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      terminate() {},
      postMessage(req: Request) {
        queueMicrotask(() => this.onmessage?.({ data: serve(ops, req) } as MessageEvent<Reply>));
      },
    };
    const engine = createEngine({ worker, timeoutMs: 5_000 });
    const res = await engine.analyze(plan);
    expectModelResult(toBinary(ResultSchema, res));
    engine.dispose();
  });
});

test.skipIf(built)("engine.wasm is absent", () => {
  console.warn(`Skipping wasm integration: build it first (see header of ${import.meta.url}).`);
});
