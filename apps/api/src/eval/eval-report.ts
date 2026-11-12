import { chrF } from "../ai/ai-benchmark.js";
import type { CallRow, ResultRow, RunDoc } from "./eval-store.js";
import { EVAL_TASKS, JLPT_LEVELS, type EvalTask, type JlptLevel } from "./eval-types.js";

/** Focus tags that every case of a task carries — rubric criteria, not knowledge points. */
export const TASK_WIDE_FOCUS = new Set([
  "reading", "contextual_meaning", "part_of_speech", "usage",
  "pattern_identification", "meaning", "formation", "function", "translation",
  "instruction_compliance", "naturalness",
]);

export interface ScoreStat {
  /** Mean of the scored results (human score where a reviewer set one). */
  mean: number | null;
  n: number;
  /** Share (0–100) of scored results at or above the run's pass threshold. */
  passRate: number | null;
}

export interface LatencyStat {
  calls: number;
  mean: number;
  median: number;
  p95: number;
  /** Mean latency per case (call time shared over the batch). */
  perItem: number;
}

export interface CandidateReport {
  index: number;
  label: string;
  provider: string;
  model: string;
  modelVersion?: string;
  serviceId: string;
  modelOverride?: boolean;
  /** Stopped early (key rejected …). */
  stopped?: string;
  expected: number;
  scored: number;
  errors: number;
  judgeFailed: number;
  missing: number;
  /** (call / parse errors + missing) / expected, 0–100. */
  errorRate: number;
  parseErrorRate: number;
  overall: ScoreStat & { stdev: number | null };
  byTask: Partial<Record<EvalTask, ScoreStat>>;
  byLevel: Partial<Record<JlptLevel, ScoreStat>>;
  byTaskLevel: Partial<Record<EvalTask, Partial<Record<JlptLevel, ScoreStat>>>>;
  /** Weakest evaluation-focus tags (lowest mean, n ≥ 2). */
  /**
   * Mean score per knowledge point (`evaluation_focus` of the cases: a grammar pattern or a translation skill),
   * lowest first. Criteria every case of a task carries (reading, meaning, naturalness…) are left out:
   * they only repeat the task score.
   */
  byFocus: { focus: string; mean: number; n: number; passRate: number }[];
  latency: LatencyStat | null;
  latencyByTask: Partial<Record<EvalTask, number>>;
  tokens: { input: number; output: number; estimated: boolean; judgeInput: number; judgeOutput: number };
  /** USD; null parts mean no price was set for that model. */
  cost: { candidate: number | null; judge: number | null; total: number | null; perCase: number | null };
  /** Only with 2+ repeats. */
  consistency: {
    repeats: number;
    /** Mean over cases of the standard deviation of the score across repeats. */
    meanStdev: number;
    /** Share (0–100) of cases whose score range across repeats is ≤ 10 points. */
    stableShare: number;
    /** Mean chrF (0–100) between the outputs of different repeats of a case. */
    outputAgreement: number;
    /** Share (0–100) of cases that passed in every repeat. */
    passAllShare: number;
  } | null;
  topErrors: { tag: string; count: number; share: number; examples: string[] }[];
  needsReview: number;
  reviewed: number;
}

