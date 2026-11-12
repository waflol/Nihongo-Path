import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { datasetKey, loadDataset } from "./eval-dataset.js";
import { judgedCriteria } from "./eval-judge.js";
import { EVALUATORS } from "./eval-evaluators.js";
import { buildReport } from "./eval-report.js";
import { EvalRunner, judgesFor, type CompleteFn } from "./eval-runner.js";
import { MemoryEvalStore, type RunDoc, type ServiceRef } from "./eval-store.js";
import type { EvalTask } from "./eval-types.js";

/**
 * End to end over the real bundled dataset with fake providers: candidate
 * calls answer from the prompt's ITEMS, judge calls answer from theirs. No
 * network, no database (memory store with the same contract as Mongo's).
 */
const ds = loadDataset(readFileSync(resolve(__dirname, "../../eval-data/japanese_ai_eval_dataset_v2_1000.json")), "json");
const KEY = datasetKey(ds.meta);

const cand = (id: string, model: string): ServiceRef => ({ serviceId: id, label: id, provider: "openai", model });
const judgeA: ServiceRef = { serviceId: "jA", label: "Judge A", provider: "anthropic", model: "claude-judge" };
const judgeB: ServiceRef = { serviceId: "jB", label: "Judge B", provider: "gemini", model: "gemini-judge" };

const itemsOf = (prompt: string) => JSON.parse(prompt.slice(prompt.indexOf("ITEMS:") + 6).trim()) as Record<string, any>[];
const taskOfPrompt = (p: string): EvalTask =>
  p.includes('"translation":string}') ? "translation" : p.includes('"ja":string,"vi":string') ? "sentence_generation" : p.includes('"usage_note"') ? "vocabulary_check" : "grammar_analysis";

/** A good candidate: right language, uses the pattern, right reading. */
function answer(task: EvalTask, it: Record<string, any>) {
  switch (task) {
    case "translation":
      return { id: it.id, translation: it.direction === "ja_to_vi" ? "Đây là bản dịch tiếng Việt." : "これは日本語の訳です。" };
    case "sentence_generation":
      return { id: it.id, ja: `毎日${String(it.pattern).replace(/[～〜]/g, "").split(/[／/]/)[0]}。`, vi: "Câu ví dụ." };
    case "vocabulary_check":
      return { id: it.id, reading: "がっこう", meaning_vi: "trường học", part_of_speech: "danh từ", usage_note: "Dùng phổ biến." };
    case "grammar_analysis":
      return { id: it.id, pattern: "～", meaning_vi: "nghĩa", formation: "V + x", function: "f", translation: "Bản dịch.", breakdown: [{ text: it.sentence, role: "câu" }], similar_patterns: [{ pattern: "～x", difference: "y" }], explanation: "z" };
  }
}

function fakeProviders(opts: { judgeScore?: (judge: string) => number; failCandidate?: (ref: ServiceRef, n: number) => Error | null } = {}) {
  const calls: { ref: string; purpose: string; n: number; temperature: number }[] = [];
  let candidateCalls = 0;
  const complete: CompleteFn = async (ref, prompt, o) => {
    const items = itemsOf(prompt);
    calls.push({ ref: ref.serviceId, purpose: o.purpose, n: items.length, temperature: o.temperature });
    if (o.purpose === "eval") {
      candidateCalls++;
      const err = opts.failCandidate?.(ref, candidateCalls);
      if (err) throw err;
      const task = taskOfPrompt(prompt);
      return { text: JSON.stringify({ items: items.map((it) => answer(task, it)) }), usage: { inputTokens: 100, outputTokens: 50 }, modelVersion: `${ref.model}-2026`, ms: 400 };
    }
    // Judge: full share of every criterion it was given, scaled.
    const crit = JSON.parse(prompt.match(/^CRITERIA: (.*)$/m)![1]) as { key: string; maxPoints: number }[];
    const f = (opts.judgeScore?.(ref.serviceId) ?? 100) / 100;
    return {
      text: JSON.stringify({ items: items.map((it) => ({ id: it.id, scores: Object.fromEntries(crit.map((c) => [c.key, Math.round(c.maxPoints * f)])), errorTags: f < 1 ? ["unnatural"] : [], confidence: 0.9, note: "" })) }),
      usage: null,
      modelVersion: null,
      ms: 300,
    };
  };
  return { complete, calls };
}

function newRun(store: MemoryEvalStore, over: Partial<RunDoc> = {}): RunDoc {
  const run: RunDoc = {
    id: `run${store.runs.size + 1}`,
    label: "t",
    datasetKey: KEY,
    filter: { levels: ["N5"], dedupe: true, perTaskLevel: 4 },
    candidates: [cand("c1", "gpt-x")],
    judges: [judgeA, judgeB],
    promptVersion: "v1",
    judgePromptVersion: "judge-v1",
    temperature: 0.3,
    batchSize: 3,
    judgeBatchSize: 2,
    repeats: 1,
    passThreshold: 70,
    allowSelfJudge: false,
    updateRanking: false,
    status: "queued",
    caseCount: 0,
    progress: { total: 0, done: 0, errors: 0 },
    ...over,
  };
  store.runs.set(run.id, run);
  return run;
}

