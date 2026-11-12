import { createHash } from "node:crypto";
import { costOf, estimateTokens, priceOf, sameModel, type PriceTable, type Usage } from "./eval-cost.js";
import { answerText, EVALUATORS, parseItems, type Answer, type TaskEvaluator } from "./eval-evaluators.js";
import { combineScores, JUDGE_TEMPERATURE, judgePrompt, parseJudge } from "./eval-judge.js";
import { buildReport, compactSummary } from "./eval-report.js";
import { ProgressTracker } from "./eval-progress.js";
import { resultKey, type EvalStore, type ResultRow, type RunCurrent, type RunDoc, type RunEvent, type ServiceRef } from "./eval-store.js";
import { EVAL_TASKS, type DeterministicResult, type ErrorTag, type JudgeVerdict, type LoadedCase } from "./eval-types.js";

/** One model call; throws an Error carrying `kind` ("auth" | "rate" | "transient") and maybe `retryAfterMs`. */
export type CompleteFn = (
  ref: ServiceRef,
  prompt: string,
  opts: { temperature: number; purpose: "eval" | "judge"; words?: string[] },
) => Promise<{ text: string; usage: Usage | null; modelVersion: string | null; ms: number }>;

export interface RunnerDeps {
  complete: CompleteFn;
  sleep?: (ms: number) => Promise<void>;
  /** Called once a run has completed (not cancelled / failed). */
  onCompleted?: (run: RunDoc) => Promise<void>;
  log?: (msg: string) => void;
}

type CallOutcome =
  | { ok: true; text: string; usage: Usage; estimated: boolean; modelVersion: string | null; ms: number }
  | { ok: false; error: string; kind: string; ms: number };

class CandidateAbort extends Error {}
class RunCancelled extends Error {}

const MAX_PROMPT_LOG = 20_000;
const MAX_RAW_LOG = 60_000;

const chunk = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

/** Cache key of a judge verdict: same judge model + judge prompt + case + answer → same verdict. */
export function judgeCacheKey(judge: ServiceRef, judgePromptVersion: string, datasetKey: string, caseId: string, answer: Answer): string {
  return createHash("sha256")
    .update(JSON.stringify([judge.provider, judge.model, judgePromptVersion, datasetKey, caseId, answer]))
    .digest("hex");
}

/**
 * The judges allowed to score one candidate: never the candidate's own model,
 * unless the run explicitly allows it AND no independent judge exists.
 */
export function judgesFor(run: Pick<RunDoc, "judges" | "allowSelfJudge">, cand: ServiceRef): { judge: ServiceRef; index: number; self: boolean }[] {
  const all = run.judges.map((judge, index) => ({ judge, index, self: sameModel(judge, cand) }));
  const independent = all.filter((j) => !j.self);
  if (independent.length > 0 || !run.allowSelfJudge) return independent;
  return all;
}

/**
 * Runs one benchmark: every candidate × repeat × task, in batches of
 * `batchSize` cases per call; each answer is checked by code, judged by the
 * judges (other models), combined, and written to the store batch by batch —
 * nothing beyond one batch is kept in memory. A rerun of the same run id
 * skips the results already stored (resume after a restart).
 */
export class EvalRunner {
  private readonly cancelled = new Set<string>();
  constructor(
    private readonly store: EvalStore,
    private readonly deps: RunnerDeps,
  ) {}

  cancel(runId: string): void {
    this.cancelled.add(runId);
  }

