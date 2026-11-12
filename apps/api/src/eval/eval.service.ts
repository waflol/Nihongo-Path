import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { BenchResult, BenchTask } from "../ai/ai-benchmark.js";
import { AiExampleService } from "../ai/ai-example.service.js";
import { providerById } from "../ai/ai-providers.js";
import { AiServicesService } from "../ai/ai-services.service.js";
import { sameModel, type PriceTable } from "./eval-cost.js";
import { datasetKey, DatasetValidationError, filterCases, loadDataset } from "./eval-dataset.js";
import { DEFAULT_PROMPT_VERSION, PROMPT_VERSIONS } from "./eval-evaluators.js";
import { JUDGE_PROMPT_VERSION } from "./eval-judge.js";
import { MongoEvalStore, runFromDoc, type EvalModels } from "./eval-mongo.store.js";
import { buildReport, effectiveScore, type EvalReport } from "./eval-report.js";
import { EvalRunner } from "./eval-runner.js";
import { EVENTS_LIMIT, type RunConfig, type RunDoc, type ServiceRef } from "./eval-store.js";
import { EVAL_SPLITS, EVAL_TASKS, JLPT_LEVELS, type CaseFilter, type EvalTask, type LoadedDataset } from "./eval-types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The dataset that ships with the app (`apps/api/eval-data`). */
export const BUNDLED_DATASET = "japanese_ai_eval_dataset_v2_1000.json";

/** Which service-priority task each dataset task's score ranks. */
export const RANKING_TASK: Record<EvalTask, BenchTask> = {
  translation: "translate",
  sentence_generation: "write",
  grammar_analysis: "grammar",
  vocabulary_check: "verify",
};

export const LIMITS = {
  candidates: 6,
  judges: 2,
  batchSize: [1, 25],
  judgeBatchSize: [1, 10],
  repeats: [1, 5],
  temperature: [0, 1.5],
} as const;

function dataDirs(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    process.env.EVAL_DATA_DIR ?? "",
    resolve(process.cwd(), "eval-data"),
    resolve(process.cwd(), "apps/api/eval-data"),
    resolve(here, "../../eval-data"),
    resolve(here, "../../../eval-data"),
  ].filter(Boolean);
}

export function bundledDatasetPath(): string | null {
  for (const d of dataDirs()) {
    const p = resolve(d, BUNDLED_DATASET);
    if (existsSync(p)) return p;
  }
  return null;
}

