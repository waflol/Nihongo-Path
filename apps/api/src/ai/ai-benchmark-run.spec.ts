import { afterEach, describe, expect, it, vi } from "vitest";
import { AiExampleService } from "./ai-example.service.js";
import { BENCH_ITEMS, type BenchResult } from "./ai-benchmark.js";
import { providerById } from "./ai-providers.js";
import { AiServicesService, type RuntimeAiService } from "./ai-services.service.js";

const svc: RuntimeAiService = {
  id: "s1",
  label: "Groq",
  provider: providerById("groq")!,
  model: "openai/gpt-oss-120b",
  key: "k-secret",
  rpm: 600,
};

const goodAnswer = JSON.stringify({
  items: BENCH_ITEMS.map((it, i) =>
    it.task.kind === "translate"
      ? { id: i + 1, vi: it.ref, matches: it.expectMatch }
      : { id: i + 1, ja: `${it.stem}です。`, vi: "câu ví dụ" },
  ),
});
const chatOk = () => new Response(JSON.stringify({ choices: [{ message: { content: goodAnswer } }] }), { status: 200 });

function make() {
  const services = { reportOk: vi.fn(), reportFailure: vi.fn(), saveBench: vi.fn(), available: async () => [svc] };
  return { services, examples: new AiExampleService(services as never) };
}

afterEach(() => vi.unstubAllGlobals());

describe("benchmark runs", () => {
  it("runs 3 times by default and combines them", async () => {
    const fetchMock = vi.fn(async () => chatOk());
    vi.stubGlobal("fetch", fetchMock);
    const { examples, services } = make();
    const r = await examples.benchmark(svc);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ ok: true, accuracy: 100, successRate: 1 });
    expect(r.runs).toHaveLength(3);
    expect(r.latency).toBeDefined();
    expect(services.reportOk).toHaveBeenCalled();
    expect(services.saveBench).toHaveBeenCalledWith("s1", r);
  });

  it("honours the requested number of runs (1–5)", async () => {
    const fetchMock = vi.fn(async () => chatOk());
    vi.stubGlobal("fetch", fetchMock);
    await make().examples.benchmark(svc, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await make().examples.benchmark(svc, 99);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("stops after the first rate-limit failure instead of burning more quota", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "free-models-per-day" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { examples, services } = make();
    const r = await examples.benchmark(svc);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, successRate: 0 });
    expect(r.runs).toHaveLength(1);
    expect(services.reportFailure).toHaveBeenCalledWith("s1", "rate", expect.stringContaining("free-models-per-day"), undefined);
  });

  it("stops after two transient failures in a row", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await make().examples.benchmark(svc, 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.runs).toHaveLength(2);
  });

  it("a flaky service keeps its results, records the failure and is not put on cooldown", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => (++n === 2 ? new Response("boom", { status: 500 }) : chatOk()));
    const { examples, services } = make();
    const r = await examples.benchmark(svc);
    expect(r).toMatchObject({ ok: true, successRate: 0.667 });
    expect(r.runs!.map((x) => x.ok)).toEqual([true, false, true]);
    expect(services.reportFailure).not.toHaveBeenCalled();
  });
});

describe("saveBench keeps the last good result", () => {
  const good: BenchResult = { ok: true, at: "t1", ms: 5000, accuracy: 90, chrf: 80, terminology: 100, completeness: 100, matchAcc: 100, writeScore: 100, items: 14, answered: 14 };
  const failed: BenchResult = { ...good, ok: false, at: "t2", ms: 60000, accuracy: 0, answered: 0, error: "HTTP 429" };

  function make(prev: BenchResult | undefined) {
    const updateOne = vi.fn(() => ({ exec: async () => undefined }));
    const model = { findById: () => ({ select: () => ({ lean: () => ({ exec: async () => ({ bench: prev }) }) }) }), updateOne };
    return { svc: new AiServicesService(undefined, model as never), updateOne };
  }

  it("a failed attempt does not overwrite a good result — it is annotated", async () => {
    const { svc, updateOne } = make(good);
    await svc.saveBench("507f1f77bcf86cd799439011", failed);
    const set = (updateOne.mock.calls[0] as unknown as [unknown, { $set: { bench: BenchResult } }])[1].$set.bench;
    expect(set).toMatchObject({ ok: true, accuracy: 90, lastAttempt: { at: "t2", error: "HTTP 429" } });
  });

  it("a successful run replaces it, and a failure with nothing before is stored as a failure", async () => {
    const a = make(good);
    await a.svc.saveBench("507f1f77bcf86cd799439011", { ...good, at: "t3", accuracy: 70 });
    expect((a.updateOne.mock.calls[0] as unknown as [unknown, { $set: { bench: BenchResult } }])[1].$set.bench).toMatchObject({ accuracy: 70, at: "t3" });
    const b = make(undefined);
    await b.svc.saveBench("507f1f77bcf86cd799439011", failed);
    expect((b.updateOne.mock.calls[0] as unknown as [unknown, { $set: { bench: BenchResult } }])[1].$set.bench).toMatchObject({ ok: false, error: "HTTP 429" });
  });
});
