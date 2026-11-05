import { afterEach, describe, expect, it, vi } from "vitest";
import { AiExampleService } from "./ai-example.service.js";
import { BENCH_ITEMS, GRAMMAR_ITEMS, legacyTaskResult, type BenchResult } from "./ai-benchmark.js";
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

/** A perfect answer to the items found in the prompt (looked up in the fixed test set). */
function goodAnswerFor(prompt: string): string {
  const items = JSON.parse(prompt.slice(prompt.indexOf("ITEMS:") + 6)) as { id: number; task: string; ja?: string; word: string }[];
  return JSON.stringify({
    items: items.map((it) => {
      const ref = BENCH_ITEMS.find((b) => (it.task === "translate" ? b.task.kind === "translate" && b.task.ja === it.ja : b.task.kind === "write" && b.task.term === it.word))!;
      return ref.task.kind === "translate"
        ? { id: it.id, vi: ref.ref, matches: ref.expectMatch }
        : { id: it.id, ja: `${ref.stem}です。`, vi: "câu ví dụ" };
    }),
  });
}
const goodGrammar = JSON.stringify({
  items: GRAMMAR_ITEMS.map((it, i) => ({
    id: i + 1,
    translation: "bản dịch",
    tokens: Array.from({ length: 8 }, (_, k) => ({ text: `t${k}`, reading: "", pos: "danh từ", meaning: "nghĩa" })),
    grammar: it.needs.map((alts) => ({ pattern: alts[0], level: "N3", explanation: alts[0] })),
  })),
});
/** Answers a benchmark call: the grammar call (its prompt lists SENTENCES) or the translate + write batch. */
const chatOk = (init?: RequestInit) => {
  const prompt = String((JSON.parse(String(init?.body ?? "{}")) as { messages?: { content: string }[] }).messages?.[0]?.content ?? "");
  const content = prompt.includes("SENTENCES:") ? goodGrammar : goodAnswerFor(prompt);
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
};

function make() {
  const services = { reportOk: vi.fn(), reportFailure: vi.fn(), saveBench: vi.fn(), available: async () => [svc] };
  return { services, examples: new AiExampleService(services as never) };
}

afterEach(() => vi.unstubAllGlobals());

describe("benchmark runs", () => {
  it("scores one task at a time: 3 runs by default, combined, with its own history line", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => chatOk(init));
    vi.stubGlobal("fetch", fetchMock);
    const { examples, services } = make();
    const r = await examples.benchmark(svc, "translate");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r).toMatchObject({ ok: true, task: "translate", accuracy: 100, successRate: 1, items: 10 });
    expect(r.runs).toHaveLength(3);
    expect(r.details!.every((d) => d.kind === "translate")).toBe(true);
    expect(r.latency).toBeDefined();
    expect(services.reportOk).toHaveBeenCalled();
    expect(services.saveBench).toHaveBeenCalledWith("s1", "translate", expect.objectContaining({ ok: true }));
  });

  it("write and grammar are scored on their own", async () => {
    vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => chatOk(init));
    const w = await make().examples.benchmark(svc, "write", 1);
    expect(w).toMatchObject({ ok: true, task: "write", accuracy: 100, items: 4 });
    expect(w.details!.every((d) => d.kind === "write")).toBe(true);
    const g = await make().examples.benchmark(svc, "grammar", 1);
    expect(g).toMatchObject({ ok: true, task: "grammar", accuracy: 100, items: 3, grammarHit: 100, grammarSplit: 100 });
    expect(g.details!.every((d) => d.kind === "grammar")).toBe(true);
  });

  it("grammar scores low when the grammar points are missing", async () => {
    const bad = JSON.stringify({ items: GRAMMAR_ITEMS.map((_, i) => ({ id: i + 1, translation: "", tokens: [], grammar: [] })) });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: bad } }] }), { status: 200 }));
    const g = await make().examples.benchmark(svc, "grammar", 1);
    expect(g).toMatchObject({ ok: true, accuracy: 0 });
  });

  it("honours the requested number of runs (1–5)", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => chatOk(init));
    vi.stubGlobal("fetch", fetchMock);
    await make().examples.benchmark(svc, "write", 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    await make().examples.benchmark(svc, "write", 99);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("stops after the first rate-limit failure instead of burning more quota", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "free-models-per-day" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const { examples, services } = make();
    const r = await examples.benchmark(svc, "translate");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, successRate: 0 });
    expect(r.runs).toHaveLength(1);
    expect(services.reportFailure).toHaveBeenCalledWith("s1", "rate", expect.stringContaining("free-models-per-day"), undefined);
  });

  it("stops after two transient failures in a row", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await make().examples.benchmark(svc, "grammar", 5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.runs).toHaveLength(2);
  });

  it("a flaky service keeps its results, records the failure and is not put on cooldown", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async (_u: unknown, init?: RequestInit) => (++n === 2 ? new Response("boom", { status: 500 }) : chatOk(init)));
    const { examples, services } = make();
    const r = await examples.benchmark(svc, "translate");
    expect(r).toMatchObject({ ok: true, successRate: 0.667 });
    expect(r.runs!.map((x) => x.ok)).toEqual([true, false, true]);
    expect(services.reportFailure).not.toHaveBeenCalled();
  });

  it("a translate-only model can only be scored on translation", async () => {
    const m2m = { ...svc, id: "cf", provider: providerById("cloudflare")!, model: "@cf/meta/m2m100-1.2b" };
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ result: { translated_text: "bản dịch" } }), { status: 200 }));
    const { examples } = make();
    expect(await examples.benchmark(m2m, "translate", 1)).toMatchObject({ ok: true, task: "translate", translateOnly: true });
    await expect(examples.benchmark(m2m, "write", 1)).rejects.toThrow();
    await expect(examples.benchmark(m2m, "grammar", 1)).rejects.toThrow();
  });
});

describe("older combined benchmarks", () => {
  const old: BenchResult = { ok: true, at: "t", ms: 4000, accuracy: 90, chrf: 80, terminology: 100, completeness: 100, matchAcc: 100, writeScore: 60, items: 14, answered: 14 };
  it("legacyTaskResult rebuilds translate / write, and has no grammar", () => {
    expect(legacyTaskResult(old, "write")).toMatchObject({ accuracy: 60, ms: 4000, task: "write", legacy: true });
    expect(legacyTaskResult(old, "translate")?.accuracy).toBeCloseTo((0.35 * 80 + 0.15 * 100 + 0.1 * 100 + 0.2 * 100) / 0.8, 0);
    expect(legacyTaskResult(old, "grammar")).toBeUndefined();
    expect(legacyTaskResult({ ...old, translateOnly: true }, "write")).toBeUndefined();
    expect(legacyTaskResult({ ...old, task: "write" }, "write")).toBeUndefined();
  });
});

describe("saveBench keeps the last good result per task", () => {
  const good: BenchResult = { ok: true, at: "t1", ms: 5000, accuracy: 90, chrf: 80, terminology: 100, completeness: 100, matchAcc: 100, writeScore: 100, items: 10, answered: 10 };
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