export interface EvalReport {
  runId: string;
  label: string;
  datasetKey: string;
  status: string;
  promptVersion: string;
  judgePromptVersion: string;
  temperature: number;
  batchSize: number;
  repeats: number;
  passThreshold: number;
  judges: { label: string; provider: string; model: string }[];
  caseCount: number;
  candidates: CandidateReport[];
  generatedAt: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

class Acc {
  sum = 0;
  n = 0;
  pass = 0;
  add(v: number, passed: boolean) {
    this.sum += v;
    this.n++;
    if (passed) this.pass++;
  }
  stat(): ScoreStat {
    return { mean: this.n ? round1(this.sum / this.n) : null, n: this.n, passRate: this.n ? round1((100 * this.pass) / this.n) : null };
  }
}

/** The score that counts for a result: the reviewer's when set, else the computed one. */
export const effectiveScore = (r: Pick<ResultRow, "total" | "humanTotal">) => (typeof r.humanTotal === "number" ? r.humanTotal : r.total);

/**
 * Report of one run, built by streaming its results and calls once (only
 * per-case score lists are kept, for the consistency figures). Missing
 * results (a candidate stopped early, a cancelled run) count as errors.
 */
export async function buildReport(run: RunDoc, results: AsyncIterable<ResultRow>, calls: AsyncIterable<CallRow>): Promise<EvalReport> {
  const st = run.candidates.map(() => ({
    rows: 0,
    scored: 0,
    errors: 0,
    parseErrors: 0,
    judgeFailed: 0,
    all: [] as number[],
    overall: new Acc(),
    byTask: new Map<EvalTask, Acc>(),
    byLevel: new Map<JlptLevel, Acc>(),
    byTL: new Map<string, Acc>(),
    byFocus: new Map<string, Acc>(),
    perCase: new Map<string, { scores: number[]; outputs: string[]; passes: boolean[] }>(),
    tags: new Map<string, { count: number; examples: string[] }>(),
    needsReview: 0,
    reviewed: 0,
    itemMs: [] as number[],
  }));
  const pass = run.passThreshold ?? 70;
  const get = <K, V>(m: Map<K, V>, k: K, make: () => V) => m.get(k) ?? (m.set(k, make()), m.get(k)!);
  for await (const r of results) {
    const s = st[r.candidate];
    if (!s) continue;
    s.rows++;
    if (r.needsReview) s.needsReview++;
    if (r.reviewed) s.reviewed++;
    for (const t of r.errorTags ?? []) {
      const e = get(s.tags, t, () => ({ count: 0, examples: [] as string[] }));
      e.count++;
      if (e.examples.length < 3 && !e.examples.includes(r.caseId)) e.examples.push(r.caseId);
    }
    if (r.status === "error") {
      s.errors++;
      if ((r.errorTags ?? []).includes("parse_error")) s.parseErrors++;
      continue;
    }
    if (typeof r.itemMs === "number") s.itemMs.push(r.itemMs);
    const v = effectiveScore(r);
    if (v === null || v === undefined) {
      s.judgeFailed++;
      continue;
    }
    s.scored++;
    const ok = v >= pass;
    s.all.push(v);
    s.overall.add(v, ok);
    get(s.byTask, r.task, () => new Acc()).add(v, ok);
    get(s.byLevel, r.level, () => new Acc()).add(v, ok);
    get(s.byTL, `${r.task}|${r.level}`, () => new Acc()).add(v, ok);
    for (const f of r.focus ?? []) get(s.byFocus, f, () => new Acc()).add(v, ok);
    if (run.repeats > 1) {
      const pc = get(s.perCase, r.caseId, () => ({ scores: [] as number[], outputs: [] as string[], passes: [] as boolean[] }));
      pc.scores.push(v);
      pc.passes.push(ok);
      if (r.outputText) pc.outputs.push(r.outputText);
    }
  }

  const cs = run.candidates.map(() => ({
    ms: [] as number[],
    msByTask: new Map<EvalTask, number[]>(),
    input: 0,
    output: 0,
    estimated: false,
    judgeInput: 0,
    judgeOutput: 0,
    cost: 0 as number | null,
    judgeCost: 0 as number | null,
    modelVersion: undefined as string | undefined,
  }));
  for await (const c of calls) {
    const s = cs[c.candidate];
    if (!s) continue;
    if (c.role === "candidate") {
      if (c.ok) {
        s.ms.push(c.ms);
        get(s.msByTask, c.task, () => [] as number[]).push(c.ms);
        if (c.modelVersion) s.modelVersion = c.modelVersion;
      }
      s.input += c.inputTokens ?? 0;
      s.output += c.outputTokens ?? 0;
      if (c.tokensEstimated) s.estimated = true;
      s.cost = s.cost === null || (c.ok && c.costUsd === null) ? null : s.cost + (c.costUsd ?? 0);
    } else {
      s.judgeInput += c.inputTokens ?? 0;
      s.judgeOutput += c.outputTokens ?? 0;
      s.judgeCost = s.judgeCost === null || (c.ok && c.costUsd === null) ? null : s.judgeCost + (c.costUsd ?? 0);
    }
  }

  const expected = (run.caseCount ?? 0) * run.repeats;
  const candidates: CandidateReport[] = run.candidates.map((cand, i) => {
    const s = st[i];
    const c = cs[i];
    const missing = Math.max(0, expected - s.rows);
    const sorted = [...c.ms].sort((a, b) => a - b);
    let consistency: CandidateReport["consistency"] = null;
    if (run.repeats > 1) {
      const groups = [...s.perCase.values()].filter((g) => g.scores.length >= 2);
      const agree: number[] = [];
      for (const g of groups) {
        for (let a = 0; a < g.outputs.length; a++) for (let b = a + 1; b < g.outputs.length; b++) agree.push(chrF(g.outputs[a], g.outputs[b]));
      }
      consistency = groups.length
        ? {
            repeats: run.repeats,
            meanStdev: round1(mean(groups.map((g) => stdev(g.scores)))),
            stableShare: round1((100 * groups.filter((g) => Math.max(...g.scores) - Math.min(...g.scores) <= 10).length) / groups.length),
            outputAgreement: round1(mean(agree)),
            passAllShare: round1((100 * groups.filter((g) => g.passes.every(Boolean)).length) / groups.length),
          }
        : null;
    }
    const byTaskLevel: CandidateReport["byTaskLevel"] = {};
    for (const [k, acc] of s.byTL) {
      const [t, l] = k.split("|") as [EvalTask, JlptLevel];
      (byTaskLevel[t] ??= {})[l] = acc.stat();
    }
    const totalErrors = s.errors + missing;
    const costTotal = c.cost === null || c.judgeCost === null ? null : c.cost + c.judgeCost;
    return {
      index: i,
      label: cand.label,
      provider: cand.provider,
      model: cand.model,
      modelVersion: c.modelVersion ?? run.modelVersions?.[String(i)],
      serviceId: cand.serviceId,
      modelOverride: cand.modelOverride,
      stopped: run.candidateErrors?.[String(i)],
      expected,
      scored: s.scored,
      errors: s.errors,
      judgeFailed: s.judgeFailed,
      missing,
      errorRate: expected ? round1((100 * totalErrors) / expected) : 0,
      parseErrorRate: expected ? round1((100 * s.parseErrors) / expected) : 0,
      overall: { ...s.overall.stat(), stdev: s.all.length ? round1(stdev(s.all)) : null },
      byTask: Object.fromEntries(EVAL_TASKS.filter((t) => s.byTask.has(t)).map((t) => [t, s.byTask.get(t)!.stat()])),
      byLevel: Object.fromEntries(JLPT_LEVELS.filter((l) => s.byLevel.has(l)).map((l) => [l, s.byLevel.get(l)!.stat()])),
      byTaskLevel,
      byFocus: [...s.byFocus]
        .filter(([focus, a]) => a.n > 0 && !TASK_WIDE_FOCUS.has(focus))
        .map(([focus, a]) => ({ focus, mean: round1(a.sum / a.n), n: a.n, passRate: round1((100 * a.pass) / a.n) }))
        .sort((a, b) => a.mean - b.mean),
      latency: sorted.length
        ? { calls: sorted.length, mean: Math.round(mean(sorted)), median: Math.round(pct(sorted, 0.5)), p95: Math.round(pct(sorted, 0.95)), perItem: Math.round(mean(s.itemMs)) }
        : null,
      latencyByTask: Object.fromEntries([...c.msByTask].map(([t, xs]) => [t, Math.round(mean(xs))])),
      tokens: { input: Math.round(c.input), output: Math.round(c.output), estimated: c.estimated, judgeInput: Math.round(c.judgeInput), judgeOutput: Math.round(c.judgeOutput) },
      cost: {
        candidate: c.cost === null ? null : Math.round(c.cost * 1e6) / 1e6,
        judge: c.judgeCost === null ? null : Math.round(c.judgeCost * 1e6) / 1e6,
        total: costTotal === null ? null : Math.round(costTotal * 1e6) / 1e6,
        perCase: costTotal === null || s.rows === 0 ? null : Math.round((costTotal / s.rows) * 1e8) / 1e8,
      },
      consistency,
      topErrors: [...s.tags]
        .map(([tag, e]) => ({ tag, count: e.count, share: s.rows ? round1((100 * e.count) / s.rows) : 0, examples: e.examples }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      needsReview: s.needsReview,
      reviewed: s.reviewed,
    };
  });
  return {
    runId: run.id,
    label: run.label,
    datasetKey: run.datasetKey,
    status: run.status,
    promptVersion: run.promptVersion,
    judgePromptVersion: run.judgePromptVersion,
    temperature: run.temperature,
    batchSize: run.batchSize,
    repeats: run.repeats,
    passThreshold: pass,
    judges: run.judges.map((j) => ({ label: j.label, provider: j.provider, model: j.model })),
    caseCount: run.caseCount ?? 0,
    candidates,
    generatedAt: new Date().toISOString(),
  };
}

/** What the run list keeps per candidate (small enough to store on the run). */
export function compactSummary(r: EvalReport) {
  return {
    candidates: r.candidates.map((c) => ({
      label: c.label,
      provider: c.provider,
      model: c.model,
      overall: c.overall.mean,
      byTask: Object.fromEntries(Object.entries(c.byTask).map(([t, s]) => [t, s?.mean ?? null])),
      errorRate: c.errorRate,
      latencyMedian: c.latency?.median ?? null,
      cost: c.cost.total,
    })),
  };
}

/** CSV of a report (one row per candidate × task × level, plus overall rows). */
export function reportCsv(r: EvalReport): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v as string | number | boolean);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [["candidate", "provider", "model", "task", "level", "mean", "n", "passRate", "errorRate", "latencyMedianMs", "costUsd"].join(",")];
  for (const c of r.candidates) {
    lines.push([c.label, c.provider, c.model, "ALL", "ALL", c.overall.mean, c.overall.n, c.overall.passRate, c.errorRate, c.latency?.median, c.cost.total].map(esc).join(","));
    for (const [t, levels] of Object.entries(c.byTaskLevel)) {
      for (const [l, s] of Object.entries(levels ?? {})) {
        lines.push([c.label, c.provider, c.model, t, l, s?.mean, s?.n, s?.passRate, "", c.latencyByTask[t as EvalTask], ""].map(esc).join(","));
      }
    }
  }
  return lines.join("\n");
}