const clampInt = (v: unknown, [lo, hi]: readonly [number, number], def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

export interface CreateRunInput {
  label?: string;
  datasetKey?: string;
  filter?: CaseFilter;
  candidates?: { serviceId?: string; model?: string }[];
  judges?: { serviceId?: string; model?: string }[];
  promptVersion?: string;
  temperature?: number;
  batchSize?: number;
  judgeBatchSize?: number;
  repeats?: number;
  passThreshold?: number;
  allowSelfJudge?: boolean;
  updateRanking?: boolean;
}

/**
 * Evaluation benchmark: datasets (immutable, versioned), runs (queued, one
 * at a time in the background), results, human review, reports, and writing
 * each run's per-task scores to the services' ranking.
 */
@Injectable()
export class EvalService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(EvalService.name);
  readonly store: MongoEvalStore;
  private readonly runner: EvalRunner;
  private active: string | null = null;
  private stopping = false;

  constructor(
    private readonly services: AiServicesService,
    private readonly ai: AiExampleService,
    @InjectModel("EvalDataset") private readonly datasetModel: Model<any>,
    @InjectModel("EvalCase") private readonly caseModel: Model<any>,
    @InjectModel("EvalRun") private readonly runModel: Model<any>,
    @InjectModel("EvalCall") private readonly callModel: Model<any>,
    @InjectModel("EvalResult") private readonly resultModel: Model<any>,
    @InjectModel("EvalReview") private readonly reviewModel: Model<any>,
    @InjectModel("EvalJudgeCache") private readonly judgeCacheModel: Model<any>,
    @InjectModel("EvalSettings") private readonly settingsModel: Model<any>,
  ) {
    const models: EvalModels = {
      dataset: datasetModel, case: caseModel, run: runModel, call: callModel, result: resultModel,
      review: reviewModel, judgeCache: judgeCacheModel, settings: settingsModel,
    };
    this.store = new MongoEvalStore(models);
    this.runner = new EvalRunner(this.store, {
      complete: async (ref, prompt, opts) => {
        const rt = await this.services.runtimeOf(ref.serviceId);
        return this.ai.complete({ ...rt, model: ref.model }, prompt, opts);
      },
      onCompleted: (run) => (run.updateRanking ? this.applyRanking(run.id).then(() => undefined) : Promise.resolve()),
      log: (m) => this.logger.warn(m),
    });
  }

  async onModuleInit(): Promise<void> {
    // A run that was going when the process stopped can be resumed by the admin.
    const stopped = { at: new Date().toISOString(), level: "warn", text: "Máy chủ khởi động lại khi run đang chạy — bấm “Chạy tiếp” để chạy phần còn thiếu" };
    await this.runModel
      .updateMany({ status: "running" }, { $set: { status: "interrupted", "progress.current": null }, $push: { events: { $each: [stopped], $slice: -EVENTS_LIMIT } } })
      .exec()
      .catch(() => undefined);
    // Queued runs start again on their own.
    setTimeout(() => void this.kick(), 5_000).unref?.();
    // The bundled dataset is imported once (same checksum → nothing to do).
    void this.ensureBundled().catch((e) => this.logger.warn(`bundled eval dataset not imported: ${(e as Error).message}`));
  }

  private async ensureBundled(): Promise<void> {
    const path = bundledDatasetPath();
    if (!path) return;
    const buf = readFileSync(path);
    const checksum = createHash("sha256").update(buf).digest("hex");
    if (await this.datasetModel.exists({ checksum })) return;
    await this.importDataset(buf, "json", {}, "bundled", "system");
  }

  onApplicationShutdown(): void {
    this.stopping = true;
  }

  // ── Datasets ───────────────────────────────────────────────────────────

  async listDatasets() {
    return this.datasetModel.find({}, { __v: 0 }).sort({ importedAt: -1 }).lean().exec();
  }

  async datasetStats(key: string) {
    const ds = await this.datasetModel.findOne({ key }).lean().exec();
    if (!ds) throw new NotFoundException("Dataset not found");
    const rows = await this.caseModel.aggregate([
      { $match: { datasetKey: key } },
      { $group: { _id: { task: "$task", level: "$level", split: "$split" }, n: { $sum: 1 } } },
    ]);
    return { dataset: ds, cells: rows.map((r: any) => ({ ...r._id, n: r.n })) };
  }

  /** Import the dataset shipped with the app (no-op when that version is already in). */
  async importBundled(by = "system") {
    const path = bundledDatasetPath();
    if (!path) throw new NotFoundException(`${BUNDLED_DATASET} not found (set EVAL_DATA_DIR)`);
    return this.importDataset(readFileSync(path), "json", {}, "bundled", by);
  }

  /**
   * Store a dataset version. The same name@version with the same checksum is
   * a no-op; with a different checksum it is refused — a corrected reference
   * answer must come as a NEW version, so earlier runs stay reproducible.
   */
  async importDataset(source: Buffer | string, format: "json" | "jsonl", fallback: { name?: string; version?: string }, origin: string, by: string) {
    let ds: LoadedDataset;
    try {
      ds = loadDataset(source, format, fallback);
    } catch (e) {
      if (e instanceof DatasetValidationError) throw new BadRequestException({ message: "Dataset không hợp lệ", problems: e.problems.slice(0, 50) });
      throw e;
    }
    const key = datasetKey(ds.meta);
    const existing = await this.datasetModel.findOne({ key }).lean().exec();
    if (existing) {
      if ((existing as any).checksum !== ds.meta.checksum) {
        throw new ConflictException(`Phiên bản ${key} đã có với nội dung khác — hãy tăng version để nhập bản sửa`);
      }
      return { key, imported: false, caseCount: ds.meta.caseCount, warnings: ds.warnings.length };
    }
    const counts: Record<string, number> = {};
    for (const c of ds.cases) counts[`${c.task}|${c.level}`] = (counts[`${c.task}|${c.level}`] ?? 0) + 1;
    // Cases first, the dataset record last: a dataset only shows once all its cases are in.
    for (let i = 0; i < ds.cases.length; i += 200) {
      await this.caseModel.bulkWrite(
        ds.cases.slice(i, i + 200).map((c) => ({
          updateOne: { filter: { datasetKey: key, caseId: c.caseId }, update: { $setOnInsert: { ...c, datasetKey: key } }, upsert: true },
        })),
      );
    }
    await this.datasetModel.create({
      key, ...ds.meta, counts, warnings: ds.warnings.slice(0, 100), duplicateCount: ds.warnings.length, source: origin, importedBy: by,
    });
    return { key, imported: true, caseCount: ds.meta.caseCount, warnings: ds.warnings.length };
  }

  // ── Runs ───────────────────────────────────────────────────────────────

  private normaliseFilter(f: CaseFilter | undefined): CaseFilter {
    const pick = <T extends string>(xs: unknown, allowed: readonly T[]) => (Array.isArray(xs) ? xs.filter((x): x is T => allowed.includes(x as T)) : undefined);
    return {
      tasks: pick(f?.tasks, EVAL_TASKS),
      levels: pick(f?.levels, JLPT_LEVELS),
      splits: pick(f?.splits, EVAL_SPLITS),
      goldStatus: Array.isArray(f?.goldStatus) ? f!.goldStatus.filter((x) => typeof x === "string").slice(0, 10) : undefined,
      caseIds: Array.isArray(f?.caseIds) ? f!.caseIds.filter((x) => typeof x === "string").slice(0, 2000) : undefined,
      dedupe: f?.dedupe !== false,
      perTaskLevel: f?.perTaskLevel ? clampInt(f.perTaskLevel, [1, 1000], 0) : undefined,
    };
  }

  /** How many cases a filter selects, by task, and the calls a run would make. */
  async preview(input: { datasetKey?: string; filter?: CaseFilter; candidates?: number; repeats?: number; batchSize?: number; judgeBatchSize?: number }) {
    const key = String(input.datasetKey ?? "");
    const cases = await this.store.listCases(key, this.normaliseFilter(input.filter));
    const byTask: Record<string, number> = {};
    for (const c of cases) byTask[c.task] = (byTask[c.task] ?? 0) + 1;
    const cands = clampInt(input.candidates, [1, LIMITS.candidates], 1);
    const reps = clampInt(input.repeats, LIMITS.repeats, 1);
    const bs = clampInt(input.batchSize, LIMITS.batchSize, 5);
    const jbs = clampInt(input.judgeBatchSize, LIMITS.judgeBatchSize, 5);
    // Same split as the runner: batches never mix tasks, and judges only see one batch at a time.
    let calls = 0;
    let judgeCalls = 0;
    for (const n of Object.values(byTask)) {
      for (let left = n; left > 0; left -= bs) {
        calls++;
        judgeCalls += Math.ceil(Math.min(bs, left) / jbs);
      }
    }
    calls *= cands * reps;
    judgeCalls *= cands * reps * LIMITS.judges;
    return { cases: cases.length, byTask, candidateCalls: calls, judgeCalls, results: cases.length * cands * reps };
  }

  private async ref(input: { serviceId?: string; model?: string }, role: string): Promise<ServiceRef> {
    const id = String(input.serviceId ?? "");
    const rt = await this.services.runtimeOf(id).catch(() => {
      throw new BadRequestException(`${role}: không tìm thấy dịch vụ ${id}`);
    });
    const override = (input.model ?? "").trim();
    if (override && !/^[\w.:@/+-]{1,120}$/.test(override)) throw new BadRequestException(`${role}: tên model không hợp lệ`);
    const model = override || rt.model;
    if (providerById(rt.provider.id)?.translators?.some((t) => t.toLowerCase() === model.toLowerCase())) {
      throw new BadRequestException(`${rt.label}: model chỉ dịch, không trả lời được JSON theo đề — không dùng được cho benchmark`);
    }
    return { serviceId: rt.id, label: rt.label, provider: rt.provider.id, model, modelOverride: Boolean(override && override !== rt.model) };
  }

  async createRun(input: CreateRunInput, by: string): Promise<RunDoc> {
    const key = String(input.datasetKey ?? "");
    if (!(await this.datasetModel.exists({ key }))) throw new BadRequestException("Chọn bộ dữ liệu đã nhập");
    const rawCands = (input.candidates ?? []).slice(0, LIMITS.candidates + 1);
    if (rawCands.length === 0) throw new BadRequestException("Chọn ít nhất 1 dịch vụ để chấm");
    if (rawCands.length > LIMITS.candidates) throw new BadRequestException(`Tối đa ${LIMITS.candidates} dịch vụ mỗi lần chạy`);
    const candidates = await Promise.all(rawCands.map((c, i) => this.ref(c, `Dịch vụ #${i + 1}`)));
    const rawJudges = input.judges ?? [];
    if (rawJudges.length !== LIMITS.judges) throw new BadRequestException("Cần chọn đúng 2 AI chấm");
    const judges = await Promise.all(rawJudges.map((j, i) => this.ref(j, `AI chấm #${i + 1}`)));
    if (sameModel(judges[0], judges[1])) throw new BadRequestException("2 AI chấm phải là 2 model khác nhau");
    const allowSelfJudge = input.allowSelfJudge === true;
    const self = candidates.filter((c) => judges.some((j) => sameModel(j, c)));
    if (self.length && !allowSelfJudge) {
      throw new BadRequestException(
        `AI chấm trùng model với bài làm: ${self.map((c) => `${c.label} (${c.model})`).join(", ")} — chọn AI chấm khác, hoặc bật “cho phép tự chấm có kiểm soát”`,
      );
    }
    const promptVersion = input.promptVersion ?? DEFAULT_PROMPT_VERSION;
    if (!(PROMPT_VERSIONS as readonly string[]).includes(promptVersion)) throw new BadRequestException("Prompt version không tồn tại");
    const filter = this.normaliseFilter(input.filter);
    const caseCount = (await this.store.listCases(key, filter)).length;
    if (caseCount === 0) throw new BadRequestException("Bộ lọc không chọn được case nào");
    const t = Number(input.temperature);
    const cfg: RunConfig = {
      label: String(input.label ?? "").trim().slice(0, 120) || `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      datasetKey: key,
      filter,
      candidates,
      judges,
      promptVersion,
      judgePromptVersion: JUDGE_PROMPT_VERSION,
      temperature: Number.isFinite(t) ? Math.min(LIMITS.temperature[1], Math.max(LIMITS.temperature[0], t)) : 0.2,
      batchSize: clampInt(input.batchSize, LIMITS.batchSize, 5),
      judgeBatchSize: clampInt(input.judgeBatchSize, LIMITS.judgeBatchSize, 5),
      repeats: clampInt(input.repeats, LIMITS.repeats, 1),
      passThreshold: clampInt(input.passThreshold, [0, 100], 70),
      allowSelfJudge,
      updateRanking: input.updateRanking !== false,
    };
    const doc = await this.runModel.create({
      ...cfg,
      status: "queued",
      caseCount,
      progress: { total: caseCount * candidates.length * cfg.repeats, done: 0, errors: 0 },
      createdBy: by,
    });
    const queued = await this.runModel.countDocuments({ status: { $in: ["queued", "running"] }, _id: { $ne: doc._id } }).exec();
    await this.store.pushEvent(String(doc._id), {
      at: new Date().toISOString(),
      level: "info",
      text: queued ? `Đã xếp hàng — đứng sau ${queued} run` : "Đã xếp hàng — bắt đầu ngay",
    });
    void this.kick();
    return runFromDoc(doc.toObject());
  }

  /** Start the oldest queued run when none is going (one at a time: small server). */
  private async kick(): Promise<void> {
    if (this.active || this.stopping) return;
    const next = await this.runModel.findOne({ status: "queued" }, { _id: 1 }).sort({ createdAt: 1 }).lean().exec().catch(() => null);
    if (!next) return;
    const id = String((next as any)._id);
    this.active = id;
    try {
      await this.runner.execute(id);
    } catch (e) {
      this.logger.error(`eval run ${id}: ${(e as Error).message}`);
    } finally {
      this.active = null;
      if (!this.stopping) setTimeout(() => void this.kick(), 100).unref?.();
    }
  }

  async listRuns(limit = 50) {
    const docs = await this.runModel.find({}, { __v: 0, events: 0 }).sort({ createdAt: -1 }).limit(Math.min(200, Math.max(1, limit))).lean().exec();
    return docs.map(runFromDoc);
  }

  async getRun(id: string): Promise<RunDoc> {
    const r = await this.store.getRun(id);
    if (!r) throw new NotFoundException("Run not found");
    return r;
  }

  async cancelRun(id: string): Promise<RunDoc> {
    const r = await this.getRun(id);
    const at = new Date().toISOString();
    if (r.status === "queued") {
      await this.store.updateRun(id, { status: "cancelled", finishedAt: new Date() });
      await this.store.pushEvent(id, { at, level: "warn", text: "Đã huỷ khi còn đang chờ" });
    } else if (r.status === "running") {
      this.runner.cancel(id);
      await this.store.pushEvent(id, { at, level: "warn", text: "Đã yêu cầu huỷ — dừng sau lô đang chạy" });
    }
    return this.getRun(id);
  }

  /** Queue an interrupted / cancelled / failed run again; it skips the results already stored. */
  async resumeRun(id: string): Promise<RunDoc> {
    const r = await this.getRun(id);
    if (!["interrupted", "cancelled", "failed"].includes(r.status)) throw new ConflictException("Chỉ chạy tiếp được run đã dừng");
    await this.store.updateRun(id, { status: "queued", finishedAt: undefined });
    await this.store.pushEvent(id, { at: new Date().toISOString(), level: "info", text: "Đã xếp hàng để chạy tiếp" });
    void this.kick();
    return this.getRun(id);
  }

  async deleteRun(id: string): Promise<void> {
    const r = await this.getRun(id);
    if (r.status === "running" || r.status === "queued") throw new ConflictException("Huỷ run trước khi xoá");
    await Promise.all([
      this.resultModel.deleteMany({ runId: id }).exec(),
      this.callModel.deleteMany({ runId: id }).exec(),
      this.reviewModel.deleteMany({ runId: id }).exec(),
    ]);
    await this.runModel.deleteOne({ _id: id }).exec();
  }

  async report(id: string): Promise<EvalReport> {
    const run = await this.getRun(id);
    return buildReport(run, this.store.results(id), this.store.calls(id));
  }

  // ── Results & human review ─────────────────────────────────────────────

  async listResults(runId: string, q: { candidate?: string; task?: string; level?: string; status?: string; review?: string; maxScore?: string; page?: string }) {
    const filter: Record<string, unknown> = { runId };
    if (q.candidate !== undefined && q.candidate !== "") filter.candidate = Number(q.candidate);
    if (q.task && (EVAL_TASKS as readonly string[]).includes(q.task)) filter.task = q.task;
    if (q.level && (JLPT_LEVELS as readonly string[]).includes(q.level)) filter.level = q.level;
    if (q.status && ["scored", "error", "judge_failed"].includes(q.status)) filter.status = q.status;
    if (q.review === "1") filter.needsReview = true;
    if (q.review === "done") filter.reviewed = true;
    const max = Number(q.maxScore);
    if (q.maxScore && Number.isFinite(max)) filter.total = { $lte: max };
    const page = Math.max(1, Number(q.page) || 1);
    const size = 50;
    const [items, total] = await Promise.all([
      this.resultModel
        .find(filter, { parsed: 0, verdicts: 0, deterministic: 0, parts: 0 })
        .sort({ caseId: 1, candidate: 1, repeat: 1 })
        .skip((page - 1) * size)
        .limit(size)
        .lean()
        .exec(),
      this.resultModel.countDocuments(filter).exec(),
    ]);
    return { items: items.map((d: any) => ({ ...d, id: String(d._id), _id: undefined })), total, page, pageSize: size };
  }

  /** One result with everything: the case, the parsed answer, checks, verdicts, the raw call and the review history. */
  async resultDetail(id: string) {
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new NotFoundException("Result not found");
    const r: any = await this.resultModel.findById(id).lean().exec();
    if (!r) throw new NotFoundException("Result not found");
    const run = await this.getRun(r.runId);
    const [c, call, reviews] = await Promise.all([
      this.caseModel.findOne({ datasetKey: run.datasetKey, caseId: r.caseId }, { payload: 1, split: 1, _id: 0 }).lean().exec(),
      r.callId && /^[0-9a-f]{24}$/i.test(r.callId) ? this.callModel.findById(r.callId, { raw: 1, prompt: 1, ms: 1, modelVersion: 1, ok: 1, error: 1 }).lean().exec() : null,
      this.reviewModel.find({ resultId: id }).sort({ createdAt: 1 }).lean().exec(),
    ]);
    return { ...r, id: String(r._id), _id: undefined, case: (c as any)?.payload ?? null, call, reviews };
  }

  /** A reviewer confirms the score or sets another one; every decision is kept (audit history). */
  async review(id: string, input: { action?: string; score?: number; notes?: string }, reviewer: string) {
    const r: any = await this.resultModel.findById(id).lean().exec().catch(() => null);
    if (!r) throw new NotFoundException("Result not found");
    const action = input.action === "override" ? "override" : input.action === "confirm" ? "confirm" : null;
    if (!action) throw new BadRequestException("action must be confirm or override");
    const prev = effectiveScore(r);
    let next: number | null;
    if (action === "override") {
      const s = Number(input.score);
      if (!Number.isFinite(s) || s < 0 || s > 100) throw new BadRequestException("Điểm phải từ 0 đến 100");
      next = Math.round(s * 10) / 10;
    } else {
      if (prev === null || prev === undefined) throw new BadRequestException("Kết quả chưa có điểm — hãy nhập điểm");
      next = prev;
    }
    const notes = String(input.notes ?? "").slice(0, 2000);
    await this.reviewModel.create({ resultId: id, runId: r.runId, reviewer, verdict: action, previousTotal: prev, correctedTotal: next, notes });
    await this.resultModel.updateOne({ _id: id }, { $set: { humanTotal: next, reviewed: true, needsReview: false } }).exec();
    return this.resultDetail(id);
  }

  // ── Ranking ────────────────────────────────────────────────────────────

  /**
   * Write each candidate's per-task score of a run to its service (the
   * service-priority benchmark) and re-sort those tasks. Candidates run on
   * another model than their service's, or stopped early, are skipped.
   */
  async applyRanking(id: string): Promise<{ updated: { serviceId: string; task: BenchTask; accuracy: number }[] }> {
    const run = await this.getRun(id);
    if (run.status !== "completed") throw new ConflictException("Chỉ dùng được run đã hoàn tất");
    const rep = await this.report(id);
    const updated: { serviceId: string; task: BenchTask; accuracy: number }[] = [];
    const tasks = new Set<BenchTask>();
    for (const c of rep.candidates) {
      if (c.modelOverride || c.stopped) continue;
      for (const [t, stat] of Object.entries(c.byTask) as [EvalTask, { mean: number | null; n: number; passRate: number | null }][]) {
        if (stat.mean === null || stat.n === 0) continue;
        const task = RANKING_TASK[t];
        const ms = c.latencyByTask[t] ?? c.latency?.median ?? 0;
        const result: BenchResult = {
          ok: true,
          at: new Date(run.finishedAt ?? Date.now()).toISOString(),
          ms,
          accuracy: stat.mean,
          items: stat.n,
          answered: stat.n,
          successRate: Math.round((1 - c.errorRate / 100) * 1000) / 1000,
          task,
          source: "eval",
          evalRunId: id,
          evalLabel: run.label,
          evalTask: t,
          passRate: stat.passRate ?? undefined,
          runs: [{ ok: true, at: new Date().toISOString(), ms, accuracy: stat.mean, answered: stat.n }],
        };
        await this.services.saveBench(c.serviceId, task, result);
        updated.push({ serviceId: c.serviceId, task, accuracy: stat.mean });
        tasks.add(task);
      }
    }
    for (const task of tasks) await this.services.autoSort({ task }).catch((e) => this.logger.warn(`auto-sort ${task}: ${(e as Error).message}`));
    await this.store.pushEvent(id, {
      at: new Date().toISOString(),
      level: "info",
      text: updated.length ? `Đã cập nhật xếp hạng dịch vụ: ${updated.length} điểm (${[...tasks].join(", ")})` : "Không có điểm nào dùng được để xếp hạng (model khác hoặc dịch vụ bị dừng)",
    });
    return { updated };
  }

  // ── Prices ─────────────────────────────────────────────────────────────

  prices(): Promise<PriceTable> {
    return this.store.prices();
  }

  async setPrices(input: unknown): Promise<PriceTable> {
    if (!input || typeof input !== "object") throw new BadRequestException("prices must be an object");
    const out: PriceTable = {};
    for (const [k, v] of Object.entries(input as Record<string, any>).slice(0, 300)) {
      if (!/^[\w.-]{1,40}:[\w.:@/*+-]{1,120}$/.test(k)) throw new BadRequestException(`Khoá giá không hợp lệ: ${k} (dạng provider:model)`);
      const i = Number(v?.input);
      const o = Number(v?.output);
      if (!Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0 || i > 10_000 || o > 10_000) throw new BadRequestException(`Giá không hợp lệ: ${k}`);
      out[k] = { input: i, output: o };
    }
    await this.settingsModel.updateOne({ _id: "settings" }, { $set: { prices: out } }, { upsert: true }).exec();
    return out;
  }

  /** Cases of a dataset (preview / browsing), filtered, at most 200. */
  async cases(key: string, f: CaseFilter) {
    const list = await this.store.listCases(key, this.normaliseFilter({ ...f, dedupe: f.dedupe ?? false }));
    return { total: list.length, items: filterCases(list, {}).slice(0, 200) };
  }
}
