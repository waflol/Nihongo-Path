import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { AiExampleService } from "../ai/ai-example.service.js";
import { AiServicesService } from "../ai/ai-services.service.js";
import {
  ExerciseQuestion,
  type ExerciseQuestionDocument,
  type QuestionRights,
} from "../flashcards/schemas/exercise-question.schema.js";
import {
  ExamStimulus,
  type ExamStimulusDocument,
} from "./schemas/stimulus.schema.js";
import {
  ExamImportDraft,
  type ExamImportDraftDocument,
} from "./schemas/import-draft.schema.js";
import {
  ExamImportJob,
  type ExamImportJobDocument,
} from "./schemas/import-job.schema.js";
import {
  ExamImportJobPage,
  type ExamImportJobPageDocument,
} from "./schemas/import-job.schema.js";
import { contentHashOf, optionCountsOf } from "./mondai.js";
import { blockMarker, keyMarker, splitCompactKey, type AnswerKeyBlock } from "./import/answer-key.js";
import { openProsePdf } from "./import/prose.js";
import { segmentBlocks, type Block } from "./import/segment.js";
import { parseAiJson, structurePrompt, type ParsedBlock, validateParsed } from "./import/structure.js";

/**
 * JLPT exam-PDF import (NP-407 / plan §6 GĐ2). A PDF is read page by page,
 * segmented into 問題 blocks, and each block is structured by an AI model —
 * which is NEVER allowed to invent content (`validateParsed` checks every
 * string it returned against the block's raw text) and is never asked for the
 * answers. The result is a set of `exam_import_drafts` a human reviews, fills
 * in the answers from the printed key, and publishes. Publishing writes the
 * shared passages (`exam_stimuli`) and the questions (`exercise_questions`)
 * idempotently, so the same paper imported from two sources is kept once.
 *
 * One job per user at a time; pages checkpoint so a restart re-reads only the
 * missing ones (never the whole PDF). A 4 GB box → pages are read
 * sequentially, one rendered PNG at a time.
 */
