import { create, toBinary } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ResultSchema, SitePlanSchema, Status } from "../gen/capplanner/v1/engine_pb";
import { createEngine, type WorkerLike } from "./client";
import { EngineError, type Reply, type Request } from "./protocol";

/** A worker the test drives by hand: it records requests and replies only when told to. */
class FakeWorker implements WorkerLike {
  requests: Request[] = [];
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  terminated = false;
  postMessage(message: Request) {
    this.requests.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(reply: Reply) {
    this.onmessage?.({ data: reply } as MessageEvent<Reply>);
  }
  crash(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const plan = create(SitePlanSchema, { meta: { planId: "p1" } });
const okBytes = (status: Status) => toBinary(ResultSchema, create(ResultSchema, { status }));

let worker: FakeWorker;
beforeEach(() => {
  vi.useFakeTimers();
  worker = new FakeWorker();
});
afterEach(() => vi.useRealTimers());

async function rejectsWith(p: Promise<unknown>, kind: EngineError["kind"]) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(EngineError);
  expect((err as EngineError).kind).toBe(kind);
  return err as EngineError;
}

test("replies are matched to requests by id, in any order", async () => {
  const engine = createEngine({ worker });
  const a = engine.analyze(plan);
  const b = engine.optimize(plan);
  const [ra, rb] = worker.requests;
  expect(ra?.op).toBe("analyze");
  expect(rb?.op).toBe("optimize");
  expect(ra?.id).not.toBe(rb?.id);

  worker.reply({ id: rb!.id, ok: true, bytes: okBytes(Status.OK_WITH_WARNINGS) });
  worker.reply({ id: ra!.id, ok: true, bytes: okBytes(Status.OK) });
  expect((await a).status).toBe(Status.OK);
  expect((await b).status).toBe(Status.OK_WITH_WARNINGS);
});

test("stale and unknown ids are ignored", async () => {
  const engine = createEngine({ worker, timeoutMs: 100 });
  const p = engine.analyze(plan);
  const id = worker.requests[0]!.id;
  worker.reply({ id: id + 999, ok: true, bytes: okBytes(Status.OK) }); // unknown: no effect
  vi.advanceTimersByTime(100);
  await rejectsWith(p, "timeout");
  expect(() => worker.reply({ id, ok: true, bytes: okBytes(Status.OK) })).not.toThrow(); // stale
});

test("timeout rejects and later requests still work", async () => {
  const engine = createEngine({ worker, timeoutMs: 50 });
  const late = engine.analyze(plan);
  vi.advanceTimersByTime(50);
  const err = await rejectsWith(late, "timeout");
  expect(err.message).toContain("50 ms");

  const next = engine.analyze(plan);
  worker.reply({ id: worker.requests[1]!.id, ok: true, bytes: okBytes(Status.OK) });
  expect((await next).status).toBe(Status.OK);
});

describe("worker failures reject", () => {
  test("load error reported by the worker", async () => {
    const engine = createEngine({ worker });
    const p = engine.analyze(plan);
    worker.reply({ id: worker.requests[0]!.id, ok: false, error: { kind: "load", message: "no wasm" } });
    expect((await rejectsWith(p, "load")).message).toBe("no wasm");
  });

  test("worker crash rejects every in-flight request", async () => {
    const engine = createEngine({ worker });
    const a = engine.analyze(plan);
    const b = engine.optimize(plan);
    worker.crash("boom");
    expect((await rejectsWith(a, "worker")).message).toBe("boom");
    await rejectsWith(b, "worker");
  });

  test("dispose terminates the worker and rejects in-flight requests", async () => {
    const engine = createEngine({ worker });
    const p = engine.analyze(plan);
    engine.dispose();
    expect(worker.terminated).toBe(true);
    await rejectsWith(p, "worker");
  });
});

test("undecodable reply bytes reject with kind decode", async () => {
  const engine = createEngine({ worker });
  const p = engine.analyze(plan);
  worker.reply({ id: worker.requests[0]!.id, ok: true, bytes: new Uint8Array([0xff, 0xff, 0xff]) });
  await rejectsWith(p, "decode");
});