  private sleep(ms: number) {
    return this.deps.sleep ? this.deps.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms));
  }

  /** A call with a small retry policy: transient → once after 2 s; rate limit → up to twice after the advised wait (≤ 60 s); auth → never. */
  private async call(
    ref: ServiceRef,
    prompt: string,
    opts: Parameters<CompleteFn>[2],
    onWait?: (w: { kind: "rate" | "transient"; ms: number; error: string }) => Promise<void>,
  ): Promise<CallOutcome> {
    let transient = 0;
    let rate = 0;
    const t0 = Date.now();
    for (;;) {
      try {
        const r = await this.deps.complete(ref, prompt, opts);
        const usage = r.usage ?? { inputTokens: estimateTokens(prompt), outputTokens: estimateTokens(r.text) };
        return { ok: true, text: r.text, usage, estimated: !r.usage, modelVersion: r.modelVersion, ms: r.ms };
      } catch (err) {
        const e = err as Error & { kind?: string; retryAfterMs?: number };
        const kind = e.kind ?? "transient";
        if (kind === "rate" && rate < 2) {
          rate++;
          const ms = Math.min(60_000, Math.max(5_000, e.retryAfterMs ?? 20_000));
          await onWait?.({ kind: "rate", ms, error: e.message });
          await this.sleep(ms);
          continue;
        }
        if (kind === "transient" && transient < 1) {
          transient++;
          await onWait?.({ kind: "transient", ms: 2_000, error: e.message });
          await this.sleep(2_000);
          continue;
        }
        return { ok: false, error: (e.message || "error").slice(0, 500), kind, ms: Date.now() - t0 };
      }
    }
  }

  async execute(runId: string): Promise<RunDoc | null> {
    const run = await this.store.getRun(runId);
    if (!run) return null;
    this.cancelled.delete(runId);
    try {
      const cases = await this.store.listCases(run.datasetKey, run.filter);
      const prices = await this.store.prices();
      const tracker = new ProgressTracker(run, cases);
      await tracker.load(this.store.results(runId));
      tracker.startSession();
      const done = tracker.done;
      const resumed = done.size > 0;
      const candidateErrors: Record<string, string> = { ...(run.candidateErrors ?? {}) };
      const modelVersions: Record<string, string> = { ...(run.modelVersions ?? {}) };
      await this.store.updateRun(runId, { status: "running", caseCount: cases.length, progress: tracker.snapshot(), startedAt: run.startedAt ?? new Date(), error: undefined });
      await this.event(
        runId,
        "info",
        resumed
          ? `Chạy tiếp từ ${tracker.p.done}/${tracker.p.total} kết quả`
          : `Bắt đầu: ${cases.length} câu × ${run.candidates.length} dịch vụ × ${run.repeats} lần = ${tracker.p.total} kết quả, ${run.batchSize} câu mỗi lần gọi`,
      );
      const ctx: Ctx = { runId, tracker, flush: () => this.store.updateRun(runId, { progress: tracker.snapshot(), modelVersions }) };

      const byTask = EVAL_TASKS.map((t) => [t, cases.filter((c) => c.task === t)] as const).filter(([, list]) => list.length > 0);
      for (let ci = 0; ci < run.candidates.length; ci++) {
        const cand = run.candidates[ci];
        const judges = judgesFor(run, cand);
        const left = (tracker.p.byCandidate?.[String(ci)]?.total ?? 0) - (tracker.p.byCandidate?.[String(ci)]?.done ?? 0);
        if (left > 0) await this.event(runId, "info", `▶ ${cand.label} (${cand.model}): ${left} kết quả cần chạy · AI chấm: ${judges.map((j) => j.judge.label).join(" + ")}`);
        try {
          for (let rep = 1; rep <= run.repeats; rep++) {
            for (const [task, list] of byTask) {
              const todo = list.filter((c) => !done.has(resultKey({ candidate: ci, caseId: c.caseId, repeat: rep })));
              const batches = chunk(todo, Math.max(1, run.batchSize));
              for (let bi = 0; bi < batches.length; bi++) {
                if (this.cancelled.has(runId)) throw new RunCancelled();
                const batch = batches[bi];
                const where = { candidate: ci, task, repeat: rep, batchNo: bi + 1, batches: batches.length, caseIds: batch.map((c) => c.caseId) };
                const t0 = Date.now();
                const rows = await this.batch(run, ci, cand, judges, rep, batch, prices, modelVersions, { ...ctx, where });
                tracker.record(rows);
                tracker.setCurrent(null);
                await ctx.flush();
                const scored = rows.filter((r) => typeof r.total === "number");
                const errs = rows.filter((r) => r.status === "error").length;
                const mean = scored.length ? Math.round((scored.reduce((a, r) => a + (r.total ?? 0), 0) / scored.length) * 10) / 10 : null;
                await this.event(
                  runId,
                  errs ? "warn" : "info",
                  `${cand.label} · ${TASK_VI[task]}${run.repeats > 1 ? ` · lần ${rep}` : ""} · lô ${bi + 1}/${batches.length} (${batch.length} câu): ` +
                    `${mean === null ? "chưa có điểm" : `TB ${mean} điểm`}${errs ? `, ${errs} lỗi` : ""} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
                );
              }
            }
          }
        } catch (err) {
          if (!(err instanceof CandidateAbort)) throw err;
          candidateErrors[String(ci)] = err.message;
          tracker.setCurrent(null);
          await this.store.updateRun(runId, { candidateErrors, progress: tracker.snapshot() });
          await this.event(runId, "error", `■ ${cand.label} dừng: ${err.message} — chuyển sang dịch vụ tiếp theo`);
          this.deps.log?.(`eval run ${runId}: candidate ${cand.label} stopped: ${err.message}`);
        }
      }
      const report = await buildReport({ ...run, caseCount: cases.length }, this.store.results(runId), this.store.calls(runId));
      tracker.setCurrent(null);
      await this.store.updateRun(runId, { status: "completed", finishedAt: new Date(), summary: compactSummary(report), candidateErrors, progress: tracker.snapshot() });
      await this.event(runId, "info", `✔ Hoàn tất: ${tracker.p.done}/${tracker.p.total} kết quả, ${tracker.p.errors} lỗi`);
      const finished = await this.store.getRun(runId);
      if (finished && this.deps.onCompleted) await this.deps.onCompleted(finished).catch((e) => this.deps.log?.(`eval run ${runId}: after-run hook failed: ${(e as Error).message}`));
      return finished;
    } catch (err) {
      const last = await this.store.getRun(runId);
      const progress = last?.progress ? { ...last.progress, current: null } : undefined;
      if (err instanceof RunCancelled) {
        await this.store.updateRun(runId, { status: "cancelled", finishedAt: new Date(), ...(progress ? { progress } : {}) });
        await this.event(runId, "warn", "Đã huỷ — các kết quả đã chấm được giữ lại, có thể chạy tiếp");
      } else {
        await this.store.updateRun(runId, { status: "failed", finishedAt: new Date(), error: (err as Error).message.slice(0, 500), ...(progress ? { progress } : {}) });
        await this.event(runId, "error", `Lỗi: ${(err as Error).message.slice(0, 300)}`);
        this.deps.log?.(`eval run ${runId} failed: ${(err as Error).message}`);
      }
      return this.store.getRun(runId);
    } finally {
      this.cancelled.delete(runId);
    }
  }

  /** One candidate call for a batch of cases of one task, its judging, and the stored results. */
  private async batch(
    run: RunDoc,
    ci: number,
    cand: ServiceRef,
    judges: ReturnType<typeof judgesFor>,
    rep: number,
    cases: LoadedCase[],
    prices: PriceTable,
    modelVersions: Record<string, string>,
    ctx: Ctx & { where: Omit<RunCurrent, "phase" | "who" | "since" | "waitUntil"> },
  ): Promise<ResultRow[]> {
    const task = cases[0].task;
    const ev = EVALUATORS[task];
    const prompt = ev.prompt(
      cases.map((c) => c.payload),
      run.promptVersion,
    );
    await this.phase(ctx, "calling", cand.label);
    const out = await this.call(cand, prompt, { temperature: run.temperature, purpose: "eval", words: cases.map((c) => c.caseId) }, (w) =>
      this.waiting(ctx, cand.label, w),
    );
    ctx.tracker.call("candidate", out.ok);
    const n = cases.length;
    const base = (c: LoadedCase) => ({
      runId: run.id,
      candidate: ci,
      caseId: c.caseId,
      task,
      level: c.level,
      split: c.split,
      focus: c.payload.evaluation_focus ?? [],
      pattern: "target_pattern" in c.payload ? c.payload.target_pattern : undefined,
      repeat: rep,
    });
    if (!out.ok) {
      const callId = await this.store.insertCall({
        runId: run.id, role: "candidate", candidate: ci, serviceId: cand.serviceId, provider: cand.provider, model: cand.model,
        task, caseIds: cases.map((c) => c.caseId), repeat: rep, prompt: prompt.slice(0, MAX_PROMPT_LOG), ok: false,
        error: out.error, errorKind: out.kind, ms: out.ms, inputTokens: 0, outputTokens: 0, tokensEstimated: false, costUsd: 0,
      });
      const rows: ResultRow[] = cases.map((c) => ({
        ...base(c), callId, status: "error", total: null, errorTags: ["call_error"], needsReview: false, error: out.error,
        callMs: out.ms, itemMs: out.ms / n, inputTokens: 0, outputTokens: 0, costUsd: 0, judgeCostUsd: 0,
      }));
      await this.store.saveResults(rows);
      await this.event(ctx.runId, "error", `${cand.label}: lỗi gọi API (${out.kind}) — ${out.error.slice(0, 200)}`);
      if (out.kind === "auth") throw new CandidateAbort(`auth: ${out.error}`);
      return rows;
    }
    if (out.modelVersion) modelVersions[String(ci)] = out.modelVersion;
    const cost = costOf(out.usage, priceOf(prices, cand.provider, cand.model));
    const callId = await this.store.insertCall({
      runId: run.id, role: "candidate", candidate: ci, serviceId: cand.serviceId, provider: cand.provider, model: cand.model,
      modelVersion: out.modelVersion, task, caseIds: cases.map((c) => c.caseId), repeat: rep, prompt: prompt.slice(0, MAX_PROMPT_LOG),
      raw: out.text.slice(0, MAX_RAW_LOG), ok: true, ms: out.ms, inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens,
      tokensEstimated: out.estimated, costUsd: cost,
    });
    const answers = parseItems(out.text, (row) => ev.read(row));
    const share = {
      callMs: out.ms,
      itemMs: out.ms / n,
      inputTokens: out.usage.inputTokens / n,
      outputTokens: out.usage.outputTokens / n,
      costUsd: cost === null ? null : cost / n,
    };
    const checked = cases.map((c, i) => {
      const a = answers.get(i + 1) ?? null;
      const det: DeterministicResult | null = a ? ev.deterministic(c.payload, a) : null;
      return { c, a, det };
    });
    const toJudge = checked.filter((x): x is { c: LoadedCase; a: Answer; det: DeterministicResult } => Boolean(x.a && x.det && !x.det.fatal));
    if (answers.size === 0) await this.event(ctx.runId, "warn", `${cand.label}: không đọc được JSON trong câu trả lời`);
    if (toJudge.length) await this.phase(ctx, "judging", judges.map((j) => j.judge.label).join(" + "));
    const judged = await this.judge(run, ci, rep, ev, judges, toJudge, prices, ctx);
    const rows: ResultRow[] = checked.map(({ c, a, det }) => {
      if (!a || !det) {
        return {
          ...base(c), ...share, callId, status: "error", total: null, errorTags: [answers.size === 0 ? "parse_error" : "empty"] as ErrorTag[],
          needsReview: false, error: answers.size === 0 ? "the answer could not be read" : "no answer for this item", judgeCostUsd: 0,
        };
      }
      const j = judged.get(c.caseId) ?? { verdicts: [], cost: 0 };
      const combined = combineScores(ev, det, j.verdicts);
      const tags = new Set<ErrorTag>(det.flags);
      for (const v of j.verdicts) for (const t of v.errorTags) tags.add(t);
      const selfJudged = judges.some((x) => x.self);
      return {
        ...base(c), ...share, callId,
        status: combined ? "scored" : "judge_failed",
        parsed: a,
        outputText: answerText(task, a),
        deterministic: det,
        verdicts: j.verdicts,
        parts: combined?.parts,
        total: combined ? combined.total : null,
        errorTags: [...tags],
        needsReview: Boolean(combined?.review) || selfJudged || !combined,
        reviewReason: [combined?.review, selfJudged ? "AI chấm cùng model với bài làm" : "", combined ? "" : "không AI chấm nào trả lời được"].filter(Boolean).join("; ") || undefined,
        judgeCostUsd: j.cost,
      };
    });
    await this.store.saveResults(rows);
    return rows;
  }

  /** Every allowed judge scores the answers (cached verdicts reused), in batches of `judgeBatchSize`; judges run in parallel. */
  private async judge(
    run: RunDoc,
    ci: number,
    rep: number,
    ev: TaskEvaluator,
    judges: ReturnType<typeof judgesFor>,
    items: { c: LoadedCase; a: Answer }[],
    prices: PriceTable,
    ctx: Ctx & { where: Omit<RunCurrent, "phase" | "who" | "since" | "waitUntil"> },
  ): Promise<Map<string, { verdicts: JudgeVerdict[]; cost: number | null }>> {
    const out = new Map<string, { verdicts: JudgeVerdict[]; cost: number | null }>(items.map((it) => [it.c.caseId, { verdicts: [], cost: 0 }]));
    if (items.length === 0) return out;
    const addCost = (caseId: string, c: number | null) => {
      const e = out.get(caseId)!;
      e.cost = e.cost === null || c === null ? null : e.cost + c;
    };
    await Promise.all(
      judges.map(async ({ judge, index }) => {
        const name = `${judge.label} · ${judge.model}`;
        const keys = items.map((it) => judgeCacheKey(judge, run.judgePromptVersion, run.datasetKey, it.c.caseId, it.a));
        const cached = await this.store.judgeCacheGet(keys);
        const fresh: { it: (typeof items)[number]; key: string }[] = [];
        items.forEach((it, i) => {
          const v = cached.get(keys[i]);
          if (v) out.get(it.c.caseId)!.verdicts.push({ ...v, judge: name });
          else fresh.push({ it, key: keys[i] });
        });
        for (const group of chunk(fresh, Math.max(1, run.judgeBatchSize))) {
          const prompt = judgePrompt(ev, group.map(({ it }) => ({ caseDesc: ev.describeCase(it.c.payload), answer: it.a })));
          const r = await this.call(judge, prompt, { temperature: JUDGE_TEMPERATURE, purpose: "judge", words: group.map(({ it }) => it.c.caseId) }, (w) =>
            this.waiting(ctx, `AI chấm ${judge.label}`, w),
          );
          ctx.tracker.call("judge", r.ok);
          if (!r.ok) await this.event(ctx.runId, "warn", `AI chấm ${judge.label}: lỗi (${r.kind}) — ${group.length} bài thiếu điểm của AI này: ${r.error.slice(0, 160)}`);
          const cost = r.ok ? costOf(r.usage, priceOf(prices, judge.provider, judge.model)) : 0;
          await this.store.insertCall({
            runId: run.id, role: "judge", candidate: ci, judge: index, serviceId: judge.serviceId, provider: judge.provider, model: judge.model,
            modelVersion: r.ok ? r.modelVersion : undefined, task: ev.task, caseIds: group.map(({ it }) => it.c.caseId), repeat: rep,
            prompt: prompt.slice(0, MAX_PROMPT_LOG), raw: r.ok ? r.text.slice(0, MAX_RAW_LOG) : undefined, ok: r.ok,
            error: r.ok ? undefined : r.error, errorKind: r.ok ? undefined : r.kind, ms: r.ms,
            inputTokens: r.ok ? r.usage.inputTokens : 0, outputTokens: r.ok ? r.usage.outputTokens : 0, tokensEstimated: r.ok ? r.estimated : false, costUsd: cost,
          });
          group.forEach(({ it }) => addCost(it.c.caseId, cost === null ? null : cost / group.length));
          if (!r.ok) continue;
          const verdicts = parseJudge(r.text, ev.rubric, name);
          await Promise.all(
            group.map(async ({ it, key }, i) => {
              const v = verdicts.get(i + 1);
              if (!v) return;
              out.get(it.c.caseId)!.verdicts.push(v);
              if (!v.error) await this.store.judgeCacheSet(key, v);
            }),
          );
        }
      }),
    );
    return out;
  }

  private async event(runId: string, level: RunEvent["level"], text: string): Promise<void> {
    await this.store.pushEvent(runId, { at: new Date().toISOString(), level, text }).catch(() => undefined);
  }

  private async phase(ctx: Ctx & { where: Omit<RunCurrent, "phase" | "who" | "since" | "waitUntil"> }, phase: RunCurrent["phase"], who: string): Promise<void> {
    ctx.tracker.setCurrent({ ...ctx.where, phase, who });
    await ctx.flush().catch(() => undefined);
  }

  /** A rate-limit wait or a retry: shown as the current step (with when it ends) and logged. */
  private async waiting(
    ctx: Ctx & { where: Omit<RunCurrent, "phase" | "who" | "since" | "waitUntil"> },
    who: string,
    w: { kind: "rate" | "transient"; ms: number; error: string },
  ): Promise<void> {
    ctx.tracker.setCurrent({ ...ctx.where, phase: w.kind === "rate" ? "waiting" : "retrying", who, waitUntil: new Date(Date.now() + w.ms).toISOString() });
    await ctx.flush().catch(() => undefined);
    await this.event(
      ctx.runId,
      "warn",
      w.kind === "rate"
        ? `${who}: hết hạn mức (429) — chờ ${Math.round(w.ms / 1000)}s rồi thử lại`
        : `${who}: lỗi tạm thời (${w.error.slice(0, 120)}) — thử lại sau ${Math.round(w.ms / 1000)}s`,
    );
  }
}

interface Ctx {
  runId: string;
  tracker: ProgressTracker;
  flush: () => Promise<void>;
}

const TASK_VI: Record<string, string> = { translation: "Dịch", sentence_generation: "Đặt câu", vocabulary_check: "Từ vựng", grammar_analysis: "Ngữ pháp" };
