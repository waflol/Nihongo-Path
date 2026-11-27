import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Model } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { AiExampleService } from "../ai/ai-example.service.js";
import { AiServicesService } from "../ai/ai-services.service.js";
import { isOcrRefused } from "../ai/ocr-refusal.js";
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
import { contentHashOf, isListeningMondai, optionCountsOf, stripFormat } from "./mondai.js";
import { ExamAudioAsset, type ExamAudioAssetDocument } from "./schemas/audio-asset.schema.js";
import { blockMarker, keyMarker, splitCompactKey, type AnswerKeyBlock } from "./import/answer-key.js";
import { listeningMondai, parseListening } from "./import/listening.js";
import { picturesOfBlock, readLayouts } from "./import/pictures.js";
import { ExamImageService } from "./exam-image.service.js";
import { mondaiNumberOf, sheetsOf } from "./import/mondai-table.js";
import { renderPdfPage } from "../import/parsers/pdf.js";
import { AI_RETRY_DELAYS_MS, retryRounds } from "./import/retry.js";
import { applyMarks, enrich, type Junk, type Mark } from "./import/marks.js";
import { OcrFailedError, openProsePdf, type ProsePdf } from "./import/prose.js";
import { markCloze, parseByRules } from "./import/rules.js";
import { segmentBlocks, type Block } from "./import/segment.js";
import { readSuggestions, suggestPrompt, type AnswerSuggestion } from "./import/suggest.js";
import { answerTemplate, headingOf, matchAnswerFile, mergeAnswers, parseAnswerFile, type AnswerFileDraft } from "./import/answer-file.js";
import { parseAiJson, structurePrompt, type DraftAudio, type ParsedBlock, validateParsed } from "./import/structure.js";

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

/** Fill a 聴解 draft from its printed lines: the whole instruction, the questions, what a person must check. */
function readListening(
  doc: { instruction: string; rawText: string; mondai?: string | null; parsed?: ParsedBlock; parsedBy?: string; issues: string[]; status: string },
  level: string,
  keyCount: number,
): void {
  const r = parseListening(doc, level, keyCount);
  doc.instruction = r.instruction;
  doc.parsed = r.parsed;
  doc.parsedBy = "rules";
  doc.issues = r.issues;
  doc.status = r.issues.length > 0 ? "error" : "needs_review";
}

/**
 * The printed answers of one block: its own key, else the paper's answer sheet (a collection PDF
 * carries one per paper), else the PDF's key — matched by 問題 number.
 */
export function keyForBlock(
  block: Pick<Block, "key" | "instruction" | "mondai">,
  sheet: AnswerKeyBlock[] | undefined,
  keyBlocks: AnswerKeyBlock[],
  level: string | undefined,
): AnswerKeyBlock | null {
  if (block.key) return block.key;
  const token = blockMarker(block.instruction);
  if (isListeningMondai(block.mondai)) {
    // 聴解 numbers restart at 問題 1: its key is the occurrence after every written sheet's,
    // and a key without a listening part must not lend it the 文字・語彙 answers.
    const same = (sheet ?? keyBlocks).filter((k) => keyMarker(k.heading) === token);
    return same.length > Math.max(1, sheetsOf(level)) ? same[same.length - 1] : null;
  }
  if (sheet) return sheet.find((k) => keyMarker(k.heading) === token) ?? null;
  const hit = keyBlocks.find((k) => keyMarker(k.heading) === token);
  return hit ?? keyBlocks[0] ?? null;
}

/** Pictures are looked for only in a PDF this small (a scan has none to find, and is the big one). */
const MAX_PICTURE_PDF_BYTES = 40 * 1024 * 1024;

/**
 * A question that now has its picture no longer needs the "options are pictures" check, and a
 * 発話表現 block whose every question has one no longer needs the "pictures missing" one.
 */
