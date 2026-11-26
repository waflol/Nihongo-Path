import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
import { contentHashOf, optionCountsOf, stripFormat } from "./mondai.js";
import { blockMarker, keyMarker, splitCompactKey, type AnswerKeyBlock } from "./import/answer-key.js";
import { renderPdfPage } from "../import/parsers/pdf.js";
import { AI_RETRY_DELAYS_MS, retryRounds } from "./import/retry.js";
import { applyMarks, enrich, type Junk, type Mark } from "./import/marks.js";
import { OcrFailedError, openProsePdf, type ProsePdf } from "./import/prose.js";
import { markCloze, parseByRules } from "./import/rules.js";
import { segmentBlocks, type Block } from "./import/segment.js";
import { parseAiJson, structurePrompt, type ParsedBlock, validateParsed } from "./import/structure.js";

/** Put the page's furigana + underlines back on the structured block (after validation, which reads plain text). */
function withMarks(
  doc: { instruction: string; parsed?: ParsedBlock },
  marks: Mark[],
  transform: (fields: string[]) => string[] = (fields) => applyMarks(fields, marks),
): boolean {
  if (marks.length === 0) return false;
  const parsed = doc.parsed;
  // Every printed string of the block, as value + setter, so a mark is placed once across all of them.
  const slots: [string, (v: string) => void][] = [[doc.instruction, (v) => (doc.instruction = v)]];
  for (const st of parsed?.stimuli ?? []) {
    for (const k of ["title", "body", "bodyB", "notes"] as const) {
      const v = st[k];
      if (v) slots.push([v, (x) => (st[k] = x)]);
    }
  }
  for (const q of parsed?.questions ?? []) {
    slots.push([q.prompt, (v) => (q.prompt = v)]);
    q.options.forEach((o, i) => slots.push([o, (v) => (q.options[i] = v)]));
  }
  let changed = false;
  transform(slots.map(([v]) => v ?? "")).forEach((v, i) => {
    if (v === (slots[i][0] ?? "")) return;
    slots[i][1](v);
    changed = true;
  });
  return changed;
}