@Injectable()
export class ExamImportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExamImportService.name);
  /** A job's structuring work is in-flight in this process (not yet persisted). */
  private readonly running = new Set<string>();

  constructor(
    @InjectModel(ExamImportJob.name) private readonly jobs: Model<ExamImportJobDocument>,
    @InjectModel(ExamImportJobPage.name) private readonly pages: Model<ExamImportJobPageDocument>,
    @InjectModel(ExamImportDraft.name) private readonly drafts: Model<ExamImportDraftDocument>,
    @InjectModel(ExamStimulus.name) private readonly stimuli: Model<ExamStimulusDocument>,
    @InjectModel(ExerciseQuestion.name) private readonly bank: Model<ExerciseQuestionDocument>,
    private readonly ai: AiExampleService,
    private readonly services: AiServicesService,
  ) {}

  /** Append to the job's event log (capped at the newest 400 lines). */
  private async log(id: string, level: "info" | "warn" | "error", msg: string): Promise<void> {
    await this.jobs
      .updateOne({ _id: id }, { $push: { log: { $each: [{ at: new Date(), level, msg: msg.slice(0, 400) }], $slice: -400 } } })
      .exec()
      .catch(() => undefined);
  }

  /** The admin pressed Cancel (status flipped by `cancel`). */
  private async isCancelled(id: string): Promise<boolean> {
    const j = await this.jobs.findById(id).select("status").lean().exec();
    return !j || j.status === "cancelled";
  }

  /** My recent jobs (progress only — no drafts, no log) for the global tracker. */
  async listJobs(caller: AuthUser): Promise<Record<string, unknown>[]> {
    return (await this.jobs
      .find({ user: caller.sub })
      .select("-log")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
      .exec()) as unknown as Record<string, unknown>[];
  }

  /** The event log of one job, with its progress counters for the log page. */
  async jobLog(caller: AuthUser, jobId: string): Promise<{ status: string; log: unknown[]; job: Record<string, unknown> }> {
    const job = await this.jobs.findOne({ _id: jobId, user: caller.sub }).lean().exec();
    if (!job) throw new NotFoundException("Import job not found");
    const { log, ...rest } = job as unknown as { log?: unknown[] } & Record<string, unknown>;
    return { status: job.status, log: log ?? [], job: rest };
  }

  /** Stop a running job; the work already done (pages, drafts) is kept. */
  async cancel(caller: AuthUser, jobId: string): Promise<{ cancelled: boolean }> {
    const r = await this.jobs
      .updateOne({ _id: jobId, user: caller.sub, status: "running" }, { $set: { status: "cancelled", finishedAt: new Date() } })
      .exec();
    if (r.matchedCount === 0) {
      const exists = await this.jobs.exists({ _id: jobId, user: caller.sub });
      if (!exists) throw new NotFoundException("Import job not found");
      return { cancelled: false };
    }
    await this.log(jobId, "warn", "Đã hủy theo yêu cầu — trang/bản nháp đã có được giữ lại");
    return { cancelled: true };
  }

  /** A job left `running` by a crash is resumed on boot (best effort). */
  async onApplicationBootstrap() {
    const stuck = await this.jobs.find({ status: "running" }).select("_id").lean().exec().catch(() => []);
    for (const j of stuck) {
      void this.runJob(String(j._id)).catch(() => undefined);
    }
  }

  /**
   * Read the uploaded PDF (text layer, or vision OCR for a scan) into
   * checkpointed pages, then segment + structure it into drafts. Returns the
   * job id immediately; the caller polls `jobProgress`.
   */
  async startJob(
    caller: AuthUser,
    buffer: Buffer,
    opts: { fileName: string; level: string; rights?: QuestionRights },
  ): Promise<{ jobId: string }> {
    const mine = await this.jobs.find({ user: caller.sub }).lean().exec();
    if (mine.some((j) => j.status === "running")) {
      throw new ConflictException("Một PDF đang được nhập — đợi nó xong rồi hãy nhập file khác");
    }
    const job = await this.jobs
      .create({
        user: caller.sub,
        fileName: opts.fileName,
        level: opts.level,
        rights: opts.rights ?? "reference",
        numPages: 0,
        status: "running",
      });

    void this.runJob(String(job._id), { buffer, level: opts.level, rights: opts.rights ?? "reference", createdBy: caller.sub });
    return { jobId: String(job._id) };
  }

  /** Read the remaining pages + segment + structure into drafts (idempotent). */
  private async runJob(id: string, seed?: { buffer: Buffer; level: string; rights: QuestionRights; createdBy: string }) {
    if (this.running.has(id)) return;
    this.running.add(id);
    try {
      const job = await this.jobs.findById(id).exec();
      if (!job || job.status !== "running") return;

      // 1. Read every page (checkpointed). With the seed we hold the buffer;
      //    on a restart we re-open from disk is not possible, so a crash
      //    before the first draft re-reads nothing new — the pages already
      //    checkpointed are kept and the rest are marked for re-upload.
      let numPages = job.numPages;
      if (!seed && job.pagesDone < job.numPages) {
        // The PDF bytes are not stored, so a restart cannot read the rest.
        await this.jobs.updateOne({ _id: id }, { $set: { status: "error", error: "Máy chủ khởi động lại khi đang đọc — hãy tải PDF lên lại", finishedAt: new Date() } }).exec();
        await this.log(id, "error", `Máy chủ khởi động lại ở trang ${job.pagesDone}/${job.numPages} — cần tải PDF lên lại`);
        return;
      }
      if (seed) {
        const pdf = await openProsePdf(seed.buffer, (png, n) => this.ai.ocrExamPageText(png, n));
        numPages = pdf.numPages;
        await this.jobs.updateOne({ _id: id }, { $set: { numPages } }).exec();
        await this.log(id, "info", `Mở PDF: ${numPages} trang — đọc từng trang`);
        for (let n = 1; n <= pdf.numPages; n += 1) {
          if (await this.isCancelled(id)) return;
          if (await this.pageExists(id, n)) continue; // already checkpointed
          const text = await pdf.pageText(n);
          await this.log(id, text ? "info" : "warn", text ? `Trang ${n}/${numPages}: ${text.length} ký tự` : `Trang ${n}/${numPages}: trống`);
          await this.pages.updateOne(
            { job: id, n },
            {
              $set: {
                text,
                source: text ? "text" : "ocr",
              },
            },
            { upsert: true },
          ).exec();
          await this.jobs.updateOne({ _id: id }, { $set: { pagesDone: n } }).exec().catch(() => undefined);
        }
      }

      await this.jobs.updateOne({ _id: id, status: "running" }, { $set: { phase: "structuring" } }).exec();
      // 2. Segment the checkpointed pages into 問題 blocks + the answer key.
      const pageRows = await this.pages.find({ job: id }).sort({ n: 1 }).lean().exec();
      const pageTexts = new Map(pageRows.map((p) => [p.n, p.text]));
      const pagesArr: string[] = [];
      for (let n = 1; n <= (numPages || pageRows.length || 1); n += 1) pagesArr.push(pageTexts.get(n) ?? "");
      const { blocks, answerKey } = segmentBlocks(pagesArr, seed?.level);

      // 3. Structure each block, write its draft. A block that fails
      //    validation is kept as `error` — it never fails the whole job.
      const keyBlocks = splitCompactKey(answerKey);
      const keyFor = (block: Block): AnswerKeyBlock | null => {
        const token = blockMarker(block.instruction);
        const hit = keyBlocks.find((k) => keyMarker(k.heading) === token);
        return hit ?? keyBlocks[0] ?? null;
      };
      let ok = 0;
      let bad = 0;
      await this.jobs.updateOne({ _id: id }, { $set: { blocksFound: blocks.length } }).exec();
      await this.log(id, "info", `Tách được ${blocks.length} khối 問題, ${keyBlocks.length} khối bảng đáp án`);
      for (const [i, block] of blocks.entries()) {
        if (await this.isCancelled(id)) return;
        if (await this.draftExistsForJobBlock(id, i)) continue; // resume: skip
        const draft = await this.structureBlock(
          id,
          job.fileName,
          seed?.createdBy ?? job.user,
          job.level,
          job.rights as QuestionRights,
          i,
          block,
          keyFor(block),
        );
        if (draft.status === "error") bad += 1;
        else ok += 1;
        await this.jobs.updateOne({ _id: id }, { $set: { blocksOk: ok, blocksError: bad } }).exec();
        await this.log(
          id,
          draft.status === "error" ? "warn" : "info",
          `Khối ${i + 1}/${blocks.length} (${block.mondai ?? "?"}): ${draft.status === "error" ? "cần xem lại" : "ok"}`,
        );
      }

      await this.jobs
        .updateOne(
          { _id: id, status: "running" },
          { $set: { blocksFound: blocks.length, blocksOk: ok, blocksError: bad, status: "done", phase: "done", finishedAt: new Date() } },
        )
        .exec();
      await this.log(id, "info", `Xong: ${ok} khối ok, ${bad} cần xem lại`);
      this.logger.log(`exam-import job ${id}: ${blocks.length} blocks, ${ok} ok, ${bad} need review`);
    } catch (err) {
      await this.jobs.updateOne({ _id: id }, { $set: { status: "error", error: String((err as Error).message).slice(0, 500), finishedAt: new Date() } }).exec().catch(() => undefined);
      await this.log(id, "error", String((err as Error).message));
    } finally {
      this.running.delete(id);
    }
  }

  private async pageExists(jobId: string, n: number): Promise<boolean> {
    const r = await this.pages.findOne({ job: jobId, n }).select("_id").lean().exec();
    return r !== null;
  }

  private async draftExistsForJobBlock(jobId: string, blockIndex: number): Promise<boolean> {
    const r = await this.drafts.findOne({ jobId, blockIndex }).select("_id").lean().exec();
    return r !== null;
  }

  /** Structure one block through the AI + write its draft row. */
  private async structureBlock(
    jobId: string,
    fileName: string,
    createdBy: string,
    level: string,
    rights: QuestionRights,
    blockIndex: number,
    block: { instruction: string; rawText: string; mondai: string | null; sectionHint: string; sitting: string },
    keyBlock: AnswerKeyBlock | null,
  ): Promise<{ status: string }> {
    const doc: ExamImportDraftDocument = await this.drafts.create({
      jobId,
      file: fileName,
      level,
      sitting: block.sitting,
      mondai: block.mondai,
      section: block.sectionHint,
      instruction: block.instruction,
      rawText: block.rawText,
      // The printed key's answers, 0 = still unknown (the AI never fills these).
      answers: keyBlock ? keyBlock.answers.map((a) => a ?? 0) : [],
      issues: [],
      status: "needs_review",
      rights,
      createdBy,
      blockIndex,
    } as unknown as Partial<ExamImportDraft>);

    if (block.mondai === "listening" || block.mondai === null) {
      // Listening has no text to structure; an unknown form is left for a
      // human. Both are kept, not AI-processed.
      if (block.mondai === null) doc.status = "error";
      await doc.save();
      return { status: doc.status };
    }

    const prompt = structurePrompt({ instruction: block.instruction, rawText: block.rawText, mondai: block.mondai });
    let parsed: ParsedBlock | null = null;
    try {
      const svc = (await this.services.available())[0];
      if (svc) {
        const res = await this.ai.complete(svc, prompt, { temperature: 0, purpose: "exam-import" });
        parsed = parseAiJson(res.text);
      }
    } catch (err) {
      this.logger.warn(`exam-import block ${blockIndex}: AI call failed — kept for review: ${(err as Error).message}`);
    }

    doc.parsed = parsed ?? undefined;
    const expected = optionCountsOf(block.mondai);
    const issues = validateParsed(parsed, block.rawText, expected);
    doc.issues = issues.map((i) => `${i.path}: ${i.message}`);
    doc.status = issues.length > 0 ? "error" : "needs_review";
    await doc.save();
    return { status: doc.status };
  }

  /** Poll the job: progress + the drafts it produced. */
  async jobProgress(caller: AuthUser, jobId: string): Promise<Record<string, unknown>> {
    const job = await this.jobs.findOne({ _id: jobId, user: caller.sub }).lean().exec();
    if (!job) throw new NotFoundException("Import job not found");
    const drafts = await this.drafts.find({ jobId }).sort({ "parsed.questions.0.no": 1 }).lean().exec();
    return { ...job, drafts };
  }

  /** List a job's drafts, optionally by status. */
  async listDrafts(caller: AuthUser, jobId: string, status?: string): Promise<Record<string, unknown>[]> {
    const filter: Record<string, unknown> = { jobId };
    if (status) filter.status = status;
    return (await this.drafts.find(filter).sort({ createdAt: 1 }).lean().exec()) as unknown as Record<string, unknown>[];
  }

  /**
   * Publish one reviewed draft: write its shared passages + questions into the
   * bank (idempotent by content hash) and mark it `published`. Every question
   * needs a human-entered answer (`0` = still unknown → refused).
   */
  async publish(caller: AuthUser, draftId: string, edits?: { answers?: number[] }): Promise<{ published: boolean; questions: number; stimuli: number }> {
    const doc = await this.drafts.findById(draftId).exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    if (edits?.answers) doc.answers = edits.answers.map((a) => Math.max(0, a | 0));

    const parsed = doc.parsed;
    if (!parsed || parsed.questions.length === 0) {
      throw new BadRequestException("Chưa có câu hỏi hợp lệ để xuất bản (draft đang ở trạng thái error/đã sửa tay)");
    }
    const answers = doc.answers.length >= parsed.questions.length ? doc.answers : parsed.questions.map(() => 0);
    const missing = parsed.questions.filter((q) => !(answers[q.no - 1] > 0));
    if (missing.length > 0) {
      throw new BadRequestException(`Còn ${missing.length} câu chưa có đáp án — điền đáp án từ bảng 答案 rồi xuất bản`);
    }

    const rights = doc.rights;
    const sourceRef = { file: doc.file || doc.jobId, sitting: doc.sitting, no: doc.mondai };

    // 1. The shared passages, idempotent by content hash.
    const stimIds = new Map<string, string>();
    let stimuliWritten = 0;
    for (const st of parsed.stimuli ?? []) {
      const hash = contentHashOf(st.body, st.bodyB ? [st.bodyB] : []);
      const existing = await this.stimuli.findOne({ contentHash: hash }).select("_id").lean().exec();
      if (existing) {
        stimIds.set(st.key, String(existing._id));
        continue;
      }
      const s = await this.stimuli
        .create({
          level: doc.level || undefined,
          mondai: doc.mondai ?? "reading-mid",
          section: doc.section,
          kind: st.kind,
          title: st.title || undefined,
          body: st.body,
          bodyB: st.bodyB || undefined,
          notes: st.notes || undefined,
          questionCount: parsed.questions.filter((q) => q.stimulusKey === st.key).length,
          rights,
          sourceRef,
          contentHash: hash,
          createdBy: caller.sub,
        } as Partial<ExamStimulus>);
      stimIds.set(st.key, String(s._id));
      stimuliWritten += 1;
    }

    // 2. The questions, idempotent by (prompt + options) content hash.
    let written = 0;
    for (const q of parsed.questions) {
      const answerNo = answers[q.no - 1];
      const answerText = q.options[answerNo - 1] ?? "";
      const hash = contentHashOf(q.prompt, q.options);
      const exists = await this.bank.findOne({ contentHash: hash }).select("_id").lean().exec();
      if (exists) continue;
      await this.bank
        .create({
          deck: null,
          card: null,
          kind: doc.mondai ? bankKindOf(doc.mondai) : "passage-question",
          prompt: q.prompt,
          options: q.options,
          answer: answerText,
          source: "local",
          verified: true, // the answer was read from the printed key by a human
          level: doc.level,
          mondai: doc.mondai ?? undefined,
          section: (doc.section as "vocab") ?? undefined,
          stimulus: q.stimulusKey ? stimIds.get(q.stimulusKey) ?? null : null,
          groupOrder: q.groupOrder,
          points: 1,
          rights,
          sourceRef,
          contentHash: hash,
          createdBy: caller.sub,
          dedupeKey: `imp:${hash}`,
        } as Partial<ExerciseQuestion>);
      written += 1;
    }

    doc.status = "published";
    await doc.save();
    return { published: true, questions: written, stimuli: stimuliWritten };
  }

  /** Discard a draft (a block the reviewer decides not to import). */
  async discard(caller: AuthUser, draftId: string): Promise<{ discarded: boolean }> {
    const doc = await this.drafts.findById(draftId).exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    doc.status = "discarded";
    await doc.save();
    return { discarded: true };
  }
}

/** A question's bank `kind` for the imported forms (NP-406 §5.2). */
function bankKindOf(mondai: string): ExerciseQuestion["kind"] {
  if (mondai === "star-order") return "star-order";
  if (mondai === "grammar-form") return "grammar-form";
  return "passage-question";
}
