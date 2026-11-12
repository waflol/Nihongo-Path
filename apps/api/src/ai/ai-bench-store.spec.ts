import { afterEach, describe, expect, it, vi } from "vitest";
import type { BenchResult } from "./ai-benchmark.js";
import { AiServicesService } from "./ai-services.service.js";

afterEach(() => vi.unstubAllGlobals());

describe("saveBench keeps the last good result per task", () => {
  const good: BenchResult = { ok: true, at: "t1", ms: 5000, accuracy: 90, items: 10, answered: 10, source: "eval" };
  const failed: BenchResult = { ...good, ok: false, at: "t2", ms: 60000, accuracy: 0, answered: 0, error: "HTTP 429" };
  type Upd = [unknown, { $set: Record<string, BenchResult>; $push: Record<string, { $each: { at: string; accuracy: number; ok: boolean }[]; $slice: number }> }];

  function make(prev: BenchResult | undefined) {
    const updateOne = vi.fn(() => ({ exec: async () => undefined }));
    const model = { findById: () => ({ select: () => ({ lean: () => ({ exec: async () => ({ benchByTask: prev ? { translate: prev } : {} }) }) }) }), updateOne };
    return { svc: new AiServicesService(undefined, model as never), updateOne };
  }
  const call = (u: ReturnType<typeof make>["updateOne"]) => u.mock.calls[0] as unknown as Upd;

  it("a failed attempt does not overwrite a good result — it is annotated, and still lands in the history", async () => {
    const { svc, updateOne } = make(good);
    await svc.saveBench("507f1f77bcf86cd799439011", "translate", failed);
    const u = call(updateOne)[1];
    expect(u.$set["benchByTask.translate"]).toMatchObject({ ok: true, accuracy: 90, lastAttempt: { at: "t2", error: "HTTP 429" } });
    expect(u.$push["benchHistory.translate"]).toMatchObject({ $each: [{ at: "t2", ok: false }], $slice: -30 });
  });

  it("a successful run replaces it and adds a history line; a first failure is stored as a failure", async () => {
    const a = make(good);
    await a.svc.saveBench("507f1f77bcf86cd799439011", "translate", { ...good, at: "t3", accuracy: 70 });
    expect(call(a.updateOne)[1].$set["benchByTask.translate"]).toMatchObject({ accuracy: 70, at: "t3", task: "translate" });
    expect(call(a.updateOne)[1].$push["benchHistory.translate"].$each[0]).toMatchObject({ accuracy: 70 });
    const b = make(undefined);
    await b.svc.saveBench("507f1f77bcf86cd799439011", "translate", failed);
    expect(call(b.updateOne)[1].$set["benchByTask.translate"]).toMatchObject({ ok: false, error: "HTTP 429" });
  });

  it("each task keeps its own history", async () => {
    const { svc, updateOne } = make(undefined);
    await svc.saveBench("507f1f77bcf86cd799439011", "grammar", good);
    expect(Object.keys(call(updateOne)[1].$push)).toEqual(["benchHistory.grammar"]);
  });
});

describe("priority per task", () => {
  const doc = (id: string, priority: number, taskPriority?: Record<string, number>) => ({
    _id: id,
    label: id,
    provider: "groq",
    modelName: "m",
    keyBox: "x",
    priority,
    taskPriority,
    rpm: 10,
    enabled: true,
  });

  it("available(task) follows that task's own order and falls back to the general one", async () => {
    const docs = [doc("a", 0, { write: 5 }), doc("b", 1, { write: 0 }), doc("c", 2)];
    const model = { find: () => ({ sort: () => ({ exec: async () => docs }) }) };
    const svcs = new AiServicesService(undefined, model as never);
    (svcs as unknown as { keyOf: () => string }).keyOf = () => "k";
    expect((await svcs.available()).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect((await svcs.available("write")).map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect((await svcs.available("translate")).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
});