function setup() {
  const store = new MemoryEvalStore();
  store.cases.set(KEY, ds.cases);
  store.priceTable = { "openai:gpt-x": { input: 1, output: 2 }, "anthropic:*": { input: 3, output: 15 }, "gemini:gemini-judge": { input: 0, output: 0 } };
  return store;
}

describe("EvalRunner (integration, fake providers)", () => {
  it("runs every task in batches, judges with both judges, stores results and a report", async () => {
    const store = setup();
    const { complete, calls } = fakeProviders();
    const completed: string[] = [];
    const runner = new EvalRunner(store, { complete, sleep: async () => undefined, onCompleted: async (r) => void completed.push(r.id) });
    const run = newRun(store);
    const done = await runner.execute(run.id);

    expect(done!.status).toBe("completed");
    expect(completed).toEqual([run.id]);
    // 4 tasks × 4 cases (N5, deduped, 4 per task-level), batches of 3 → 2 calls per task.
    expect(done!.caseCount).toBe(16);
    const cand = calls.filter((c) => c.purpose === "eval");
    expect(cand).toHaveLength(8);
    expect(cand.every((c) => c.n <= 3 && c.temperature === 0.3)).toBe(true);
    const judge = calls.filter((c) => c.purpose === "judge");
    expect(judge.every((c) => c.n <= 2 && c.temperature === 0)).toBe(true);
    expect(new Set(judge.map((c) => c.ref))).toEqual(new Set(["jA", "jB"]));

    const rows = [...store.resultRows.values()];
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => r.status === "scored" && r.verdicts!.length === 2)).toBe(true);
    // Batch usage shared over the batch: 100 / 3 input tokens per case.
    expect(rows.find((r) => r.caseId === "TR-N5-001")!.inputTokens).toBeCloseTo(100 / 3);

    const rep = await buildReport(done!, store.results(run.id), store.calls(run.id));
    const c = rep.candidates[0];
    expect(c.modelVersion).toBe("gpt-x-2026");
    expect(c.errorRate).toBe(0);
    expect(Object.keys(c.byTask).sort()).toEqual(["grammar_analysis", "sentence_generation", "translation", "vocabulary_check"]);
    expect(c.byLevel.N5!.n).toBe(16);
    expect(c.latency!.median).toBe(400);
    expect(c.tokens).toMatchObject({ input: 800, output: 400, estimated: false });
    // 8 calls × (100 × $1 + 50 × $2) / 1M = $0.0016; judge A is priced, judge B is free.
    expect(c.cost.candidate).toBeCloseTo(0.0016, 6);
    expect(c.cost.judge).toBeGreaterThan(0);
    expect(done!.summary).toBeTruthy();
    // Knowledge points only: rubric criteria every case of a task carries are left out.
    const focus = c.byFocus.map((f) => f.focus);
    expect(focus).toContain("copula");
    expect(focus).not.toContain("reading");
    expect(focus).not.toContain("naturalness");
    expect(c.byFocus.every((f, i, a) => i === 0 || a[i - 1].mean <= f.mean)).toBe(true);
  });

  it("never lets a judge score its own model", async () => {
    const store = setup();
    const { complete, calls } = fakeProviders();
    const runner = new EvalRunner(store, { complete, sleep: async () => undefined });
    const self = cand("c2", "claude-judge");
    expect(judgesFor({ judges: [judgeA, judgeB], allowSelfJudge: true }, self).map((j) => j.judge.serviceId)).toEqual(["jB"]);
    const run = newRun(store, { candidates: [self], allowSelfJudge: true, filter: { tasks: ["translation"], levels: ["N5"], perTaskLevel: 2 } });
    await runner.execute(run.id);
    expect(calls.filter((c) => c.purpose === "judge").map((c) => c.ref)).toEqual(["jB"]);
    // One judge left → every result asks for human review.
    expect([...store.resultRows.values()].every((r) => r.needsReview && r.verdicts!.length === 1)).toBe(true);
  });

  it("flags disagreeing judges for review and averages them", async () => {
    const store = setup();
    const { complete } = fakeProviders({ judgeScore: (j) => (j === "jA" ? 100 : 40) });
    const runner = new EvalRunner(store, { complete, sleep: async () => undefined });
    const run = newRun(store, { filter: { tasks: ["translation"], levels: ["N5"], perTaskLevel: 2 } });
    await runner.execute(run.id);
    const r = [...store.resultRows.values()][0];
    expect(r.total).toBe(70);
    expect(r.needsReview).toBe(true);
    expect(r.errorTags).toContain("unnatural");
  });

  it("retries a rate limit, records a failed batch as errors, and stops a candidate on an auth failure", async () => {
    const store = setup();
    const rate = Object.assign(new Error("HTTP 429"), { kind: "rate", retryAfterMs: 1000 });
    const auth = Object.assign(new Error("HTTP 401"), { kind: "auth" });
    const { complete } = fakeProviders({ failCandidate: (ref, n) => (ref.serviceId === "bad" ? auth : n === 1 ? rate : null) });
    const sleeps: number[] = [];
    const runner = new EvalRunner(store, { complete, sleep: async (ms) => void sleeps.push(ms) });
    const run = newRun(store, { candidates: [cand("c1", "gpt-x"), cand("bad", "other")], filter: { tasks: ["translation"], levels: ["N5"], perTaskLevel: 4 } });
    const done = await runner.execute(run.id);
    expect(sleeps).toContain(5000);
    expect(done!.candidateErrors).toEqual({ "1": "auth: HTTP 401" });
    const rep = await buildReport(done!, store.results(run.id), store.calls(run.id));
    expect(rep.candidates[0].errorRate).toBe(0);
    // Bad candidate: its first batch (3) failed, the last case never ran → all 4 count as errors.
    expect(rep.candidates[1]).toMatchObject({ errors: 3, missing: 1, errorRate: 100 });
    expect(rep.candidates[1].topErrors[0].tag).toBe("call_error");
  });

  it("resumes without redoing stored results, and measures consistency over repeats", async () => {
    const store = setup();
    const { complete, calls } = fakeProviders();
    const runner = new EvalRunner(store, { complete, sleep: async () => undefined });
    const run = newRun(store, { repeats: 2, filter: { tasks: ["vocabulary_check"], levels: ["N5"], perTaskLevel: 3 } });
    await runner.execute(run.id);
    const before = calls.filter((c) => c.purpose === "eval").length;
    await store.updateRun(run.id, { status: "interrupted" });
    const again = await runner.execute(run.id);
    expect(calls.filter((c) => c.purpose === "eval").length).toBe(before);
    expect(store.resultRows.size).toBe(6);
    const rep = await buildReport(again!, store.results(run.id), store.calls(run.id));
    expect(rep.candidates[0].consistency).toMatchObject({ repeats: 2, meanStdev: 0, stableShare: 100, outputAgreement: 100 });
    // Repeated identical answers are judged once per judge (cache).
    expect(calls.filter((c) => c.purpose === "judge").reduce((a, c) => a + c.n, 0)).toBe(6);
  });

  it("stops when cancelled", async () => {
    const store = setup();
    const { complete } = fakeProviders();
    let runner: EvalRunner;
    const wrapped: CompleteFn = async (...a) => {
      runner.cancel("run1");
      return complete(...a);
    };
    runner = new EvalRunner(store, { complete: wrapped, sleep: async () => undefined });
    const run = newRun(store);
    const done = await runner.execute(run.id);
    expect(done!.status).toBe("cancelled");
    expect(store.resultRows.size).toBeLessThan(16);
  });

  it("asks the judges only the judged criteria", () => {
    for (const ev of Object.values(EVALUATORS)) expect(judgedCriteria(ev.rubric).every((c) => c.source !== "code")).toBe(true);
  });

  it("keeps live progress and an activity log: phases, rate-limit waits, per-batch lines, totals", async () => {
    const store = setup();
    const rate = Object.assign(new Error("HTTP 429"), { kind: "rate", retryAfterMs: 8000 });
    const { complete } = fakeProviders({ failCandidate: (_ref, n) => (n === 1 ? rate : null) });
    const phases: string[] = [];
    const update = store.updateRun.bind(store);
    store.updateRun = async (id, patch) => {
      const cur = patch.progress?.current;
      if (cur) phases.push(`${cur.phase}:${cur.who}${cur.waitUntil ? ":wait" : ""}`);
      return update(id, patch);
    };
    const runner = new EvalRunner(store, { complete, sleep: async () => undefined });
    const run = newRun(store, { filter: { tasks: ["translation", "grammar_analysis"], levels: ["N5"], perTaskLevel: 2 } });
    const done = await runner.execute(run.id);

    expect(phases).toContain("calling:c1");
    expect(phases).toContain("waiting:c1:wait");
    expect(phases).toContain("judging:Judge A + Judge B");
    const p = done!.progress;
    expect(p).toMatchObject({ total: 4, done: 4, errors: 0, current: null });
    expect(p.byCandidate!["0"]).toMatchObject({ total: 4, done: 4, scored: 4 });
    expect(p.byTask!.translation).toMatchObject({ total: 2, done: 2 });
    expect(p.calls).toMatchObject({ candidate: 2, failed: 0 });
    const log = done!.events!.map((e) => e.text);
    expect(log[0]).toMatch(/^Bắt đầu: 4 câu × 1 dịch vụ/);
    expect(log.some((t) => /hết hạn mức \(429\) — chờ 8s/.test(t))).toBe(true);
    expect(log.some((t) => /c1 · Dịch · lô 1\/1 \(2 câu\): TB 100 điểm/.test(t))).toBe(true);
    expect(log.at(-1)).toMatch(/Hoàn tất: 4\/4/);

    // Resume: the log says where it continues from.
    await store.updateRun(run.id, { status: "interrupted" });
    const again = await runner.execute(run.id);
    expect(again!.events!.map((e) => e.text)).toContain("Chạy tiếp từ 4/4 kết quả");
  });
});