export function settlePictureIssues(doc: { parsed?: ParsedBlock; issues: string[]; status: string }): void {
  const qs = doc.parsed?.questions ?? [];
  const pictured = new Set(qs.filter((q) => q.image).map((q) => `${q.printedNo}番`));
  doc.issues = doc.issues.filter((i) => {
    const m = /^(\d{1,2}番): không đọc được phương án/.exec(i);
    if (m) return !pictured.has(m[1]);
    if (i.startsWith("発話表現:")) return !(qs.length > 0 && qs.every((q) => q.image));
    return true;
  });
  if (doc.status === "error" || doc.status === "needs_review") doc.status = doc.issues.length > 0 ? "error" : "needs_review";
}

/** Key of the passage a listening block's own recording is published as. */
const BLOCK_TRACK = "__track";

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
    @InjectModel(ExamAudioAsset.name) private readonly audioAssets: Model<ExamAudioAssetDocument>,
    private readonly images: ExamImageService,
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

  /**
   * The page reader's OCR: waits out an AI outage between rounds; a page every provider
   * refused to transcribe comes back as an unread page (`OcrFailedError.refused`), never as text.
   */
  private ocrPage(jobId?: string): (png: Buffer, n: number) => Promise<string | null> {
    return async (png, n) => {
      const r = await retryRounds(() => this.ai.ocrExamPageText(png, n), this.retryDelaysMs, jobId ? () => this.isCancelled(jobId) : undefined);
      if (isOcrRefused(r)) throw new OcrFailedError(n, r.refused);
      return r;
    };
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
    void this.rereadListening().catch((err) => this.logger.warn(`listening drafts not re-read: ${(err as Error).message}`));
  }

  /**
   * Imports from before 聴解 was read kept every listening block as an untyped `listening`
   * draft with no questions. Read those again from their stored text (rules only, no AI):
   * the 問題 type, its questions and options. Only open drafts nobody has edited.
   */
  async rereadListening(): Promise<number> {
    const old = await this.drafts
      .find({ mondai: "listening", status: { $in: ["needs_review", "error"] }, "parsed.questions.0": { $exists: false } })
      .limit(500)
      .exec();
    for (const doc of old) {
      const head = doc.rawText.split("\n").slice(0, 3).join(" ");
      doc.mondai = listeningMondai(`${doc.instruction} ${head}`, doc.level, mondaiNumberOf(doc.instruction)).mondai as ExamImportDraft["mondai"];
      // Their key, if any, was matched by 問題 number to the 文字・語彙 part — not theirs.
      doc.answers = [];
      readListening(doc, doc.level, 0);
      await doc.save();
    }
    if (old.length > 0) this.logger.log(`exam-import: re-read ${old.length} listening draft(s)`);
    return old.length;
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
    const read = async (n: number): Promise<true | OcrFailedError> => {
      let text: string;
      try {
        text = await pdf.pageText(n);
      } catch (err) {
        if (err instanceof OcrFailedError) return err;
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
      const r = await read(n);
      if (r === true) inARow = 0;
      else {
        if (await this.isCancelled(id)) return false;
        failed.push(n);
        if (r.refused) {
          // A page the AI will not copy (copyright filter) is not an outage: it does not stop the job.
          await this.log(id, "warn", `Trang ${n}/${total}: AI từ chối chép trang này (${r.refused.slice(0, 160)}) — sẽ thử lại sau`);
        } else {
          inARow += 1;
          await this.log(id, "warn", `Trang ${n}/${total}: AI chưa đọc được — sẽ thử lại sau`);
          if (inARow >= MAX_UNREAD_IN_A_ROW) {
            throw new Error(`AI đọc ảnh không phản hồi ở ${inARow} trang liên tiếp (đến trang ${n}) — kiểm tra dịch vụ AI rồi nhập lại`);
          }
        }
      }
      await this.jobs.updateOne({ _id: id }, { $set: { pagesDone: n } }).exec().catch(() => undefined);
    }

    const lost: number[] = [];
    const refused: number[] = [];
    for (const n of failed) {
      if (await this.isCancelled(id)) return false;
      const r = await read(n);
      if (r === true) continue;
      lost.push(n);
      if (r.refused) refused.push(n);
    }
    if (await this.isCancelled(id)) return false;
    if (lost.length > 0) {
      const why = refused.length > 0
        ? ` (AI từ chối chép vì bản quyền: ${refused.join(", ")} — thêm/xếp trước một dịch vụ đọc ảnh của nhà cung cấp khác ở /admin/ai, hoặc nhập tay các khối đó)`
        : "";
      await this.log(id, "error", `${lost.length} trang AI không đọc được, thiếu trong bản nháp: ${lost.join(", ")}${why}`);
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
        const pdf = await openProsePdf(seed.buffer, this.ocrPage(id));
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
      // Pages no service could read: a block next to one may be missing questions or its passage.
      const unread = pagesArr.flatMap((_, i) => (pageTexts.has(i + 1) ? [] : [i + 1]));
      const { blocks, answerKey, sheetKeys } = segmentBlocks(pagesArr, seed?.level ?? job.level);

      // 3. Structure each block, write its draft. A block that fails
      //    validation is kept as `error` — it never fails the whole job.
      const keyBlocks = splitCompactKey(answerKey);
      const keyFor = (block: Block) => keyForBlock(block, sheetKeys[block.sitting], keyBlocks, seed?.level ?? job.level);
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
          unread,
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
    unread: number[] = [],
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

    if (isListeningMondai(block.mondai)) {
      // 聴解 prints only `N番` and some options: read by rules, never the AI.
      readListening(doc, level, keyBlock?.questionCount ?? 0);
      // Best effort: a picture that cannot be cut is left for the reviewer to cut by hand.
      await this.addPictures(doc, jobId).catch((err) => this.logger.warn(`exam-import block ${blockIndex}: pictures not cut: ${(err as Error).message}`));
      await doc.save();
      return { status: doc.status };
    }
    if (block.mondai === null) {
      // An unknown form is left for a human (kept, not AI-processed).
      doc.status = "error";
      await doc.save();
      return { status: doc.status };
    }

    // The printed key says how many questions the block has: a read with another count lost or invented some.
    const printed = keyBlock?.questionCount ?? 0;
    const countIssue = (p: ParsedBlock | null): string | null =>
      p && printed > 0 && p.questions.length !== printed ? `số câu đọc được (${p.questions.length}) khác bảng đáp án (${printed})` : null;
    // A page next to the block that no service could read: unless the key confirms the count, say so.
    const gap = unread.filter((n) => n >= (block.pageFrom ?? 0) && n <= (block.pageTo ?? block.pageFrom ?? 0) + 1);
    const gapIssue = (p: ParsedBlock | null): string[] =>
      gap.length > 0 && !(p && printed > 0 && p.questions.length === printed)
        ? [`trang ${gap.join(", ")}: AI chưa đọc được trang này — khối có thể thiếu câu hoặc bài đọc, đối chiếu ảnh trang PDF`]
        : [];

    // 1. Rules first: the sentence-level forms read exactly, with no AI.
    const expected = optionCountsOf(block.mondai);
    const byRules = parseByRules(block);
    let ruleIssues: string[] = [];
    if (byRules) {
      ruleIssues = validateParsed(byRules, block.rawText, expected).map((i) => `${i.path}: ${i.message}`);
      const c = countIssue(byRules);
      if (c) ruleIssues.push(c);
      if (ruleIssues.length === 0) {
        doc.parsed = markCloze(byRules);
        withMarks(doc, marks);
        doc.parsedBy = "rules";
        doc.issues = gapIssue(byRules);
        doc.status = doc.issues.length > 0 ? "error" : "needs_review";
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
          return { value, ok: validateParsed(value, block.rawText, expected).length === 0 && !countIssue(value) };
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
    const aiCount = issues.length === 0 ? countIssue(parsed) : null;
    if (aiCount) issues.push(aiCount);
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
    doc.issues = [...issues, ...gapIssue(parsed)];
    doc.status = doc.issues.length > 0 ? "error" : "needs_review";
    await doc.save();
    return { status: doc.status };
  }

  /**
   * Add furigana + underlines to the drafts of an earlier import, from the kept PDF.
   * Only open drafts, and only text nobody has formatted by hand. Pages with a text
   * layer are done at once (no AI); scanned pages are read again by the AI in the
   * background (`scanning` = how many), with progress in the job log.
   */
  async backfillMarks(caller: AuthUser, jobId: string): Promise<{ drafts: number; changed: number; skipped: number; scanning: number }> {
    const job = await this.jobs.findById(jobId).select("status").lean().exec();
    if (!job) throw new NotFoundException("Import job not found");
    if (job.status === "running") throw new ConflictException("Đợi lần nhập này chạy xong đã");
    const lock = `marks:${jobId}`;
    if (this.running.has(lock)) throw new ConflictException("Đang bổ sung cho lần nhập này — đợi xong đã (xem nhật ký)");
    this.running.add(lock);
    let background = false;
    try {
      const buffer = await readFile(join(this.dir, `${jobId}.pdf`)).catch(() => null);
      if (!buffer) throw new BadRequestException("File PDF của lần nhập này không còn trên máy chủ — hãy nhập lại PDF");
      const pdf = await openProsePdf(buffer);
      const docs = await this.drafts.find({ jobId, status: { $in: ["needs_review", "error"] } }).exec();
      const read = new Map<number, { marks: Mark[]; junk: Junk[]; scan: boolean }>();
      const scanned: ExamImportDraftDocument[] = [];
      const scanPages = new Set<number>();
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
          let scan = false;
          for (let n = doc.pageFrom; n <= Math.min(doc.pageTo ?? doc.pageFrom, pdf.numPages); n += 1) {
            let page = read.get(n);
            if (!page) {
              await pdf.pageText(n);
              read.set(n, (page = { marks: pdf.pageMarks?.(n) ?? [], junk: pdf.pageJunk?.(n) ?? [], scan: pdf.pageIsScan?.(n) ?? false }));
            }
            marks.push(...page.marks);
            junk.push(...page.junk);
            if (page.scan) {
              scan = true;
              scanPages.add(n);
            }
          }
          if (scan) {
            scanned.push(doc);
            continue;
          }
          if (!withMarks(doc, marks, (fields) => enrich(fields, marks, junk))) continue;
          doc.markModified("parsed");
          await doc.save();
          changed += 1;
        }
      } finally {
        await pdf.close();
      }
      await this.log(jobId, "info", `Bổ sung furigana, gạch chân: ${changed}/${docs.length - scanned.length} bản nháp thay đổi`);
      if (scanned.length > 0) {
        const ocr = await openProsePdf(buffer, this.ocrPage());
        background = true;
        void this.markScans(jobId, ocr, scanned)
          .catch((err) => this.log(jobId, "error", `Bổ sung gạch chân bị dừng: ${(err as Error).message}`))
          .finally(async () => {
            this.running.delete(lock);
            await ocr.close().catch(() => undefined);
          });
      }
      return { drafts: docs.length, changed, skipped, scanning: scanPages.size };
    } finally {
      if (!background) this.running.delete(lock);
    }
  }

  /**
   * Underlines for drafts made from scanned pages: read each page once (marks kept
   * with the page, so a second run does not ask again), then tag each draft as soon
   * as its pages are done — re-fetched, so an edit made meanwhile is not lost.
   */
  private async markScans(jobId: string, pdf: ProsePdf, docs: ExamImportDraftDocument[]): Promise<void> {
    await this.log(jobId, "info", `Đọc lại trang scan để bổ sung gạch chân cho ${docs.length} bản nháp`);
    const read = new Map<number, Mark[]>();
    let changed = 0;
    let unreadInARow = 0;
    for (const doc of [...docs].sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0))) {
      if (!(await this.jobs.exists({ _id: jobId }))) return; // deleted meanwhile
      const marks: Mark[] = [];
      for (let n = doc.pageFrom ?? 1; n <= Math.min(doc.pageTo ?? doc.pageFrom ?? 1, pdf.numPages); n += 1) {
        let page = read.get(n);
        if (!page) {
          const row = await this.pages.findOne({ job: jobId, n }).lean().exec();
          page = (row?.marks ?? []) as Mark[];
          if (page.length === 0) {
            try {
              await pdf.pageText(n);
              page = pdf.pageMarks?.(n) ?? [];
              unreadInARow = 0;
              await this.pages.updateOne({ job: jobId, n }, { $set: { marks: page } }).exec();
              await this.log(jobId, "info", `Trang ${n}: ${page.length} chỗ gạch chân`);
            } catch (err) {
              if (!(err instanceof OcrFailedError)) throw err;
              page = [];
              if (err.refused) {
                await this.log(jobId, "warn", `Trang ${n}: AI từ chối chép trang này`);
                read.set(n, page);
                continue;
              }
              unreadInARow += 1;
              await this.log(jobId, "warn", `Trang ${n}: AI chưa đọc được`);
              if (unreadInARow >= MAX_UNREAD_IN_A_ROW) {
                throw new Error(`AI đọc ảnh không phản hồi ở ${unreadInARow} trang liên tiếp (đến trang ${n}) — kiểm tra dịch vụ AI rồi bấm lại`);
              }
            }
          }
          read.set(n, page);
        }
        marks.push(...page);
      }
      const fresh = await this.drafts.findOne({ _id: doc._id, status: { $in: ["needs_review", "error"] } }).exec();
      if (!fresh || !withMarks(fresh, marks, (fields) => enrich(fields, marks, []))) continue;
      fresh.markModified("parsed");
      await fresh.save();
      changed += 1;
    }
    await this.log(jobId, "info", `Xong gạch chân từ trang scan: ${changed}/${docs.length} bản nháp thay đổi`);
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
    // A 聴解 question prints no words of its own (`1番`, options "1" "2" "3"), the same in every
    // paper: it is told apart by the paper and its place in it, not by its text.
    const listening = isListeningMondai(doc.mondai);
    const where = `${sourceRef.file}|${doc.sitting}|${doc.mondai}`;
    const blockAudio = listening && doc.audio?.assetId ? doc.audio : null;
    const stimuliIn = [...(parsed.stimuli ?? [])];
    // The block's recording plays once above its questions: a listening "passage" that carries it.
    if (blockAudio) stimuliIn.push({ key: BLOCK_TRACK, kind: "listening", body: stripFormat(doc.instruction).trim() || "聴解" });

    // 1. The shared passages, idempotent by content hash.
    const stimIds = new Map<string, string>();
    let stimuliWritten = 0;
    for (const st of stimuliIn) {
      const hash = listening
        ? contentHashOf(st.body, [where, st.key, blockAudio?.assetId ?? ""])
        : contentHashOf(st.body, st.bodyB ? [st.bodyB] : []);
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
          questionCount: parsed.questions.filter((q) => (q.stimulusKey ?? (blockAudio ? BLOCK_TRACK : undefined)) === st.key).length,
          ...(blockAudio ? { audio: blockAudio } : {}),
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
      const hash = listening ? contentHashOf(`${where}|${q.no}|${q.prompt}`, q.options) : contentHashOf(q.prompt, q.options);
      const stimulusKey = q.stimulusKey ?? (blockAudio ? BLOCK_TRACK : undefined);
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
          stimulus: stimulusKey ? stimIds.get(stimulusKey) ?? null : null,
          groupOrder: q.groupOrder,
          ...(q.audio?.assetId ? { audio: q.audio } : {}),
          ...(q.image ? { image: q.image } : {}),
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
    const kinds = ["passage", "cloze", "notice", "pair", "listening"];
    // The editor does not carry the questions' clips: keep each with its question (same prompt — `2番` —, else same place).
    const before = doc.parsed?.questions ?? [];
    const earlier = (prompt: string, i: number) => before.find((q) => q.prompt === prompt) ?? before[i];

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
      const was = earlier(prompt, questions.length);
      if (was?.audio) q.audio = was.audio;
      if (was?.image) q.image = was.image;
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

  /**
   * 聴解 recordings of an open listening draft. `audio` = the block's file (null clears it);
   * `questions[i]` = question i's own clip — its own file, or a stretch of the block's
   * (null clears it; a missing entry is left as it is). `wholePart`: the block's file is the
   * whole listening part — give it to every other open listening block of the paper that has none.
   */
  async setDraftAudio(
    caller: AuthUser,
    draftId: string,
    body: unknown,
  ): Promise<{ draft: Record<string, unknown>; applied: number }> {
    const doc = await this.drafts.findById(draftId).exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    if (!isListeningMondai(doc.mondai)) throw new BadRequestException("Chỉ khối nghe hiểu mới gắn được file nghe");
    if (doc.status !== "needs_review" && doc.status !== "error") {
      throw new BadRequestException("Chỉ sửa được khối chưa xuất bản / chưa loại");
    }
    const b = (body ?? {}) as { audio?: unknown; questions?: unknown; wholePart?: unknown };
    const ids = new Set<string>();
    const clip = (v: unknown, at: string): DraftAudio | null => {
      if (v === null) return null;
      const o = (v ?? {}) as Record<string, unknown>;
      const assetId = typeof o.assetId === "string" ? o.assetId : "";
      if (!/^[a-f0-9]{24}$/i.test(assetId)) throw new BadRequestException(`${at}: thiếu file nghe`);
      const out: DraftAudio = { assetId };
      for (const k of ["startSec", "endSec"] as const) {
        if (o[k] === undefined || o[k] === null || o[k] === "") continue;
        const t = Number(o[k]);
        if (!Number.isFinite(t) || t < 0 || t > 6 * 3600) throw new BadRequestException(`${at}: thời điểm không hợp lệ`);
        out[k] = Math.round(t * 10) / 10;
      }
      if (out.startSec !== undefined && out.endSec !== undefined && out.endSec <= out.startSec) {
        throw new BadRequestException(`${at}: thời điểm kết thúc phải sau thời điểm bắt đầu`);
      }
      ids.add(assetId);
      return out;
    };

    const block = b.audio === undefined ? undefined : clip(b.audio, "File của khối");
    const questions = doc.parsed?.questions ?? [];
    const perQuestion = Array.isArray(b.questions) ? b.questions.slice(0, questions.length).map((v, i) => (v === undefined ? undefined : clip(v, `Câu ${questions[i].prompt}`))) : [];
    if (ids.size > 0) {
      const found = await this.audioAssets.countDocuments({ _id: { $in: [...ids] } }).exec();
      if (found !== ids.size) throw new BadRequestException("Không tìm thấy file nghe — tải lên lại");
    }

    if (block !== undefined) doc.audio = block;
    perQuestion.forEach((a, i) => {
      if (a === undefined) return;
      if (a) questions[i].audio = a;
      else delete questions[i].audio;
    });
    if (perQuestion.length > 0) doc.markModified("parsed");
    await doc.save();

    let applied = 0;
    if (b.wholePart === true && block) {
      const r = await this.drafts
        .updateMany(
          {
            _id: { $ne: doc._id },
            jobId: doc.jobId,
            sitting: doc.sitting,
            section: "listening",
            status: { $in: ["needs_review", "error"] },
            $or: [{ audio: null }, { audio: { $exists: false } }],
          },
          { $set: { audio: { assetId: block.assetId } } },
        )
        .exec();
      applied = r.modifiedCount;
    }
    return { draft: doc.toObject() as unknown as Record<string, unknown>, applied };
  }

  /**
   * Cut the pictures of a listening draft's questions out of its pages. Only a PDF with a text
   * layer has them as separate images (each under its `N番`); a scan finds none. A question
   * that already has a picture keeps it. How many got one.
   */
  private async addPictures(doc: ExamImportDraftDocument, jobId: string): Promise<number> {
    const questions = doc.parsed?.questions ?? [];
    if (!isListeningMondai(doc.mondai) || questions.length === 0 || doc.pageFrom == null) return 0;
    const path = join(this.dir, `${jobId}.pdf`);
    const size = (await stat(path).catch(() => null))?.size ?? 0;
    if (size === 0 || size > MAX_PICTURE_PDF_BYTES) return 0;
    const pageTo = Math.max(doc.pageFrom, doc.pageTo ?? doc.pageFrom);
    const pages = Array.from({ length: pageTo - doc.pageFrom + 1 }, (_, i) => doc.pageFrom! + i);
    const crops = picturesOfBlock(await readLayouts(await readFile(path), pages), {
      pageFrom: doc.pageFrom,
      pageTo,
      mondaiNo: mondaiNumberOf(doc.instruction),
    });
    let found = 0;
    for (const q of questions) {
      const c = q.printedNo != null ? crops.get(q.printedNo) : undefined;
      if (!c || q.image) continue;
      q.image = await this.images.save(await this.images.crop(await this.pageImage(jobId, c.page), c.rect));
      found += 1;
    }
    if (found > 0) {
      doc.markModified("parsed");
      settlePictureIssues(doc);
    }
    return found;
  }

  /** An open listening draft, for its pictures. */
  private async openListeningDraft(draftId: string): Promise<ExamImportDraftDocument> {
    const doc = await this.drafts.findById(draftId).exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    if (!isListeningMondai(doc.mondai)) throw new BadRequestException("Chỉ khối nghe hiểu mới gắn hình");
    if (doc.status !== "needs_review" && doc.status !== "error") {
      throw new BadRequestException("Chỉ sửa được khối chưa xuất bản / chưa loại");
    }
    return doc;
  }

  /** Cut an open listening draft's pictures from its PDF again (questions with one keep it). */
  async autoPictures(caller: AuthUser, draftId: string): Promise<{ found: number; draft: Record<string, unknown> }> {
    const doc = await this.openListeningDraft(draftId);
    if (!(await stat(join(this.dir, `${doc.jobId}.pdf`)).catch(() => null))) {
      throw new NotFoundException("Không còn file PDF của lần nhập này — nhập lại PDF, hoặc cắt hình bằng tay");
    }
    const found = await this.addPictures(doc, doc.jobId);
    await doc.save();
    return { found, draft: doc.toObject() as unknown as Record<string, unknown> };
  }

  /**
   * One question's picture: `{question, page, rect}` cuts the region `rect` (fractions of the
   * page, 0–1) out of that page of the PDF; `{question, clear: true}` removes it.
   */
  async setPicture(caller: AuthUser, draftId: string, body: unknown): Promise<{ draft: Record<string, unknown> }> {
    const doc = await this.openListeningDraft(draftId);
    const b = (body ?? {}) as { question?: unknown; page?: unknown; rect?: unknown; clear?: unknown };
    const q = doc.parsed?.questions[Number(b.question)];
    if (!Number.isInteger(Number(b.question)) || !q) throw new BadRequestException("Không có câu này trong khối");
    if (b.clear === true) {
      delete q.image;
    } else {
      const r = (b.rect ?? {}) as Record<string, unknown>;
      const rect = { x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) };
      q.image = await this.images.save(await this.images.crop(await this.pageImage(doc.jobId, Number(b.page)), rect));
    }
    doc.markModified("parsed");
    settlePictureIssues(doc);
    await doc.save();
    return { draft: doc.toObject() as unknown as Record<string, unknown> };
  }

  /**
   * The AI solves an open draft's questions, for the reviewer to check (nothing is stored).
   * `suggestions[no - 1]` per question, `answer` 0 where the AI gave none.
   */
  async suggestAnswers(caller: AuthUser, draftId: string): Promise<{ suggestions: AnswerSuggestion[] }> {
    const doc = await this.drafts.findById(draftId).select("status level mondai instruction parsed blockIndex").lean().exec();
    if (!doc) throw new NotFoundException("Import draft not found");
    if (doc.status !== "needs_review" && doc.status !== "error") {
      throw new BadRequestException("Chỉ gợi ý được cho khối chưa xuất bản / chưa loại");
    }
    const questions = doc.parsed?.questions ?? [];
    if (questions.length === 0) throw new BadRequestException("Khối chưa có câu hỏi — chỉnh sửa khối trước đã");
    const prompt = suggestPrompt({
      level: doc.level,
      mondai: doc.mondai,
      instruction: doc.instruction ?? "",
      stimuli: doc.parsed?.stimuli ?? [],
      questions,
    });
    const r = await this.ai.completeAny(
      prompt,
      { temperature: 0, purpose: "exam-import", task: "grammar", words: [`Gợi ý đáp án khối ${(doc.blockIndex ?? 0) + 1}`] },
      (text) => readSuggestions(text, questions),
    );
    if (!r.answered) {
      throw new ServiceUnavailableException(`Chưa có dịch vụ AI nào trả lời${r.error ? ` (${r.error.slice(0, 160)})` : ""} — thử lại sau`);
    }
    const suggestions = r.value ?? [];
    if (!suggestions.some((s) => s.answer > 0)) throw new UnprocessableEntityException("AI không đưa ra được đáp án nào cho khối này");
    return { suggestions };
  }

  /** The job's drafts as the answer file sees them (blocks, 問題 numbers, printed question numbers). */
  private async answerFileDrafts(jobId: string) {
    type Row = { _id: unknown; blockIndex: number; sitting: string; instruction?: string; status: string; answers?: number[]; parsed?: { questions: { no: number; printedNo?: number; options?: string[] }[] } };
    const rows = (await this.drafts
      .find({ jobId })
      .select("blockIndex sitting instruction status answers parsed.questions.no parsed.questions.printedNo parsed.questions.options")
      .lean()
      .exec()) as unknown as Row[];
    if (rows.length === 0) throw new NotFoundException("Lần nhập này chưa có bản nháp nào");
    const printed = fillPrintedNos(rows);
    const drafts: AnswerFileDraft[] = rows.map((r) => {
      const id = String(r._id);
      const nos = printed.get(id) ?? [];
      return {
        id,
        blockIndex: r.blockIndex,
        sitting: r.sitting,
        heading: headingOf(r.instruction ?? ""),
        open: r.status === "needs_review" || r.status === "error",
        questions: (r.parsed?.questions ?? []).map((q, i) => ({ no: q.no, printedNo: nos[i] ?? q.no, options: q.options?.length ?? 4 })),
      };
    });
    return { rows, drafts };
  }

  /** The answer-file template (CSV): one row per question of the job, with the answers stored so far. */
  async answerFileTemplate(jobId: string): Promise<{ fileName: string; csv: string }> {
    const { rows, drafts } = await this.answerFileDrafts(jobId);
    const stored = new Map(rows.map((r) => [String(r._id), r.answers ?? []]));
    const job = await this.jobs.findById(jobId).select("fileName").lean().exec().catch(() => null);
    const base = String(job?.fileName ?? "de-thi").replace(/\.pdf$/i, "").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80);
    return { fileName: `dap-an_${base}.csv`, csv: answerTemplate(drafts, (id) => stored.get(id) ?? []) };
  }

  /**
   * Read an answer file (the template, or `[2010-07]` + `問題1: 3 1 4 2`) onto the job's open
   * drafts. Without `save` it only matches (the desk previews against the reviewer's own picks);
   * `save: true` stores the answers — one already set is replaced only with `overwrite`.
   */
  async importAnswerFile(
    caller: AuthUser,
    jobId: string,
    body: { text?: unknown; save?: unknown; overwrite?: unknown },
  ): Promise<{ matched: number; problems: string[]; given: { draftId: string; answers: number[] }[]; saved: number }> {
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) throw new BadRequestException("File đáp án trống");
    if (text.length > 300_000) throw new BadRequestException("File đáp án quá lớn (tối đa ~300 KB)");
    const { rows, drafts } = await this.answerFileDrafts(jobId);
    const read = parseAnswerFile(text);
    const m = matchAnswerFile(read.rows, drafts);
    let saved = 0;
    if (body.save === true) {
      const stored = new Map(rows.map((r) => [String(r._id), r.answers ?? []]));
      for (const [id, given] of m.given) {
        const current = stored.get(id) ?? [];
        const next = mergeAnswers(current, given, body.overwrite === true);
        if (next.length === current.length && next.every((a, i) => a === current[i])) continue;
        await this.drafts.updateOne({ _id: id, status: { $in: ["needs_review", "error"] } }, { $set: { answers: next } }).exec();
        saved += 1;
      }
    }
    return {
      matched: m.matched,
      problems: [...read.problems, ...m.problems].slice(0, 100),
      given: [...m.given].map(([draftId, answers]) => ({ draftId, answers })),
      saved,
    };
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