/** Unread pages in a row that mean the AI is down, not that one page is hard. */
const MAX_UNREAD_IN_A_ROW = 5;

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
  /** The uploaded PDFs + the page images rendered from them, kept so the review screen can show the source page. */
  private readonly dir = resolve(process.env.EXAM_IMPORT_DIR?.trim() || join(process.cwd(), "storage", "exam-import"));
  /** Page renders run one at a time: a render of a big PDF is the heaviest thing this service does on a 4 GB box. */
  private renderChain: Promise<unknown> = Promise.resolve();
  /** Waits between rounds when no AI service answers. */
  private retryDelaysMs = AI_RETRY_DELAYS_MS;
  /** Jobs whose last block got no answer after every wait: the next blocks try once, without waiting again. */
  private readonly aiDown = new Set<string>();
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

  /**
   * Delete one import: the job, its pages and ALL its drafts, plus the kept PDF and page images.
   * Questions already published to the bank stay (they are the exam content, not the draft).
   * A running job must be cancelled first.
   */
  async deleteJob(caller: AuthUser, jobId: string): Promise<{ deleted: boolean; drafts: number }> {
    const job = await this.jobs.findOne({ _id: jobId, user: caller.sub }).select("status").lean().exec();
    if (!job) throw new NotFoundException("Import job not found");
    if (job.status === "running") throw new ConflictException("Lần nhập đang chạy — hủy nó trước rồi mới xoá");
    const d = await this.drafts.deleteMany({ jobId }).exec();
    await this.pages.deleteMany({ job: jobId }).exec();
    await this.jobs.deleteOne({ _id: jobId }).exec();
    for (const f of await readdir(this.dir).catch(() => [] as string[])) {
      if (f === `${jobId}.pdf` || f.startsWith(`${jobId}-p`)) await unlink(join(this.dir, f)).catch(() => undefined);
    }
    return { deleted: true, drafts: d.deletedCount ?? 0 };
  }

  /** A job left `running` by a crash is resumed on boot (best effort). */
  async onApplicationBootstrap() {
    void this.pruneFiles().catch(() => undefined);
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

    // Keep the PDF so the review screen can show each block's source page (best effort).
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, `${String(job._id)}.pdf`), buffer);
    } catch (err) {
      this.logger.warn(`exam-import: cannot keep the PDF of job ${String(job._id)}: ${(err as Error).message}`);
    }
    void this.runJob(String(job._id), { buffer, level: opts.level, rights: opts.rights ?? "reference", createdBy: caller.sub });
    return { jobId: String(job._id) };
  }

  /**
   * Checkpoint every page of the PDF. A page nobody could read is NOT saved: it
   * is tried again after the others, and several in a row stop the job (the AI is
   * down — importing the rest would only produce an exam full of holes).
   * `false` = the admin cancelled.
   */
  private async readPages(id: string, pdf: ProsePdf): Promise<boolean> {
    const total = pdf.numPages;
    const read = async (n: number): Promise<boolean> => {
      let text: string;
      try {
        text = await pdf.pageText(n);
      } catch (err) {
        if (err instanceof OcrFailedError) return false;
        throw err;
      }
      await this.log(id, text ? "info" : "warn", text ? `Trang ${n}/${total}: ${text.length} ký tự` : `Trang ${n}/${total}: trống`);
      await this.pages
        .updateOne({ job: id, n }, { $set: { text, source: text ? "text" : "ocr", marks: pdf.pageMarks?.(n) ?? [] } }, { upsert: true })
        .exec();
      return true;
    };

    const failed: number[] = [];
    let inARow = 0;
    for (let n = 1; n <= total; n += 1) {
      if (await this.isCancelled(id)) return false;
      if (await this.pageExists(id, n)) continue; // already checkpointed
      if (await read(n)) inARow = 0;
      else {
        if (await this.isCancelled(id)) return false;
        failed.push(n);
        inARow += 1;
        await this.log(id, "warn", `Trang ${n}/${total}: AI chưa đọc được — sẽ thử lại sau`);
        if (inARow >= MAX_UNREAD_IN_A_ROW) {
          throw new Error(`AI đọc ảnh không phản hồi ở ${inARow} trang liên tiếp (đến trang ${n}) — kiểm tra dịch vụ AI rồi nhập lại`);
        }
      }
      await this.jobs.updateOne({ _id: id }, { $set: { pagesDone: n } }).exec().catch(() => undefined);
    }

    const lost: number[] = [];
    for (const n of failed) {
      if (await this.isCancelled(id)) return false;
      if (!(await read(n))) lost.push(n);
    }
    if (await this.isCancelled(id)) return false;
    if (lost.length > 0) {
      await this.log(id, "error", `${lost.length} trang AI không đọc được, thiếu trong bản nháp: ${lost.join(", ")}`);
    }
    return true;
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
        const pdf = await openProsePdf(seed.buffer, (png, n) =>
          retryRounds(() => this.ai.ocrExamPageText(png, n), this.retryDelaysMs, () => this.isCancelled(id)),
        );
        try {
          numPages = pdf.numPages;
          await this.jobs.updateOne({ _id: id }, { $set: { numPages } }).exec();
          await this.log(id, "info", `Mở PDF: ${numPages} trang — đọc từng trang`);
          if (pdf.totalPages > numPages) {
            await this.log(id, "warn", `File có ${pdf.totalPages} trang nhưng chỉ đọc ${numPages} trang đầu — phần còn lại bị bỏ, hãy tách file rồi nhập tiếp`);
          }
          if (!(await this.readPages(id, pdf))) return;
        } finally {
          await pdf.close();
        }
      }

      await this.jobs.updateOne({ _id: id, status: "running" }, { $set: { phase: "structuring" } }).exec();
      // 2. Segment the checkpointed pages into 問題 blocks + the answer key.
      const pageRows = await this.pages.find({ job: id }).sort({ n: 1 }).lean().exec();
      const pageTexts = new Map(pageRows.map((p) => [p.n, p.text]));
      const pagesArr: string[] = [];
      for (let n = 1; n <= (numPages || pageRows.length || 1); n += 1) pagesArr.push(pageTexts.get(n) ?? "");
      const { blocks, answerKey, sheetKeys } = segmentBlocks(pagesArr, seed?.level);

      // 3. Structure each block, write its draft. A block that fails
      //    validation is kept as `error` — it never fails the whole job.
      const keyBlocks = splitCompactKey(answerKey);
      const keyFor = (block: Block): AnswerKeyBlock | null => {
        if (block.key) return block.key;
        const token = blockMarker(block.instruction);
        // A collection PDF carries one answer sheet per paper: match by paper + 問題 number.
        const sheet = sheetKeys[block.sitting];
        if (sheet) return sheet.find((k) => keyMarker(k.heading) === token) ?? null;
        const hit = keyBlocks.find((k) => keyMarker(k.heading) === token);
        return hit ?? keyBlocks[0] ?? null;
      };
      let ok = 0;
      let bad = 0;
      await this.jobs.updateOne({ _id: id }, { $set: { blocksFound: blocks.length } }).exec();
      await this.log(id, "info", `Tách được ${blocks.length} khối 問題, ${keyBlocks.length} khối bảng đáp án`);
      const perSitting = new Map<string, number>();
      for (const b of blocks) perSitting.set(b.sitting, (perSitting.get(b.sitting) ?? 0) + 1);
      await this.log(
        id,
        perSitting.has("unknown") ? "warn" : "info",
        `Nhận ${perSitting.size} đề: ${[...perSitting].map(([k, v]) => `${k} (${v} khối)`).join(", ")}; bảng đáp án riêng cho ${Object.keys(sheetKeys).length} đề`,
      );
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
          pageRows
            .filter((p) => p.n >= (block.pageFrom ?? 0) && p.n <= (block.pageTo ?? block.pageFrom ?? 0))
            .flatMap((p) => (p.marks ?? []) as Mark[]),
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
      this.aiDown.delete(id);
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
    block: { instruction: string; rawText: string; mondai: string | null; sectionHint: string; sitting: string; pageFrom?: number; pageTo?: number },
    keyBlock: AnswerKeyBlock | null,
    marks: Mark[] = [],
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
      pageFrom: block.pageFrom,
      pageTo: block.pageTo,
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

    // 1. Rules first: the sentence-level forms read exactly, with no AI.
    const expected = optionCountsOf(block.mondai);
    const byRules = parseByRules(block);
    let ruleIssues: string[] = [];
    if (byRules) {
      ruleIssues = validateParsed(byRules, block.rawText, expected).map((i) => `${i.path}: ${i.message}`);
      const printed = keyBlock?.questionCount ?? 0;
      if (printed > 0 && byRules.questions.length !== printed) {
        ruleIssues.push(`số câu đọc được (${byRules.questions.length}) khác bảng đáp án (${printed})`);
      }
      if (ruleIssues.length === 0) {
        doc.parsed = markCloze(byRules);
        withMarks(doc, marks);
        doc.parsedBy = "rules";
        doc.issues = [];
        doc.status = "needs_review";
        await doc.save();
        return { status: doc.status };
      }
    }

    // 2. Otherwise the AI structures it (passages, cloze, or a block the rules could not read).
    const prompt = structurePrompt({ instruction: block.instruction, rawText: block.rawText, mondai: block.mondai });
    let parsed: ParsedBlock | null = null;
    let aiError = "";
    const reply = await retryRounds(
      async () => {
        const r = await this.ai.completeAny(prompt, { temperature: 0, purpose: "exam-import", task: "ocr-exam", words: [`Tách khối ${blockIndex + 1}`] }, (text) => {
          const value = parseAiJson(text);
          return { value, ok: validateParsed(value, block.rawText, expected).length === 0 };
        });
        aiError = r.error ?? aiError;
        return r.answered ? r : null;
      },
      this.aiDown.has(jobId) ? [] : this.retryDelaysMs,
      () => this.isCancelled(jobId),
    );
    if (reply) {
      this.aiDown.delete(jobId);
      parsed = reply.value ?? null;
    } else {
      this.aiDown.add(jobId);
      this.logger.warn(`exam-import block ${blockIndex}: AI call failed — kept for review: ${aiError || "no service ready"}`);
    }

    let issues = validateParsed(parsed, block.rawText, expected).map((i) => `${i.path}: ${i.message}`);
    if (parsed && issues.length === 0) {
      doc.parsedBy = "ai";
    } else if (byRules) {
      // The AI added nothing: show what the rules read, with their own issues, for a human.
      parsed = byRules;
      issues = ruleIssues;
      doc.parsedBy = "rules";
    }
    // The key and the review screen address questions by POSITION in the block (1..n); a paper
    // that prints running numbers (6..10) must not shift the answers.
    parsed?.questions.forEach((q, i) => {
      // Keep the number the paper PRINTS (the AI reports it in `no`) so the reviewer and learners
      // still see 55, 56… while `no` stays the position the answers are keyed by.
      if (q.printedNo == null && Number.isInteger(q.no) && q.no > 0) q.printedNo = q.no;
      q.no = i + 1;
    });
    doc.parsed = parsed ?? undefined;
    withMarks(doc, marks);
    doc.issues = issues;
    doc.status = issues.length > 0 ? "error" : "needs_review";
    await doc.save();
    return { status: doc.status };
  }

  /**
   * Add furigana + underlines to the drafts of an earlier import, from the kept PDF
   * (no AI). Only open drafts, and only text nobody has formatted by hand.
   */
  async backfillMarks(caller: AuthUser, jobId: string): Promise<{ drafts: number; changed: number; skipped: number }> {
    const job = await this.jobs.findById(jobId).select("status").lean().exec();
    if (!job) throw new NotFoundException("Import job not found");
    if (job.status === "running") throw new ConflictException("Đợi lần nhập này chạy xong đã");
    const lock = `marks:${jobId}`;
    if (this.running.has(lock)) throw new ConflictException("Đang bổ sung cho lần nhập này — đợi xong đã");
    this.running.add(lock);
    try {
      const buffer = await readFile(join(this.dir, `${jobId}.pdf`)).catch(() => null);
      if (!buffer) throw new BadRequestException("File PDF của lần nhập này không còn trên máy chủ — hãy nhập lại PDF");
      const pdf = await openProsePdf(buffer);
      const docs = await this.drafts.find({ jobId, status: { $in: ["needs_review", "error"] } }).exec();
      const read = new Map<number, { marks: Mark[]; junk: Junk[] }>();
      let changed = 0;
      let skipped = 0;
      try {
        for (const doc of docs) {
          if (!doc.pageFrom) {
            skipped += 1; // imported before drafts recorded their pages
            continue;
          }
          const marks: Mark[] = [];
          const junk: Junk[] = [];
          for (let n = doc.pageFrom; n <= Math.min(doc.pageTo ?? doc.pageFrom, pdf.numPages); n += 1) {
            let page = read.get(n);
            if (!page) {
              await pdf.pageText(n);
              read.set(n, (page = { marks: pdf.pageMarks?.(n) ?? [], junk: pdf.pageJunk?.(n) ?? [] }));
            }
            marks.push(...page.marks);
            junk.push(...page.junk);
          }
          if (!withMarks(doc, marks, (fields) => enrich(fields, marks, junk))) continue;
          doc.markModified("parsed");
          await doc.save();
          changed += 1;
        }
      } finally {
        await pdf.close();
      }
      await this.log(jobId, "info", `Bổ sung furigana, gạch chân: ${changed}/${docs.length} bản nháp thay đổi`);
      return { drafts: docs.length, changed, skipped };
    } finally {
      this.running.delete(lock);
    }
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
    const rows = (await this.drafts.find(filter).sort({ createdAt: 1 }).lean().exec()) as unknown as Record<string, unknown>[];
    // Numbers are continuous within one paper: fill the gaps from the whole job, not just this filter.
    const all = status
      ? ((await this.drafts.find({ jobId }).select("blockIndex sitting parsed.questions.printedNo").lean().exec()) as unknown as DraftLike[])
      : (rows as unknown as DraftLike[]);
    const filled = fillPrintedNos(all);
    for (const r of rows) {
      const qs = (r as unknown as DraftLike).parsed?.questions;
      const f = filled.get(String((r as { _id: unknown })._id));
      if (qs && f) qs.forEach((q, i) => (q.printedNo = f[i]));
    }
    return rows;
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
    const siblings = (await this.drafts.find({ jobId: doc.jobId, sitting: doc.sitting }).select("blockIndex sitting parsed.questions.printedNo").lean().exec()) as unknown as DraftLike[];
    const printedFilled = fillPrintedNos(siblings).get(String(doc._id));
    let written = 0;
    for (const q of parsed.questions) {
      const answerNo = answers[q.no - 1];
      const printedNo = printedFilled?.[q.no - 1] ?? q.printedNo;
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
          printedNo,
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
  /**
   * Replace a draft's parsed passages + questions with the reviewer's hand edits
   * (the Word-like editor of the review screen). Only an open draft can be edited.
   * Nothing is checked against the raw text any more — a person is the authority —
   * but the SHAPE is: kinds, 4 options (3/4 for listening), stimulus links, sizes.
   * `answers` (aligned with the NEW question order) replaces the stored picks.
   */
  /**
   * The source page (PNG) of an import job, for the side-by-side review. Rendered on demand from
   * the kept PDF and cached next to it; a job from before the PDF was kept has no image.
   */
  async pageImage(jobId: string, page: number): Promise<Buffer> {
    if (!/^[a-f0-9]{24}$/i.test(jobId) || !Number.isInteger(page) || page < 1 || page > 2000) {
      throw new BadRequestException("jobId hoặc số trang không hợp lệ");
    }
    const cached = join(this.dir, `${jobId}-p${page}.png`);
    try {
      return await readFile(cached);
    } catch {
      /* not rendered yet */
    }
    let pdf: Buffer;
    try {
      pdf = await readFile(join(this.dir, `${jobId}.pdf`));
    } catch {
      throw new NotFoundException("Không còn file PDF của lần nhập này — nhập lại để xem ảnh trang");
    }
    const run = this.renderChain.then(async () => {
      try {
        return await readFile(cached); // another request rendered it while we waited
      } catch {
        const png = await renderPdfPage(pdf, page);
        await writeFile(cached, png).catch(() => undefined);
        return png;
      }
    });
    this.renderChain = run.catch(() => undefined);
    return run;
  }

  /** Drop kept PDFs / page images older than 30 days. */
  private async pruneFiles(): Promise<void> {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    for (const f of await readdir(this.dir).catch(() => [] as string[])) {
      const p = join(this.dir, f);
      const st = await stat(p).catch(() => null);
      if (st && st.mtimeMs < cutoff) await unlink(p).catch(() => undefined);
    }
  }

  async updateDraft(caller: AuthUser, draftId: string, body: unknown): Promise<Record<string, unknown>> {
    const doc = await this.drafts.findById(draftId).exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    if (doc.status !== "needs_review" && doc.status !== "error") {
      throw new BadRequestException("Chỉ sửa được khối chưa xuất bản / chưa loại");
    }
    const b = (body ?? {}) as { instruction?: unknown; stimuli?: unknown; questions?: unknown; answers?: unknown };
    const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, max) : "");
    const kinds = ["passage", "cloze", "notice", "pair"];

    const stimuli: ParsedBlock["stimuli"] = [];
    for (const raw of Array.isArray(b.stimuli) ? b.stimuli.slice(0, 20) : []) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const key = text(o.key, 20).trim();
      const body = text(o.body, 20000).trim();
      if (!key || stimuli.some((s) => s.key === key)) throw new BadRequestException("Bài dùng chung thiếu key hoặc trùng key");
      if (!stripFormat(body).trim()) throw new BadRequestException(`Bài ${key} đang trống — xoá bài hoặc nhập nội dung`);
      const kind = typeof o.kind === "string" && kinds.includes(o.kind) ? o.kind : "passage";
      const st: ParsedBlock["stimuli"][number] = { key, kind: kind as "passage", body };
      const title = text(o.title, 200).trim();
      const bodyB = text(o.bodyB, 20000).trim();
      const notes = text(o.notes, 4000).trim();
      if (title) st.title = title;
      if (bodyB) st.bodyB = bodyB;
      if (notes) st.notes = notes;
      stimuli.push(st);
    }

    const expected = optionCountsOf(doc.mondai);
    const questions: ParsedBlock["questions"] = [];
    const order = new Map<string, number>();
    for (const raw of Array.isArray(b.questions) ? b.questions.slice(0, 80) : []) {
      const o = (raw ?? {}) as Record<string, unknown>;
      const prompt = text(o.prompt, 4000).trim();
      const options = (Array.isArray(o.options) ? o.options : []).map((x) => text(x, 1000).trim());
      const at = `Câu ${questions.length + 1}`;
      if (!stripFormat(prompt).trim()) throw new BadRequestException(`${at}: thiếu đề`);
      if (!expected.includes(options.length) || options.some((x) => !stripFormat(x).trim())) {
        throw new BadRequestException(`${at}: cần đủ ${expected.join("/")} phương án, không để trống`);
      }
      const q: ParsedBlock["questions"][number] = { no: questions.length + 1, prompt, options };
      const printed = Number(o.printedNo);
      if (Number.isInteger(printed) && printed >= 1 && printed <= 999) q.printedNo = printed;
      const key = typeof o.stimulusKey === "string" ? o.stimulusKey : "";
      if (key) {
        if (!stimuli.some((s) => s.key === key)) throw new BadRequestException(`${at}: trỏ tới bài đọc không tồn tại`);
        q.stimulusKey = key;
        q.groupOrder = (order.get(key) ?? 0) + 1;
        order.set(key, q.groupOrder);
      }
      questions.push(q);
    }
    if (questions.length === 0) throw new BadRequestException("Cần ít nhất một câu hỏi");

    if (typeof b.instruction === "string") doc.instruction = text(b.instruction, 1000).trim();
    const given = Array.isArray(b.answers) ? b.answers : [];
    doc.answers = questions.map((_, i) => {
      const a = Number(given[i]);
      return Number.isInteger(a) && a >= 1 && a <= questions[i].options.length ? a : 0;
    });
    doc.parsed = { stimuli, questions };
    doc.markModified("parsed");
    doc.parsedBy = "manual";
    doc.issues = [];
    doc.status = "needs_review";
    await doc.save();
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async discard(caller: AuthUser, draftId: string): Promise<{ discarded: boolean }> {
    const doc = await this.drafts.findById(draftId).exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    doc.status = "discarded";
    await doc.save();
    return { discarded: true };
  }
}

interface DraftLike {
  _id: unknown;
  blockIndex: number;
  sitting: string;
  parsed?: { questions: { printedNo?: number }[] };
}

/**
 * The number each question carries on the paper, continuous within one paper (sitting): a question
 * whose printed number was not read continues from the one before it, across 問題 blocks.
 * Returns the numbers per draft id, in question order.
 */
export function fillPrintedNos(drafts: DraftLike[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const bySitting = new Map<string, DraftLike[]>();
  for (const d of drafts) bySitting.set(d.sitting, [...(bySitting.get(d.sitting) ?? []), d]);
  for (const list of bySitting.values()) {
    list.sort((a, b) => a.blockIndex - b.blockIndex);
    let last = 0;
    for (const d of list) {
      out.set(
        String(d._id),
        (d.parsed?.questions ?? []).map((q) => {
          last = q.printedNo != null && q.printedNo > 0 ? q.printedNo : last + 1;
          return last;
        }),
      );
    }
  }
  return out;
}

/** A question's bank `kind` for the imported forms (NP-406 §5.2). */
function bankKindOf(mondai: string): ExerciseQuestion["kind"] {
  if (mondai === "star-order") return "star-order";
  if (mondai === "grammar-form") return "grammar-form";
  return "passage-question";
}
