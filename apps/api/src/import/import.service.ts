import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readingFitsKanji } from "./kanji-reading.js";
import { ensureKanjiTables } from "./kanji-table.js";
import { checkHanViet, checkMeaning, correctHanViet, correctHanVietPartial, hanVietFits, harmonizeHanViet, norm as hvNorm, setKanjiHanViet, suggestHanViet } from "./han-viet-suggest.js";
import type { KanjiDocument } from "../content/schemas/kanji.schema.js";
import { AiExampleService, lostKanji } from "../ai/ai-example.service.js";
import {
  Optional,
  Injectable,
  UnprocessableEntityException,
  ConflictException,
  NotFoundException,
  HttpStatus,
  HttpException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types, type Document } from "mongoose";
import type { FlashcardDeckDocument } from "../flashcards/schemas/deck.schema.js";
import type { FlashcardDocument } from "../flashcards/schemas/card.schema.js";
import { cardDedupeKey } from "../flashcards/dedupe.js";
import { KANJI_RE, ReadingService, readingVariants } from "../flashcards/reading.service.js";
import type { CardExample } from "../flashcards/schemas/card.schema.js";
import { CONTENT_ADMIN } from "../common/roles.js";
import type { AuthUser } from "../auth/auth.types.js";
import {
  EmptyTableError,
  UnsupportedFormatError,
  type Table,
} from "./parsers/types.js";
import { parseCsv } from "./parsers/csv.js";
import { parseXlsx } from "./parsers/xlsx.js";
import { ExampleSuggestService } from "../flashcards/example-suggest.service.js";
import { renderTableImage } from "./parsers/table-image.js";
import { type PageStore, rowNumberIssues, ocrWithRetry, parsePdf, renderPdfPage, tableFromOcrPages } from "./parsers/pdf.js";
import type { PdfJobPageDocument, PdfJobRecordDocument } from "./schemas/pdf-job.schema.js";
import type { OcrRow } from "./parsers/types.js";

/** What the multipart upload hands the service (multer, in-memory). */
/** A preview / confirm run that reports progress and can be cancelled. */
interface ImportTask {
  id: string;
  owner: string;
  fileName: string;
  deckId: string;
  status: "running" | "done" | "error";
  error?: string;
  phase: string;
  done: number;
  total: number;
  cancelled: boolean;
  finishedAt?: number;
}

/** What the floating tracker shows of a run that is checking an import file. */
export type ImportTaskView = Pick<ImportTask, "id" | "fileName" | "deckId" | "status" | "error" | "phase" | "done" | "total">;

export interface UploadedImportFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Column → card-field mapping chosen in the UI wizard (P3-IMPORT-02).
 * `front`/`back` are required; `tags` is a single column whose value is
 * split on `;` or `,` into the card's tag array.
 */
export interface ColumnMapping {
  front: string;
  back: string;
  tags?: string;
  /** Hiragana reading. Empty/unmapped → generated for kanji words. */
  reading?: string;
  /** verb / noun / adjective (also động từ / danh từ / tính từ, 動詞…). */
  partOfSpeech?: string;
  /** Example sentence(s); several in one cell are separated by a new line or `|`. */
  example?: string;
  /** Translation(s) of the example(s), in the same order. */
  exampleTranslation?: string;
  /** Âm Hán Việt (e.g. DUY TRÌ). */
  hanViet?: string;
  /** Row number in the source (the STT column) — keeps the file's order. */
  order?: string;
}

type Pos = "verb" | "noun" | "adjective" | "phrase" | "";

/** Accepts English, Vietnamese, Japanese and short forms. */
function normalizePos(raw: string | undefined): Pos | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^(verb|v|động từ|dong tu|động|動詞)$/.test(v)) return "verb";
  if (/^(noun|n|danh từ|danh tu|danh|名詞)$/.test(v)) return "noun";
  if (/^(adjective|adj|a|tính từ|tinh tu|tính|形容詞|形容動詞)$/.test(v)) return "adjective";
  if (/^(phrase|expr|expression|idiom|cụm từ|cum tu|cụm|thành ngữ|慣用句|連語|句)$/.test(v)) return "phrase";
  return null;
}

/** "a\nb" / "a|b" → ["a","b"]. */
function splitMulti(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/\r?\n|\||｜/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Per-row outcome in the preview (never written to the DB — P3-IMPORT-02). */
export interface PreviewRow {
  /** 1-based row number in the file (row 1 = header, so data starts at 2). */
  rowNumber: number;
  front: string;
  back: string;
  tags: string[];
  /** `ok` | `error` (bad row) | `duplicate` (already in the deck). */
  status: "ok" | "error" | "duplicate";
  /** Derived/mapped extras shown in the preview. */
  reading?: string;
  partOfSpeech?: string;
  examples?: number;
  /** The source's own number (STT column), shown first in the preview. */
  no?: number;
  hanViet?: string;
  /** The meaning cell was blank: `back` is an AI suggestion (or empty when none could be made). */
  blankBack?: boolean;
  suggestedBack?: boolean;
  /** Cells that look wrong (meaning / reading / Hán Việt) — to be reviewed by a person. */
  issues?: string[];
  /** Why the row is unusable, when `status === "error"`. */
  error?: string;
}

/** A skipped row, shown side by side with the card it duplicates. */
export interface DuplicateInfo {
  rowNumber: number;
  /** The row's own STT / number in the file. */
  no?: number;
  front: string;
  reading: string;
  back: string;
  /** What it duplicates: a card already in the deck, or an earlier row of the file. */
  of: {
    source: "deck" | "file";
    front: string;
    reading: string;
    back: string;
    /** For `file`: the earlier row's STT / row number. */
    no?: number;
    rowNumber?: number;
  };
}

/** Cap on the duplicates listed back (the count stays exact). */
const MAX_DUPLICATES_LISTED = 1000;

export interface ImportPreview {
  deckId: string;
  format: Table["format"];
  /** The file's header columns — what the mapping step can choose from. */
  columns: string[];
  totalRows: number;
  okRows: number;
  errorRows: number;
  duplicateRows: number;
  /** The duplicate rows with the card each one matches (capped). */
  duplicates: DuplicateInfo[];
  rows: PreviewRow[];
}

export type DuplicatePolicy = "skip" | "overwrite";

export interface ImportConfirmResult {
  deckId: string;
  /** Newly created cards. */
  imported: number;
  /** Existing cards left untouched (policy = skip) or the collision absorbed. */
  skipped: number;
  /** Existing cards updated (policy = overwrite). */
  overwritten: number;
  /** Rows rejected with a per-row reason (bad mapping values, etc.). */
  errors: { rowNumber: number; no?: number; front: string; back: string; error: string }[];
  /** Cards imported with a blank meaning — the learner fills them in (STT list). */
  needsReview?: { rowNumber: number; no?: number; front: string; issues: string[] }[];
  needsMeaning?: { rowNumber: number; no?: number; front: string; suggested: boolean }[];
  /** New cards without an example: one is generated in the background. */
  examplesQueued: number;
  /** PDF imports: cards left without an example for now (generate later). */
  examplesDeferred?: number;
  /** The skipped duplicates with the card each one matches (capped). */
  duplicates: DuplicateInfo[];
}

/**
 * Bulk flashcard import (P3-IMPORT-01..04): CSV/XLSX → parse → map →
 * preview → confirm.
 *
 * Two-stage, **stateless between requests**: `preview()` parses and reports
 * without writing anything (P3-IMPORT-02); `confirm()` re-parses the same
 * file and writes it. Idempotency (P3-IMPORT-04, T-P3-03) comes from the
 * `(deck, dedupeKey)` unique index — re-sending the same request upserts the
 * same keys and can never create a second copy. No batch token / in-memory
 * state to lose.
 *
 * PDF import is out of P3 (P3-IMPORT-05, deferred per Q-12 / user decision
 * 03/11 — "Bỏ PDF ở P3").
 */
const JOB_TTL_MS = 6 * 3600_000;
/** How long a finished check stays listed in the tracker. */
const TASK_KEEP_MS = 10 * 60_000;

interface PdfJob {
  id: string;
  userId: string;
  deckId: string;
  fileName: string;
  status: "running" | "done" | "error";
  done: number;
  total: number;
  rows?: number;
  error?: string;
  createdAt: number;
  finishedAt?: number;
  /** Set when the user cancelled the read: the worker stops at its next page. */
  cancelled?: boolean;
  /** Bytes of the PDF, loaded from `filePath` on demand. */
  file?: UploadedImportFile;
  /** Table files read from a PDF: each block is one PDF page. */
  byPage?: boolean;
  /** `table`: a CSV/XLSX/text PDF whose rows are shown in blocks. */
  kind: "pdf" | "table";
  /** Pages being read again in the background; absent when idle. */
  retry?: { total: number; done: number; queue: number[] };
  /** Where the PDF is kept on disk (survives an API restart). */
  filePath: string;
  /** Content hash = key of the parsed table in the PDF cache. */
  key: string;
  /** OCR'd PDFs: rows per page, for the page-by-page review. */
  pages?: { n: number; rows: number; ok: boolean; lostKanji: number; numIssues: number }[];
  /** Rows the last confirmed import rejected (kept so the page check can list them). */
  importErrors?: { rowNumber: number; no?: number; front: string; back: string; error: string }[];
}

/** What the browser sees of a job (never the file bytes). */
export type PdfJobView = Omit<PdfJob, "file" | "filePath" | "userId" | "key">;

function viewOf(j: PdfJob): PdfJobView {
  const { file: _file, filePath: _filePath, userId: _userId, key: _key, ...view } = j;
  void _file;
  void _filePath;
  void _userId;
  void _key;
  return view;
}

function pagesOf(table: Table): PdfJob["pages"] {
  const issues = table.ocr ? rowNumberIssues(table.ocr.pages) : [];
  return table.ocr?.pages.map((p, i) => ({
    numIssues: issues[i]?.filter(Boolean).length ?? 0,
    n: i + 1,
    rows: p?.length ?? 0,
    ok: p !== null,
    // entries that look like they lost their kanji (reading copied into the word)
    lostKanji: p?.filter(lostKanji).length ?? 0,
  }));
}

@Injectable()
export class ImportService implements OnApplicationBootstrap {
  /** Hard cap on data rows per import file (the row-count twin of T-P3-11). */
  static readonly MAX_ROWS = 10000;

  constructor(
    @InjectModel("Flashcard")
    private readonly card: Model<FlashcardDocument>,
    @InjectModel("FlashcardDeck")
    private readonly deck: Model<FlashcardDeckDocument>,
    @InjectModel("PdfJobRecord")
    private readonly jobRecord: Model<PdfJobRecordDocument>,
    @InjectModel("PdfJobPage")
    private readonly jobPage: Model<PdfJobPageDocument>,
    @InjectModel("Kanji")
    private readonly kanji: Model<KanjiDocument>,
    private readonly morph: ReadingService,
    private readonly exampleSuggest: ExampleSuggestService,
    @Optional() private readonly ai?: AiExampleService,
  ) {}

  /** Parse a PDF (OCR when needed), remembering the table by content hash. */
  private async parsePdfCached(
    buffer: Buffer,
    onProgress?: (done: number, total: number) => void,
    store?: PageStore,
  ): Promise<Table> {
    const key = createHash("sha256").update(buffer).digest("hex");
    const hit = this.pdfCache.get(key);
    if (hit) return hit;
    const table = await parsePdf(buffer, this.ai ? (png, n) => this.ai!.ocrVocabPage(png, n) : undefined, onProgress, store);
    // Preview runs this twice (columns, then rows): don't pay for OCR twice.
    this.pdfCache.set(key, table);
    if (this.pdfCache.size > 12) this.pdfCache.delete(this.pdfCache.keys().next().value!);
    return table;
  }

  // ── Background PDF reading jobs ─────────────────────────────────────
  // Reading a scanned book through OCR takes minutes, so it runs as a job the
  // browser can leave and come back to. The job, its PDF (on disk) and every
  // page read are persisted, so an API restart resumes where it stopped.
  private readonly jobs = new Map<string, PdfJob>();
  private readonly jobDir = process.env.IMPORT_JOB_DIR?.trim() || join(tmpdir(), "nihongo-import-jobs");

  private jobOf(r: {
    _id: unknown;
    user: string;
    deck: string;
    fileName: string;
    key: string;
    filePath: string;
    status: string;
    done: number;
    total: number;
    rows?: number;
    error?: string;
    pages?: unknown;
    pageMap?: number[];
    retry?: unknown;
    importErrors?: unknown;
    kind?: string;
    createdAt?: Date;
    finishedAt?: Date;
  }): PdfJob {
    return {
      id: String(r._id),
      userId: r.user,
      deckId: r.deck,
      fileName: r.fileName,
      key: r.key,
      filePath: r.filePath,
      status: r.status as PdfJob["status"],
      done: r.done,
      total: r.total,
      rows: r.rows,
      error: r.error,
      pages: r.pages as PdfJob["pages"],
      retry: r.retry as PdfJob["retry"],
      importErrors: r.importErrors as PdfJob["importErrors"],
      kind: r.kind === "table" ? "table" : "pdf",
      byPage: !!r.pageMap?.length,
      createdAt: r.createdAt?.getTime() ?? Date.now(),
      finishedAt: r.finishedAt?.getTime(),
    };
  }

  /** A job from memory (live progress) or, after a restart, from the database. */
  private async loadJob(caller: AuthUser, id: string, readOnly = false): Promise<PdfJob> {
    const gone = () => new NotFoundException("Không tìm thấy tác vụ đọc PDF (có thể đã hết hạn)");
    const live = this.jobs.get(id);
    if (live) {
      if (live.userId !== caller.sub && !(readOnly && (await this.canReadDeck(caller, live.deckId)))) throw gone();
      return live;
    }
    const rec = Types.ObjectId.isValid(id) ? await this.jobRecord.findById(id).lean().exec() : null;
    if (!rec || (rec.user !== caller.sub && !(readOnly && (await this.canReadDeck(caller, rec.deck))))) throw gone();
    const job = this.jobOf(rec);
    if (job.status === "running") this.jobs.set(job.id, job); // being resumed by bootstrap
    return job;
  }

  /**
   * Any file other than a scanned PDF gets a check too: its rows, in blocks
   * of 30, with the same number / meaning flags, saved with the deck.
   */
  private async saveTableReview(
    deckId: string,
    userId: string,
    fileName: string,
    table: Table,
    mapping: ColumnMapping,
    file: UploadedImportFile,
    draft = false,
  ): Promise<void> {
    const cell = (row: Record<string, string>, col?: string) => (col ? (row[col] ?? "").trim() : "");
    const rows: OcrRow[] = table.rows.map((r) => ({
      no: cell(r, mapping.order).replace(/\.$/, ""),
      word: cell(r, mapping.front),
      reading: cell(r, mapping.reading),
      hanViet: cell(r, mapping.hanViet),
      meaning: cell(r, mapping.back),
    }));
    const BLOCK = 30;
    const blocks: OcrRow[][] = [];
    const rawBlocks: Record<string, string>[][] = [];
    // A PDF with a text layer: one block per PDF page, so the page itself can be shown.
    const isPdf = file.buffer.subarray(0, 5).toString("latin1") === "%PDF-" && table.columns.includes("Trang");
    const pageMap: number[] = [];
    if (isPdf) {
      for (const [i, r] of table.rows.entries()) {
        const pg = Number(r["Trang"]) || 1;
        if (pageMap[pageMap.length - 1] !== pg) {
          pageMap.push(pg);
          blocks.push([]);
          rawBlocks.push([]);
        }
        blocks[blocks.length - 1].push(rows[i]);
        rawBlocks[rawBlocks.length - 1].push(r);
      }
    } else {
      for (let i = 0; i < rows.length; i += BLOCK) {
        blocks.push(rows.slice(i, i + BLOCK));
        rawBlocks.push(table.rows.slice(i, i + BLOCK));
      }
    }
    if (blocks.length === 0) return;
    const issues = rowNumberIssues(blocks);
    const pages = blocks.map((b, i) => ({
      n: i + 1,
      rows: b.length,
      ok: true,
      lostKanji: b.filter(lostKanji).length,
      // without a number column there is nothing to compare
      numIssues: mapping.order ? (issues[i]?.filter(Boolean).length ?? 0) : 0,
    }));
    // A draft only replaces the author's earlier draft; a confirmed review replaces everything of the deck.
    const olds = await this.jobRecord.find(draft ? { deck: deckId, user: userId, draft: true } : { deck: deckId }).lean().exec();
    for (const old of olds) await this.dropJob(String(old._id), old.filePath);
    let filePath = "";
    if (isPdf) {
      await mkdir(this.jobDir, { recursive: true });
      filePath = join(this.jobDir, `${createHash("sha256").update(file.buffer).digest("hex")}-${Date.now()}.pdf`);
      await writeFile(filePath, file.buffer);
    }
    const rec = await this.jobRecord.create({
      pageMap: isPdf ? pageMap : undefined,
      draft,
      user: userId,
      deck: deckId,
      fileName,
      key: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
      filePath,
      kind: "table",
      columns: table.columns,
      status: "done",
      done: blocks.length,
      total: blocks.length,
      rows: rows.length,
      pages,
      finishedAt: new Date(),
    });
    await this.jobPage.insertMany(blocks.map((b, i) => ({ job: String(rec._id), n: i + 1, rows: b, raw: rawBlocks[i] })));
  }

  /** Anyone who can open a deck may compare it with the PDF it was read from. */
  private async canReadDeck(caller: AuthUser, deckId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(deckId)) return false;
    const d = await this.deck.findById(deckId).select("shared user").lean().exec();
    return !!d && (d.shared || String(d.user) === caller.sub);
  }

  /** The page check saved with a deck (the latest finished read of its PDF). */
  async deckReview(caller: AuthUser, deckId: string): Promise<(PdfJobView & { mine: boolean }) | null> {
    if (!(await this.canReadDeck(caller, deckId))) return null;
    const rec = await this.jobRecord.findOne({ deck: deckId, status: "done", draft: { $ne: true } }).sort({ createdAt: -1 }).lean().exec();
    if (!rec) return null;
    const job = await this.withNumberIssues(this.jobs.get(String(rec._id)) ?? this.jobOf(rec));
    return { ...viewOf(job), mine: job.userId === caller.sub };
  }

  private async fileOf(job: PdfJob): Promise<UploadedImportFile> {
    if (job.file) return job.file;
    try {
      job.file = { buffer: await readFile(job.filePath), originalname: job.fileName } as UploadedImportFile;
    } catch {
      throw new NotFoundException("File của tác vụ này đã hết hạn");
    }
    return job.file;
  }

  /** The pages already read (a `null` page is retried, so it is not stored). */
  private async savedPages(jobId: string): Promise<Map<number, OcrRow[]>> {
    const pages = await this.jobPage.find({ job: jobId }).lean().exec();
    return new Map(pages.filter((p) => Array.isArray(p.rows)).map((p) => [p.n, p.rows as OcrRow[]]));
  }

  /** Start (or reuse a finished) PDF read; returns at once. */
  async startPdfJob(caller: AuthUser, file: UploadedImportFile, deckId: string): Promise<PdfJobView> {
    await this.resolveWritableDeck(caller, deckId);
    const now = Date.now();
    const mine = await this.jobRecord.find({ user: caller.sub }).sort({ createdAt: 1 }).lean().exec();
    if (mine.some((j) => j.status === "running")) {
      throw new ConflictException("Một PDF đang được đọc — đợi nó xong rồi hãy nhập file khác");
    }
    // A deck keeps its page check (read pages + PDF) for as long as it exists:
    // only a newer read of the same deck, or a deleted deck, drops a job.
    const alive = new Set(
      (await this.deck.find({ _id: { $in: mine.map((j) => j.deck).filter((d) => Types.ObjectId.isValid(d)) } }).select("_id").lean().exec()).map((d) => String(d._id)),
    );
    for (const j of mine.filter((j) => j.deck === deckId || !alive.has(j.deck))) {
      await this.dropJob(String(j._id), j.filePath);
    }

    const key = createHash("sha256").update(file.buffer).digest("hex");
    await mkdir(this.jobDir, { recursive: true });
    const filePath = join(this.jobDir, `${key}-${now}.pdf`);
    await writeFile(filePath, file.buffer);
    const rec = await this.jobRecord.create({
      user: caller.sub,
      deck: deckId,
      fileName: file.originalname,
      key,
      filePath,
      status: "running",
      kind: "pdf",
    });
    const job = this.jobOf(rec.toObject());
    job.file = file;
    this.jobs.set(job.id, job);
    void this.runPdfJob(job);
    return viewOf(job);
  }

  /** The user gave up on a PDF read: stop it and forget the job + its file. */
  async cancelPdfJob(caller: AuthUser, id: string): Promise<void> {
    const job = await this.loadJob(caller, id);
    job.cancelled = true;
    await this.dropJob(job.id, job.filePath);
  }

  private async dropJob(id: string, filePath: string): Promise<void> {
    this.jobs.delete(id);
    await this.jobPage.deleteMany({ job: id }).exec();
    await this.jobRecord.deleteOne({ _id: id }).exec();
    await rm(filePath, { force: true }).catch(() => undefined);
  }

  /** Read the job's PDF, skipping pages already read, saving each page as it finishes. */
  private async runPdfJob(job: PdfJob): Promise<void> {
    try {
      const file = await this.fileOf(job);
      const saved = await this.savedPages(job.id);
      const hit = this.pdfCache.get(job.key);
      const table =
        hit ??
        (await this.parsePdfCached(
          file.buffer,
          (done, total) => {
            if (job.cancelled) throw new Error("cancelled"); // stops the page workers
            job.done = done;
            job.total = total;
            void this.jobRecord.updateOne({ _id: job.id }, { $set: { done, total } }).exec().catch(() => undefined);
          },
          {
            saved,
            save: async (n, rows) => {
              if (!rows || job.cancelled) return; // a failed page is read again on resume
              await this.jobPage.updateOne({ job: job.id, n }, { $set: { rows } }, { upsert: true }).exec();
            },
          },
        ));
      job.status = "done";
      job.rows = table.rows.length;
      job.pages = pagesOf(table);
      job.finishedAt = Date.now();
      job.file = undefined;
      this.jobs.delete(job.id); // from here the database is the source of truth
      await this.jobRecord
        .updateOne(
          { _id: job.id },
          { $set: { status: "done", rows: job.rows, pages: job.pages, finishedAt: new Date(job.finishedAt) } },
        )
        .exec();
    } catch (error: unknown) {
      if (job.cancelled) return; // dropped by cancelPdfJob — nothing to record
      job.status = "error";
      job.error =
        error instanceof UnsupportedFormatError || error instanceof EmptyTableError
          ? error.detail
          : "Không đọc được file PDF";
      job.finishedAt = Date.now();
      job.file = undefined;
      this.jobs.delete(job.id);
      await this.jobRecord
        .updateOne({ _id: job.id }, { $set: { status: "error", error: job.error, finishedAt: new Date(job.finishedAt) } })
        .exec()
        .catch(() => undefined);
    }
  }

  /** After a restart, pick up the jobs that were still being read. */
  private async resumePdfJobs(): Promise<void> {
    const running = await this.jobRecord.find({ status: "running" }).lean().exec();
    for (const rec of running) {
      const job = this.jobOf(rec);
      this.jobs.set(job.id, job);
      void this.runPdfJob(job);
    }
    const retrying = await this.jobRecord.find({ status: "done", "retry.queue.0": { $exists: true } }).lean().exec();
    for (const rec of retrying) {
      const job = this.jobOf(rec);
      this.jobs.set(job.id, job);
      void this.runRetry(job);
    }
  }

  /** Jobs saved before the numbering check existed: fill it in once. */
  private async withNumberIssues(job: PdfJob): Promise<PdfJob> {
    if (job.status !== "done" || !job.pages?.length || job.pages[0].numIssues !== undefined) return job;
    const table = await this.ocrTableOf(job);
    if (table?.ocr) {
      job.pages = pagesOf(table);
      await this.jobRecord.updateOne({ _id: job.id }, { $set: { pages: job.pages } }).exec().catch(() => undefined);
    }
    return job;
  }

  async listPdfJobs(caller: AuthUser): Promise<PdfJobView[]> {
    const recs = await this.jobRecord.find({ user: caller.sub }).sort({ createdAt: -1 }).limit(50).lean().exec();
    const jobs = await Promise.all(recs.map((r) => this.withNumberIssues(this.jobs.get(String(r._id)) ?? this.jobOf(r))));
    return jobs.map(viewOf);
  }

  async getPdfJob(caller: AuthUser, id: string): Promise<PdfJobView> {
    return viewOf(await this.withNumberIssues(await this.loadJob(caller, id)));
  }

  /** The uploaded file of a finished job, so preview/confirm can run without re-uploading. */
  async pdfJobFile(caller: AuthUser, id: string): Promise<UploadedImportFile> {
    const job = await this.loadJob(caller, id);
    if (job.status !== "done") {
      throw new ConflictException("PDF này chưa đọc xong hoặc đã hết hạn — hãy chọn lại file");
    }
    try {
      return await this.fileOf(job);
    } catch {
      throw new ConflictException("PDF này chưa đọc xong hoặc đã hết hạn — hãy chọn lại file");
    }
  }

  /** Remember the rows a confirmed import rejected, for the deck's page check. */
  /**
   * Keep the rows that failed to import with the deck's saved review. Best
   * effort: the import has already been written, so this must never fail it.
   */
  async saveImportErrors(deckId: string, errors: NonNullable<PdfJob["importErrors"]>): Promise<void> {
    try {
      await this.jobRecord
        .findOneAndUpdate({ deck: deckId, draft: { $ne: true } }, { $set: { importErrors: errors } }, { sort: { createdAt: -1 } })
        .exec();
    } catch {
      /* ignore */
    }
  }

  /** One page of the job's PDF as a PNG, so it can be compared with what was read. */
  async pdfJobPageImage(caller: AuthUser, id: string, n: number): Promise<Buffer> {
    const job = await this.loadJob(caller, id, true);
    if (job.kind === "table") return this.tableImage(job, n);
    const file = await this.fileOf(job);
    try {
      return await renderPdfPage(file.buffer, n);
    } catch (error) {
      if (error instanceof UnsupportedFormatError) throw new NotFoundException(error.detail);
      throw error;
    }
  }

  /** Picture to compare a block with: the PDF page itself, or the block's rows drawn as a grid. */
  private async tableImage(job: PdfJob, n: number): Promise<Buffer> {
    const meta = await this.jobRecord.findById(job.id).select("columns pageMap filePath").lean().exec();
    if (meta?.filePath && meta.pageMap?.[n - 1]) {
      try {
        return await renderPdfPage(await readFile(meta.filePath), meta.pageMap[n - 1]);
      } catch {
        /* fall through to the grid */
      }
    }
    const rec = await this.jobPage.findOne({ job: job.id, n }).select("raw").lean().exec();
    if (!rec) throw new NotFoundException("Nhóm dòng này không có dữ liệu");
    return renderTableImage(
      `${job.fileName} — nhóm ${n}`,
      meta?.columns ?? [],
      (rec.raw as Record<string, string>[] | undefined) ?? [],
    );
  }

  /** The OCR'd table of a job: from the cache, else rebuilt from the saved pages. */
  private async ocrTableOf(job: PdfJob): Promise<Table | undefined> {
    const hit = this.pdfCache.get(job.key);
    if (hit) return hit;
    const saved = await this.savedPages(job.id);
    if (saved.size === 0 || job.total === 0) return undefined;
    const table = tableFromOcrPages(Array.from({ length: job.total }, (_, i) => saved.get(i + 1) ?? null));
    this.pdfCache.set(job.key, table);
    return table;
  }

  /** What was read from one page (OCR'd PDFs). */
  async pdfJobPageRows(caller: AuthUser, id: string, n: number) {
    const job = await this.loadJob(caller, id, true);
    if (job.kind === "table") {
      const saved = await this.savedPages(job.id);
      const pages = Array.from({ length: job.total }, (_, i) => saved.get(i + 1) ?? null);
      const list = pages[n - 1];
      if (!list) throw new NotFoundException("Nhóm dòng này không có dữ liệu");
      const issues = rowNumberIssues(pages)[n - 1];
      const rec = await this.jobPage.findOne({ job: job.id, n }).select("raw").lean().exec();
      const meta = await this.jobRecord.findById(job.id).select("columns").lean().exec();
      return {
        n,
        ok: true,
        rows: list.map((r, i) => ({ ...r, lostKanji: lostKanji(r), issue: issues[i] })),
        raw: { columns: meta?.columns ?? [], rows: (rec?.raw as Record<string, string>[] | undefined) ?? [] },
      };
    }
    const ocr = (await this.ocrTableOf(job))?.ocr;
    const page = ocr?.pages[n - 1];
    if (!ocr || page === undefined) throw new NotFoundException("Trang này không có dữ liệu OCR");
    const issues = rowNumberIssues(ocr.pages)[n - 1];
    return {
      n,
      ok: page !== null,
      rows: (page ?? []).map((r, i) => ({ ...r, lostKanji: lostKanji(r), issue: issues[i] })),
    };
  }

  /**
   * Read pages again in the background (after a failure, or when the result
   * looked wrong). Returns at once; progress is `retry` on the job, the queue
   * is persisted so it continues after a restart.
   */
  async retryPdfJobPages(caller: AuthUser, id: string, pages: number[]): Promise<PdfJobView> {
    const job = await this.loadJob(caller, id);
    const table = job.kind === "table" ? undefined : await this.ocrTableOf(job);
    if (job.status !== "done" || !table?.ocr || !this.ai) {
      throw new ConflictException("Không đọc lại được trang này (tác vụ đã hết hạn hoặc không phải PDF scan)");
    }
    if (job.retry?.queue.length) throw new ConflictException("Đang đọc lại các trang khác — đợi xong rồi hãy chọn tiếp");
    const queue = [...new Set(pages)].filter((n) => Number.isInteger(n) && n >= 1 && n <= table.ocr!.pages.length);
    if (queue.length === 0) throw new NotFoundException("Trang không tồn tại");
    job.retry = { total: queue.length, done: 0, queue };
    this.jobs.set(job.id, job);
    await this.jobRecord.updateOne({ _id: job.id }, { $set: { retry: job.retry } }).exec();
    void this.runRetry(job);
    return viewOf(job);
  }

  private async runRetry(job: PdfJob): Promise<void> {
    try {
      while (job.retry && job.retry.queue.length > 0 && this.ai) {
        const n = job.retry.queue[0];
        try {
          const file = await this.fileOf(job);
          const png = await renderPdfPage(file.buffer, n);
          const rows = await ocrWithRetry(png, n, (img) => this.ai!.ocrVocabPage(img, n));
          const table = await this.ocrTableOf(job);
          if (table?.ocr) {
            const pages = [...table.ocr.pages];
            pages[n - 1] = rows ?? pages[n - 1]; // a failed retry keeps what was there
            const next = tableFromOcrPages(pages);
            this.pdfCache.set(job.key, next);
            job.rows = next.rows.length;
            job.pages = pagesOf(next);
          }
          if (rows) await this.jobPage.updateOne({ job: job.id, n }, { $set: { rows } }, { upsert: true }).exec();
        } catch {
          /* this page stays as it was; carry on with the next */
        }
        job.retry.queue.shift();
        job.retry.done++;
        await this.jobRecord
          .updateOne({ _id: job.id }, { $set: { retry: job.retry, rows: job.rows, pages: job.pages } })
          .exec()
          .catch(() => undefined);
      }
    } finally {
      job.retry = undefined;
      job.file = undefined;
      this.jobs.delete(job.id);
      await this.jobRecord
        .updateOne({ _id: job.id }, { $unset: { retry: 1 }, $set: { rows: job.rows, pages: job.pages } })
        .exec()
        .catch(() => undefined);
    }
  }

  /** Parsed PDF tables by content hash (OCR'd scans are slow and cost AI calls). */
  private readonly pdfCache = new Map<string, Table>();

  // ── Background example generation ───────────────────────────────────
  // Imported cards that arrive without an example get one suggested from
  // Tatoeba (the same source as adding a single card). Looking up thousands
  // of words takes far too long for one request, so the import returns at
  // once and a single in-process worker fills the examples in afterwards.
  private readonly exampleQueue: {
    id: Types.ObjectId;
    deck: Types.ObjectId;
    term: string;
    meaning: string;
    reading: string;
    partOfSpeech: Pos;
  }[] = [];
  private activeExampleWorkers = 0;

  /** After a restart, resume decks whose examples were still being generated. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.resumePdfJobs();
    } catch {
      /* best effort — never block startup */
    }
    try {
      const decks = await this.deck
        .find({ exampleTotal: { $gt: 0 }, examplePaused: { $ne: true } })
        .exec();
      for (const d of decks) {
        const cards = await this.card
          .find({ deck: d._id, examples: { $size: 0 } })
          .select("front back reading partOfSpeech")
          .exec();
        await this.deck
          .updateOne({ _id: d._id }, { $set: { exampleTotal: cards.length, exampleDone: 0 } })
          .exec();
        this.enqueueExamples(
          cards.map((c) => ({
            id: c._id,
            deck: d._id,
            term: c.front,
            meaning: c.back,
            reading: c.reading ?? "",
            partOfSpeech: (c.partOfSpeech ?? "") as Pos,
          })),
        );
        if (cards.length === 0) await this.finishDeckExamples(d._id);
      }
    } catch {
      /* best effort — never block startup */
    }
  }

  /**
   * Pause / resume / stop the background example generation of a deck.
   * - pause: drop the deck's queued jobs (cards in flight finish), keep the
   *   progress; nothing runs until resume.
   * - resume: re-queue the cards that still have no example.
   * - stop: abandon the rest. The progress is cleared and a new import deck
   *   (draft) is published with the examples generated so far.
   */
  async controlExamples(
    caller: AuthUser,
    deckId: string,
    action: "pause" | "resume" | "stop" | "retry",
  ): Promise<{ deckId: string; action: string; remaining: number }> {
    const deck = await this.resolveWritableDeck(caller, deckId);
    if (action !== "retry" && (deck.exampleTotal ?? 0) <= 0) {
      throw new ConflictException("This deck is not generating examples");
    }
    const drop = () => {
      for (let i = this.exampleQueue.length - 1; i >= 0; i--) {
        if (String(this.exampleQueue[i].deck) === String(deck._id)) {
          this.exampleQueue.splice(i, 1);
        }
      }
    };

    if (action === "retry") {
      // Re-run generation for every card that still has no example.
      drop();
      const missing = await this.card
        .find({ deck: deck._id, examples: { $size: 0 } })
        .select("front back reading partOfSpeech")
        .exec();
      if (missing.length === 0) {
        await this.finishDeckExamples(deck._id);
        return { deckId, action, remaining: 0 };
      }
      await this.deck
        .updateOne(
          { _id: deck._id },
          { $set: { exampleTotal: missing.length, exampleDone: 0, examplePaused: false } },
        )
        .exec();
      this.enqueueExamples(
        missing.map((c) => ({
          id: c._id,
          deck: deck._id,
          term: c.front,
          meaning: c.back,
          reading: c.reading ?? "",
          partOfSpeech: (c.partOfSpeech ?? "") as Pos,
        })),
      );
      return { deckId, action, remaining: missing.length };
    }

    if (action === "pause") {
      drop();
      await this.deck.updateOne({ _id: deck._id }, { $set: { examplePaused: true } }).exec();
      return { deckId, action, remaining: 0 };
    }

    if (action === "stop") {
      drop();
      const set: Record<string, unknown> = {
        exampleTotal: 0,
        exampleDone: 0,
        examplePaused: false,
      };
      if (deck.publishWhenReady) {
        set.status = "PUBLISHED";
        set.publishWhenReady = false;
      }
      await this.deck.updateOne({ _id: deck._id }, { $set: set }).exec();
      return { deckId, action, remaining: 0 };
    }

    // resume
    const cards = await this.card
      .find({ deck: deck._id, examples: { $size: 0 } })
      .select("front back reading partOfSpeech")
      .exec();
    await this.deck
      .updateOne(
        { _id: deck._id },
        {
          $set: {
            examplePaused: false,
            exampleDone: Math.max(0, (deck.exampleTotal ?? 0) - cards.length),
          },
        },
      )
      .exec();
    if (cards.length === 0) {
      await this.finishDeckExamples(deck._id);
    } else {
      this.enqueueExamples(
        cards.map((c) => ({
          id: c._id,
          deck: deck._id,
          term: c.front,
          meaning: c.back,
          reading: c.reading ?? "",
          partOfSpeech: (c.partOfSpeech ?? "") as Pos,
        })),
      );
    }
    return { deckId, action, remaining: cards.length };
  }

  /** Clear the progress and, for a new import deck, publish it. */
  private async finishDeckExamples(deckId: Types.ObjectId): Promise<void> {
    const d = await this.deck.findById(deckId).exec();
    if (!d) return;
    const set: Record<string, unknown> = { exampleTotal: 0, exampleDone: 0, examplePaused: false };
    if (d.publishWhenReady) {
      set.status = "PUBLISHED";
      set.publishWhenReady = false;
    }
    await this.deck.updateOne({ _id: deckId }, { $set: set }).exec();
  }

  private enqueueExamples(items: typeof this.exampleQueue): void {
    this.exampleQueue.push(...items);
    if (items.length === 0) return;
    void this.startExampleWorkers();
  }

  /**
   * With the local Tatoeba index a lookup is a database query, so several run
   * side by side with no pause. Without it every lookup is a slow HTTP call:
   * a few in parallel, politely spaced.
   */
  private async startExampleWorkers(): Promise<void> {
    if (this.activeExampleWorkers > 0) return; // already running; they drain the queue
    const local = await this.exampleSuggest.hasLocalIndex();
    const workers = local ? 6 : 3;
    const pause = local ? 0 : 250;
    this.activeExampleWorkers = workers;
    for (let i = 0; i < workers; i++) void this.runExampleWorker(pause);
  }

  private async runExampleWorker(pauseMs: number): Promise<void> {
    try {
      let job: (typeof this.exampleQueue)[number] | undefined;
      while ((job = this.exampleQueue.shift())) {
        const hit = await this.exampleSuggest.suggestFull({
          term: job.term,
          meaning: job.meaning,
          reading: job.reading,
          partOfSpeech: job.partOfSpeech,
        });
        if (hit) {
          // Only fill a card that still has no example (never overwrite one
          // the learner added meanwhile).
          await this.card
            .updateOne(
              { _id: job.id, examples: { $size: 0 } },
              { $set: { examples: [{ sentence: hit.sentence, translation: hit.translation, ...(hit.source ? { source: hit.source } : {}) }] } },
            )
            .exec();
        }
        // Progress for the deck badge; the last card finishes (and publishes) it.
        // (a paused or stopped deck is no longer counted or finished here)
        const d = await this.deck
          .findOneAndUpdate(
            { _id: job.deck, exampleTotal: { $gt: 0 }, examplePaused: { $ne: true } },
            { $inc: { exampleDone: 1 } },
            { new: true },
          )
          .exec();
        if (d && (d.exampleDone ?? 0) >= (d.exampleTotal ?? 0)) {
          await this.finishDeckExamples(job.deck);
        }
        if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
      }
    } finally {
      this.activeExampleWorkers -= 1;
      // Jobs queued just as the last worker finished must not be stranded.
      if (this.activeExampleWorkers === 0 && this.exampleQueue.length > 0) {
        void this.startExampleWorkers();
      }
    }
  }

  /**
   * Optional card fields of one row: mapped values win; an empty/unmapped
   * hiragana or part-of-speech is derived from the word itself (kanji words
   * get a reading, kana-only/katakana words stay empty).
   */
  private async extras(
    row: Record<string, string>,
    mapping: ColumnMapping,
    front: string,
  ): Promise<{ reading: string; partOfSpeech: Pos; examples: CardExample[]; hanViet: string; order?: number }> {
    let reading = mapping.reading ? (row[mapping.reading] ?? "").trim() : "";
    let pos: Pos = (mapping.partOfSpeech ? normalizePos(row[mapping.partOfSpeech]) : null) ?? "";
    // A blank reading: reuse the one already in the database, else ask the AI, else the analyser.
    if (!reading && KANJI_RE.test(front)) reading = (await this.knownOrAiReading(front)) ?? "";
    if (!reading || !pos) {
      try {
        const guess = await this.morph.analyze(front);
        if (!reading) reading = guess.reading;
        if (!pos) pos = guess.partOfSpeech ?? "";
      } catch {
        /* analyser unavailable — leave blank */
      }
    }
    const sentences = splitMulti(mapping.example ? row[mapping.example] : "");
    const translations = splitMulti(mapping.exampleTranslation ? row[mapping.exampleTranslation] : "");
    const examples = sentences.slice(0, 10).map((sentence, i) => ({
      sentence,
      translation: translations[i] ?? "",
    }));
    // A Hán Việt cell that disagrees with the curated table (a missing / wrong syllable,
    // e.g. 一家 = "GIA") is replaced by the table's value; the review warning says so.
    const givenHv = mapping.hanViet ? (row[mapping.hanViet] ?? "").trim() : "";
    const hanViet = this.hanVietOf(front, givenHv).value;
    const rawNo = mapping.order ? (row[mapping.order] ?? "").trim().replace(/\.$/, "") : "";
    const order = /^\d{1,6}$/.test(rawNo) ? Number(rawNo) : undefined;
    return { reading, partOfSpeech: pos, examples, hanViet, order };
  }

  private readonly readingCache = new Map<string, string | null>();

  /** Run `fn` over `list` in batches, a few at a time, counting progress and stopping on cancel. */
  private async inBatches<T>(list: T[], size: number, parallel: number, task: ImportTask | undefined, fn: (batch: T[]) => Promise<void>): Promise<void> {
    const batches: T[][] = [];
    for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        if (task?.cancelled) throw new HttpException("Đã hủy", HttpStatus.CONFLICT);
        const batch = batches[next++]!;
        await fn(batch);
        if (task) task.done = Math.min(task.done + batch.length, task.total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, worker));
  }

  /** The AI's last check of a finished card (reading, Hán Việt, meaning) → warnings, by card content. */
  private readonly cardCheckCache = new Map<string, string[]>();
  private static cardKey = (front: string, reading: string, hanViet: string, back: string) => [front, reading, hanViet, back].join("\u0001");

  /** Warnings the AI's last check left on this card (empty when it was fine or not checked). */
  private aiIssues(front: string, reading: string, hanViet: string, back: string): string[] {
    return this.cardCheckCache.get(ImportService.cardKey(front, reading, hanViet, back)) ?? [];
  }

  /**
   * Before the rows are shown: the AI proofreads each finished card (reading,
   * Hán Việt, meaning as they will be saved). What it finds wrong becomes a
   * warning carrying its suggestion; the cards keep the warning once imported.
   * Cached by card content, so preview and confirm agree. At most 300 cards a run.
   */
  private async verifyCards(
    table: Table,
    mapping: ColumnMapping,
    extrasByRow: (Awaited<ReturnType<ImportService["extras"]>> | null)[],
    suggested: Map<number, string>,
    task?: ImportTask,
  ): Promise<void> {
    if (!this.ai) return;
    await this.ensureKanjiTable();
    const todo = new Map<string, { front: string; reading: string; hanViet: string; meaning: string }>();
    // A card identical to one already in the database was checked when it came in: skip it.
    const known = new Set<string>();
    try {
      const fronts = [...new Set(table.rows.map((r) => (r[mapping.front] ?? "").trim()).filter(Boolean))];
      for (let i = 0; i < fronts.length; i += 1000) {
        const hits = await this.card
          .find({ front: { $in: fronts.slice(i, i + 1000) } })
          .select("front reading hanViet back")
          .lean()
          .exec();
        for (const h of hits) known.add(ImportService.cardKey(h.front, h.reading ?? "", h.hanViet ?? "", h.back));
      }
    } catch {
      /* lookup failed — everything is checked */
    }
    // Only what the local data cannot settle goes to the AI: a Hán Việt the kanji data
    // covers (or an earlier verdict settled) and a reading the analyser agrees with are
    // certain, so they are left out of the request; a card with nothing left is not sent.
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i]!;
      const front = (row[mapping.front] ?? "").trim();
      const extra = extrasByRow[i];
      if (!front || !extra) continue;
      // A meaning the AI itself just wrote is already flagged — only a meaning from the file is checked.
      const meaning = (row[mapping.back] ?? "").trim();
      const shown = meaning || suggested.get(i) || "";
      const key = ImportService.cardKey(front, extra.reading, extra.hanViet, shown);
      if (this.cardCheckCache.has(key) || known.has(key) || todo.has(key)) continue;
      if (!extra.reading && !extra.hanViet && !meaning) continue;
      const given = mapping.hanViet ? (row[mapping.hanViet] ?? "").trim() : "";
      const hanViet =
        extra.hanViet && suggestHanViet(front) === "" && !this.hvCache.has(ImportService.hvKey(front, given)) ? extra.hanViet : "";
      const reading = extra.reading && !(await this.readingConfirmed(front, extra.reading)) ? extra.reading : "";
      if (!reading && !hanViet && !meaning) {
        this.cardCheckCache.set(key, []); // everything is settled locally
        continue;
      }
      todo.set(key, { front, reading, hanViet, meaning });
    }
    const list = [...todo.entries()].slice(0, 600);
    if (list.length === 0) return;
    if (task) Object.assign(task, { phase: "AI đang kiểm tra lại thẻ", done: 0, total: list.length });
    await this.inBatches(list, 15, 3, task, async (batch) => {
      const got = await this.ai!
        .verifyCards(batch.map(([, c], n) => ({ id: n + 1, word: c.front.replace(/[（(][^）)]*[）)]/g, "").trim(), reading: c.reading, hanViet: c.hanViet, meaning: c.meaning })))
        .catch(() => null);
      batch.forEach(([key, c], n) => {
        const r = got?.get(n + 1);
        const out: string[] = [];
        if (r?.reading && c.reading && /^[\p{Script=Hiragana}ー]+$/u.test(r.reading) && !readingVariants(c.reading).includes(r.reading)) {
          out.push(`cách đọc “${c.reading}” có thể chưa đúng (AI gợi ý: ${r.reading})`);
        }
        // Hán Việt comes from the kanji data when every kanji is in it — the AI does not second-guess that.
        if (r?.hanViet && c.hanViet && suggestHanViet(c.front) === "" && hvNorm(r.hanViet) !== hvNorm(c.hanViet) && hanVietFits(c.front, r.hanViet)) {
          out.push(`Hán Việt “${c.hanViet}” có thể chưa đúng (AI gợi ý: ${harmonizeHanViet(c.front, r.hanViet)})`);
        }
        if (r?.meaning && c.meaning && hvNorm(r.meaning) !== hvNorm(c.meaning)) {
          out.push(`nghĩa “${c.meaning}” có thể chưa sát (AI gợi ý: ${r.meaning})`);
        }
        if (got) this.cardCheckCache.set(key, out);
      });
    });
  }

  /**
   * A given reading settled locally, so the AI is not asked: it is built from the on/kun
   * readings in the kanji admin data, or the morphological analyser independently produces it.
   */
  private async readingConfirmed(front: string, reading: string): Promise<boolean> {
    if (!KANJI_RE.test(front)) return false;
    const variants = readingVariants(reading);
    if (variants.some((r) => readingFitsKanji(front, r))) return true;
    try {
      const known = (await this.morph.analyze(front)).readings.filter((g) => /^[\p{Script=Hiragana}ー]+$/u.test(g));
      return known.some((g) => variants.includes(g));
    } catch {
      return false;
    }
  }

  /** AI verdicts on Hán Việt cells, keyed by "word|given" (so preview and confirm agree). */
  private readonly hvCache = new Map<string, { ok: boolean; hanViet: string }>();
  private static hvKey = (front: string, given: string) => `${front.replace(/[（(][^）)]*[）)]/g, "").trim()}|${given.trim()}`;

  /**
   * Hán Việt for a row: what to store and whether the file's own cell is wrong.
   * The curated table can miss a valid alternative reading, so a disagreement
   * (or a word the table does not know) is settled by the AI verdict if there is one.
   */
  private hanVietOf(front: string, given: string): { value: string; issue: string | null } {
    const r = this.hanVietRaw(front, given);
    // One spelling per word (ký → kí), whoever wrote the reading.
    return { value: harmonizeHanViet(front, r.value), issue: r.issue };
  }

  private hanVietRaw(front: string, given: string): { value: string; issue: string | null } {
    const tableValue = suggestHanViet(front);
    const v = this.hvCache.get(ImportService.hvKey(front, given));
    if (!given.trim()) return { value: v?.hanViet || tableValue, issue: null };
    const issue = checkHanViet(front, given);
    if (!issue || v?.ok) return { value: given, issue: null };
    // The kanji data settles it: keep valid syllables, replace the wrong ones.
    const fixed = v?.hanViet || correctHanViet(front, given) || tableValue || correctHanVietPartial(front, given);
    // Corrected from the table: no warning to act on — the stored value is already right.
    return { value: fixed || given, issue: fixed ? null : issue };
  }

  /**
   * Settle every Hán Việt cell the table cannot (cached, with progress):
   * first a card already in the database with the same word, and only what is
   * still open — a cell the table disagrees with, or a word it does not know —
   * goes to the AI.
   */
  private ensureKanjiTable(): Promise<void> {
    return ensureKanjiTables(this.kanji);
  }

  private async verifyHanViet(table: Table, mapping: ColumnMapping, task?: ImportTask, useAi = true): Promise<void> {
    await this.ensureKanjiTable();
    const clean = (f: string) => f.replace(/[（(][^）)]*[）)]/g, "").trim();
    const pairs = new Map<string, { word: string; given: string }>();
    for (const row of table.rows) {
      const front = (row[mapping.front] ?? "").trim();
      if (!front || !/[\u4e00-\u9fff]/.test(front)) continue;
      const given = mapping.hanViet ? (row[mapping.hanViet] ?? "").trim() : "";
      const key = ImportService.hvKey(front, given);
      // Every kanji is in the kanji data: it fills / corrects the cell itself (hanVietOf), no lookup, no AI.
      if (suggestHanViet(front) !== "") continue;
      if (!this.hvCache.has(key)) pairs.set(key, { word: clean(front), given });
    }
    if (pairs.size === 0) return;

    // 1. The database: a card with the same word and a Hán Việt reading.
    const known = new Map<string, string>();
    try {
      const hits = await this.card
        .find({ front: { $in: [...new Set([...pairs.values()].map((p) => p.word))] }, hanViet: { $exists: true, $ne: "" } })
        .select("front hanViet")
        .sort({ createdAt: -1 })
        .lean()
        .exec();
      for (const h of hits) if (!known.has(clean(h.front)) && h.hanViet?.trim()) known.set(clean(h.front), h.hanViet.trim());
    } catch {
      /* lookup failed — the table and the AI decide */
    }
    const open: [string, { word: string; given: string }][] = [];
    for (const [key, p] of pairs) {
      const db = known.get(p.word);
      if (db) {
        // The database is trusted: the file's cell is fine when it is the same reading.
        this.hvCache.set(key, { ok: !p.given || hvNorm(db) === hvNorm(p.given), hanViet: db.toLocaleUpperCase("vi") });
      } else if (p.given ? checkHanViet(p.word, p.given) !== null : suggestHanViet(p.word) === "") {
        open.push([key, p]);
      }
    }

    // 2. The table could not settle these: ask the AI.
    if (!useAi || !this.ai || open.length === 0) return;
    const list = open.slice(0, 200);
    if (task) Object.assign(task, { phase: "Đang kiểm tra Hán Việt", done: 0, total: list.length });
    await this.inBatches(list, 20, 3, task, async (batch) => {
      const got = await this.ai!.checkHanViet(batch.map(([, w], n) => ({ id: n + 1, word: w.word, given: w.given }))).catch(() => null);
      batch.forEach(([key], n) => {
        const r = got?.get(n + 1);
        if (r) this.hvCache.set(key, r);
      });
    });
  }

  /** Progress of the preview / confirm runs that call the AI (by client-chosen id). */
  private readonly tasks = new Map<string, ImportTask>();

  private beginTask(owner: string, id: string | undefined, fileName: string, deckId: string): ImportTask | undefined {
    if (!id || !/^[\w-]{8,64}$/.test(id)) return undefined;
    const now = Date.now();
    for (const [k, t] of this.tasks) if (t.finishedAt && now - t.finishedAt > TASK_KEEP_MS) this.tasks.delete(k);
    const t: ImportTask = { id, owner, fileName, deckId, status: "running", phase: "", done: 0, total: 0, cancelled: false };
    this.tasks.set(id, t);
    return t;
  }

  /** The run is over: the card stays a few minutes so the user can come back to it. */
  private endTask(task: ImportTask | undefined, err?: unknown): void {
    if (!task) return;
    task.finishedAt = Date.now();
    task.status = err ? "error" : "done";
    if (err) task.error = task.cancelled ? "Đã hủy" : (err as Error).message;
  }

  /** Where a running preview / confirm is (null once forgotten or unknown). */
  taskProgress(caller: AuthUser, id: string): { phase: string; done: number; total: number } | null {
    const t = this.tasks.get(id);
    return t && t.owner === caller.sub ? { phase: t.phase, done: t.done, total: t.total } : null;
  }

  /** The caller's runs that did real work (a lookup phase started) and are not cancelled. */
  listTasks(caller: AuthUser): ImportTaskView[] {
    return [...this.tasks.values()]
      .filter((t) => t.owner === caller.sub && !t.cancelled && (t.total > 0 || t.status === "error"))
      .map(({ id, fileName, deckId, status, error, phase, done, total }) => ({ id, fileName, deckId, status, error, phase, done, total }));
  }

  /** The user pressed Hủy: the run stops at its next step. */
  cancelTask(caller: AuthUser, id: string): void {
    const t = this.tasks.get(id);
    if (t && t.owner === caller.sub) t.cancelled = true;
  }

  /**
   * Reading for a word whose file gave none: a card already in the database
   * with the same word, then the analyser, and only then the AI. Cached per word so the
   * preview and the confirm of one file agree. `null` → caller falls back.
   */
  private async knownOrAiReading(front: string, useAi = true): Promise<string | null> {
    const word = front.replace(/[（(][^）)]*[）)]/g, "").trim();
    if (!word) return null;
    if (this.readingCache.has(word)) return this.readingCache.get(word) ?? null;
    let found: string | null = null;
    try {
      const hit = await this.card
        .findOne({ front: { $in: [word, front] }, reading: { $exists: true, $ne: "" } })
        .select("reading")
        .lean()
        .exec();
      found = hit?.reading?.trim() || null;
    } catch {
      /* lookup failed — go on to the AI */
    }
    // The analyser's answer counts only when it is all kana (an unknown word leaves kanji behind).
    if (!found) {
      try {
        const g = (await this.morph.analyze(word)).reading;
        if (g && /^[\p{Script=Hiragana}ー]+$/u.test(g)) found = g;
      } catch {
        /* analyser unavailable — ask the AI */
      }
    }
    if (!found && this.ai && useAi) found = await this.ai.suggestReading(word).catch(() => null);
    if (!useAi && !found) return null; // not cached: a later AI-enabled run may still settle it
    if (this.readingCache.size > 5000) this.readingCache.clear();
    this.readingCache.set(word, found);
    return found;
  }

  /**
   * A bracketed note split across two cells: the meaning ends with an opened "(迫"
   * while the reading starts with the rest "られる) せまる". Hand the tail back and
   * keep only the reading proper (what follows the closing bracket).
   */
  private repairSplitCells(table: Table, mapping: ColumnMapping | undefined): void {
    if (mapping?.front) {
      // PDF text often puts a space between characters (人 見 知 り): not part of the word.
      const JA = "\\u3000-\\u30ff\\u4e00-\\u9fff\\uff00-\\uffef";
      const gap = new RegExp(`(?<=[${JA}])\\s+(?=[${JA}])`, "g");
      for (const row of table.rows) if (row[mapping.front]) row[mapping.front] = row[mapping.front].replace(gap, "");
    }
    if (!mapping?.reading || !mapping.back) return;
    for (const row of table.rows) {
      const reading = (row[mapping.reading] ?? "").trim();
      const back = (row[mapping.back] ?? "").trim();
      const close = /^[^()（）]*[)）]\s*/.exec(reading);
      const open = /[(（][^()（）]*$/.exec(back);
      if (!close || !open) continue;
      row[mapping.reading] = reading.slice(close[0].length).trim();
      row[mapping.back] = back.slice(0, open.index).trim();
    }
  }

  /** Why a row's own (not derived) meaning / reading / Hán Việt looks wrong. */
  private async reviewIssues(row: Record<string, string>, mapping: ColumnMapping, front: string): Promise<string[]> {
    const issues: string[] = [];
    const meaning = checkMeaning((row[mapping.back] ?? "").trim());
    if (meaning) issues.push(meaning);
    const hv = mapping.hanViet ? (row[mapping.hanViet] ?? "").trim() : "";
    const hvIssue = this.hanVietOf(front, hv).issue;
    if (hvIssue) issues.push(hvIssue);
    const givenReading = mapping.reading ? (row[mapping.reading] ?? "").trim() : "";
    // With the AI available it judges the reading (verifyCards): the analyser alone is often wrong
    // (放っておく = ほうっておく, not はなっておく), so its disagreement is no longer a warning by itself.
    if (givenReading && KANJI_RE.test(front) && !this.ai) {
      try {
        const a = await this.morph.analyze(front.replace(/[（(][^）)]*[）)]/g, ""));
        const guess = readingVariants(a.reading)[0] ?? "";
        const given = readingVariants(givenReading);
        const known = a.readings.flatMap((r) => readingVariants(r));
        if (guess && given.length > 0 && !given.some((g) => known.some((k) => g === k || g.includes(k) || k.includes(g)))) {
          issues.push(`cách đọc “${givenReading}” khác cách đọc tự nhận (${guess})`);
        }
      } catch {
        /* analyser unavailable — cannot judge */
      }
    }
    return issues;
  }

  /** Existing warnings plus the AI's, skipping a field that already has a warning. */
  private withAiIssues(issues: string[], front: string, extra: { reading: string; hanViet: string }, back: string): string[] {
    const out = [...issues];
    const has = (re: RegExp) => out.some((t) => re.test(t));
    for (const t of this.aiIssues(front, extra.reading, extra.hanViet, back)) {
      const field = /^Hán Việt/.test(t) ? /^Hán Việt/ : /^cách đọc/.test(t) ? /^cách đọc/ : /^nghĩa/;
      if (!has(field)) out.push(t);
    }
    return out;
  }

  private readonly meaningCache = new Map<string, string>();

  /**
   * Suggested Vietnamese meanings for rows that have a word but a blank
   * meaning (row index → suggestion). Cached per word so the preview and the
   * confirm of the same file agree. Best effort: no AI service → no entry.
   */
  private async suggestMeanings(table: Table, mapping: ColumnMapping, task?: ImportTask, useAi = true): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    const wanted: { idx: number; term: string; reading: string }[] = [];
    table.rows.forEach((row, idx) => {
      const front = (row[mapping.front] ?? "").trim();
      if (!front || (row[mapping.back] ?? "").trim()) return;
      const term = front.split(/[（(]/)[0].trim();
      const reading = mapping.reading ? (row[mapping.reading] ?? "").trim() : "";
      wanted.push({ idx, term, reading });
    });
    // A word already in the database (any deck) with a meaning: reuse it, only the rest goes to the AI.
    const fresh = [...new Map(wanted.filter((w) => !this.meaningCache.has(w.term)).map((w) => [w.term, w])).values()];
    if (fresh.length > 0) {
      try {
        const hits = await this.card
          .find({ front: { $in: fresh.map((w) => w.term) }, back: { $exists: true, $ne: "" } })
          .select("front back")
          .sort({ createdAt: -1 })
          .lean()
          .exec();
        for (const h of hits) {
          const t = h.front.split(/[（(]/)[0].trim();
          if (h.back.trim() && !this.meaningCache.has(t)) this.meaningCache.set(t, h.back.trim());
        }
      } catch {
        /* lookup failed — go on to the AI */
      }
    }
    const todo = fresh.filter((w) => !this.meaningCache.has(w.term)).slice(0, 100);
    if (useAi && this.ai && todo.length > 0) {
      if (task) Object.assign(task, { phase: "Đang gợi ý nghĩa", done: 0, total: todo.length });
      for (let i = 0; i < todo.length; i += 20) {
        if (task?.cancelled) throw new HttpException("Đã hủy", HttpStatus.CONFLICT);
        const got = await this.ai
          .translateWords(todo.slice(i, i + 20).map((w) => ({ term: w.term, reading: w.reading, glossEn: "" })))
          .catch(() => null);
        got?.forEach((vi, term) => this.meaningCache.set(term, vi));
        if (task) task.done = Math.min(i + 20, todo.length);
      }
    }
    for (const w of wanted) {
      const m = this.meaningCache.get(w.term);
      if (m) out.set(w.idx, m);
    }
    return out;
  }

  /**
   * Per-row extras (reading/POS/examples) for every row that has a front and
   * a back. Computed once up front because the reading is part of a card's
   * duplicate key (kanji + hiragana + meaning).
   */
  private async rowExtras(
    table: Table,
    mapping: ColumnMapping,
    task?: ImportTask,
    useAi = true,
  ): Promise<(Awaited<ReturnType<ImportService["extras"]>> | null)[]> {
    // Readings the file does not give: look them up (database, then AI) word by word, with progress.
    const words = new Set<string>();
    for (const row of table.rows) {
      const front = (row[mapping.front] ?? "").trim();
      if (front && KANJI_RE.test(front) && !(mapping.reading && (row[mapping.reading] ?? "").trim())) words.add(front);
    }
    await this.verifyHanViet(table, mapping, task, useAi);
    if (words.size > 0) {
      if (task) Object.assign(task, { phase: "Đang gợi ý cách đọc", done: 0, total: words.size });
      for (const w of words) {
        if (task?.cancelled) throw new HttpException("Đã hủy", HttpStatus.CONFLICT);
        await this.knownOrAiReading(w, useAi);
        if (task) task.done += 1;
      }
    }
    const out: (Awaited<ReturnType<ImportService["extras"]>> | null)[] = [];
    for (const row of table.rows) {
      const front = (row[mapping.front] ?? "").trim();
      out.push(front ? await this.extras(row, mapping, front) : null);
    }
    return out;
  }

  // ── Parsing ─────────────────────────────────────────────────────────

  /**
   * Parse an uploaded file into a `Table`. Format is sniffed from the magic
   * bytes first (an `.xlsx` is a ZIP: `PK\x03\x04`), then from the
   * extension — MIME types for spreadsheets are unreliable in practice.
   */
  private async parseFile(file: UploadedImportFile): Promise<Table> {
    if (file.size === 0) {
      throw new EmptyTableError("File is empty");
    }
    const looksXlsx =
      file.buffer.length >= 4 &&
      file.buffer[0] === 0x50 &&
      file.buffer[1] === 0x4b &&
      file.buffer[2] === 0x03 &&
      file.buffer[3] === 0x04;

    const ext = file.originalname.toLowerCase().split(".").pop();
    const looksPdf =
      file.buffer.length >= 5 && file.buffer.subarray(0, 5).toString("latin1") === "%PDF-";
    if (looksPdf || ext === "pdf") {
      return this.parsePdfCached(file.buffer);
    }
    if (looksXlsx || ext === "xlsx") {
      return parseXlsx(file.buffer);
    }
    // Everything else is treated as CSV (`.csv` and friends); a corrupt
    // binary still "parses" as one garbage row and the preview flags it.
    return parseCsv(file.buffer);
  }

  /**
   * The target deck must be writable by the caller: their own personal deck,
   * or a shared deck when they are an admin (shared decks are seeded by
   * admin imports, P3-CARD-01).
   */
  private async resolveWritableDeck(
    caller: AuthUser,
    deckId: string,
  ): Promise<FlashcardDeckDocument> {
    let doc: FlashcardDeckDocument | null;
    try {
      doc = await this.deck.findById(new Types.ObjectId(deckId)).exec();
    } catch {
      throw new UnprocessableEntityException("Unknown deckId");
    }
    if (!doc) throw new UnprocessableEntityException("Unknown deckId");

    if (doc.shared) {
      if (!CONTENT_ADMIN.includes(caller.role)) {
        throw new ConflictException(
          "Shared decks can only be imported by an admin",
        );
      }
      return doc;
    }
    if (String(doc.user) !== caller.sub) {
      throw new ConflictException("Cannot import into another user's deck");
    }
    return doc;
  }

  // ── P3-IMPORT-02: map + preview (no DB write) ──────────────────────

  /**
   * Preview an import. With `mapping` → the full per-row report (ok / error /
   * duplicate). Without → just the file's columns + row count, which the UI
   * wizard needs to let the user *choose* the mapping first (P3-IMPORT-02).
   * Neither variant writes to the DB.
   */
  async preview(
    caller: AuthUser,
    file: UploadedImportFile,
    deckId: string,
    mapping?: ColumnMapping,
    progressId?: string,
  ): Promise<ImportPreview> {
    const task = this.beginTask(caller.sub, progressId, file.originalname, deckId);
    try {
      const out = await this.previewRun(caller, file, deckId, mapping, task);
      this.endTask(task);
      return out;
    } catch (err) {
      this.endTask(task, err);
      throw err;
    }
  }

  private async previewRun(
    caller: AuthUser,
    file: UploadedImportFile,
    deckId: string,
    mapping: ColumnMapping | undefined,
    task?: ImportTask,
  ): Promise<ImportPreview> {
    await this.resolveWritableDeck(caller, deckId);
    const table = await this.parseTable(file);
    this.repairSplitCells(table, mapping);
    const targetDeck = await this.resolveWritableDeck(caller, deckId);
    // Any file other than a scanned PDF gets its page check as soon as it is mapped.
    if (!table.ocr && mapping?.front && mapping.back) {
      await this.saveTableReview(deckId, caller.sub, file.originalname, table, mapping, file, true).catch((e: unknown) => console.error("[import] draft review failed", e));
    }

    // Mapping step 1: no mapping chosen yet — report the columns only.
    if (!mapping || !mapping.front || !mapping.back) {
      return {
        deckId,
        format: table.format,
        columns: table.columns,
        totalRows: table.rows.length,
        okRows: 0,
        errorRows: 0,
        duplicateRows: 0,
        duplicates: [],
        rows: [],
      };
    }

    // Which dedupe keys already exist in the deck (one batched lookup)?
    const extrasByRow = await this.rowExtras(table, mapping, task);
    const candidateKeys = table.rows.map((row, idx) =>
      cardDedupeKey(
        (row[mapping.front] ?? "").trim(),
        (row[mapping.back] ?? "").trim(),
        extrasByRow[idx]?.reading ?? "",
      ),
    );
    const existing = await this.card
      .find({ deck: targetDeck._id, dedupeKey: candidateKeys })
      .select("dedupeKey front back reading")
      .exec();
    const existingKeys = new Set(existing.map((c) => c.dedupeKey));
    const existingByKey = new Map(existing.map((c) => [c.dedupeKey, c]));

    // Within-file duplicates: a key seen earlier in the same file (remember
    // which row, so the preview can show what it duplicates).
    const seenInFile = new Map<string, { no?: number; rowNumber: number; front: string; reading: string; back: string }>();
    const dupList: DuplicateInfo[] = [];

    const suggested = await this.suggestMeanings(table, mapping, task);
    await this.verifyCards(table, mapping, extrasByRow, suggested, task);
    const rows: PreviewRow[] = [];
    let ok = 0;
    let errors = 0;
    let duplicates = 0;

    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const rawFront = (row[mapping.front] ?? "").trim();
      const rawBack = (row[mapping.back] ?? "").trim();
      const tags = this.parseTags(row[mapping.tags ?? ""]);

      if (rawFront === "") {
        rows.push({
          rowNumber: i + 2,
          front: rawFront,
          back: rawBack,
          tags,
          status: "error",
          error: "missing front value",
        });
        errors += 1;
        continue;
      }

      const extra = extrasByRow[i]!;
      const key = cardDedupeKey(rawFront, rawBack, extra.reading);
      if (existingKeys.has(key) || seenInFile.has(key)) {
        rows.push({
          rowNumber: i + 2,
          front: rawFront,
          back: rawBack,
          tags,
          status: "duplicate",
          no: extra.order,
        });
        duplicates += 1;
        if (dupList.length < MAX_DUPLICATES_LISTED) {
          const inDeck = existingByKey.get(key);
          const earlier = seenInFile.get(key);
          dupList.push({
            rowNumber: i + 2,
            no: extra.order,
            front: rawFront,
            reading: extra.reading,
            back: rawBack,
            of: inDeck
              ? { source: "deck", front: inDeck.front, reading: inDeck.reading ?? "", back: inDeck.back }
              : { source: "file", front: earlier!.front, reading: earlier!.reading, back: earlier!.back, no: earlier!.no, rowNumber: earlier!.rowNumber },
          });
        }
        if (!seenInFile.has(key)) {
          seenInFile.set(key, { no: extra.order, rowNumber: i + 2, front: rawFront, reading: extra.reading, back: rawBack });
        }
        continue;
      }

      const issues = this.withAiIssues(await this.reviewIssues(row, mapping, rawFront), rawFront, extra, rawBack || suggested.get(i) || "");
      rows.push({
        rowNumber: i + 2,
        front: rawFront,
        back: rawBack || suggested.get(i) || "",
        issues: issues.length > 0 ? issues : undefined,
        blankBack: rawBack === "" || undefined,
        suggestedBack: (rawBack === "" && suggested.has(i)) || undefined,
        tags,
        status: "ok",
        reading: extra.reading,
        partOfSpeech: extra.partOfSpeech,
        examples: extra.examples.length,
        no: extra.order,
        hanViet: extra.hanViet || undefined,
      });
      ok += 1;
      seenInFile.set(key, { no: extra.order, rowNumber: i + 2, front: rawFront, reading: extra.reading, back: rawBack });
    }

    return {
      deckId,
      format: table.format,
      columns: table.columns,
      totalRows: table.rows.length,
      okRows: ok,
      errorRows: errors,
      duplicateRows: duplicates,
      duplicates: dupList,
      rows,
    };
  }

  // ── P3-IMPORT-03/04: confirm + write (idempotent) ──────────────────

  async confirm(
    caller: AuthUser,
    file: UploadedImportFile,
    deckId: string,
    mapping: ColumnMapping,
    policy: DuplicatePolicy,
    newDeck = false,
    progressId?: string,
  ): Promise<ImportConfirmResult> {
    const task = this.beginTask(caller.sub, progressId, file.originalname, deckId);
    try {
      const out = await this.confirmRun(caller, file, deckId, mapping, policy, newDeck, task);
      this.endTask(task);
      return out;
    } catch (err) {
      this.endTask(task, err);
      throw err;
    }
  }

  private async confirmRun(
    caller: AuthUser,
    file: UploadedImportFile,
    deckId: string,
    mapping: ColumnMapping,
    policy: DuplicatePolicy,
    newDeck: boolean,
    task?: ImportTask,
  ): Promise<ImportConfirmResult> {
    const targetDeck = await this.resolveWritableDeck(caller, deckId);
    const table = await this.parseTable(file);
    this.repairSplitCells(table, mapping);
    if (!table.ocr) {
      await this.saveTableReview(deckId, caller.sub, file.originalname, table, mapping, file).catch(() => undefined);
    }

    // Rebuild the exact rows the preview showed, in the same order.
    // The AI checks (missing meaning / Hán Việt / reading, card proofreading) belong to the
    // column-mapping preview; confirming only reuses what that step already settled.
    const extrasByRow = await this.rowExtras(table, mapping, task, false);
    const suggested = await this.suggestMeanings(table, mapping, task, false);
    const needsReview: NonNullable<ImportConfirmResult["needsReview"]> = [];
    const needsMeaning: NonNullable<ImportConfirmResult["needsMeaning"]> = [];
    const existing = await this.card
      .find({
        deck: targetDeck._id,
        dedupeKey: table.rows.map((r, idx) =>
          cardDedupeKey(
            (r[mapping.front] ?? "").trim(),
            (r[mapping.back] ?? "").trim(),
            extrasByRow[idx]?.reading ?? "",
          ),
        ),
      })
      .select("dedupeKey front back reading")
      .exec();
    const existingKeys = new Set(existing.map((c) => c.dedupeKey));
    const existingByKey = new Map(existing.map((c) => [c.dedupeKey, c]));
    const seenInFile = new Map<string, { no?: number; rowNumber: number; front: string; reading: string; back: string }>();
    const dupList: DuplicateInfo[] = [];

    // A card row as written by an import: the fields `origin: "import"`
    // supplies are the ones set here; `kind`/timestamps come from the
    // schema defaults (the insert omits them on purpose).
    interface ImportCardDoc {
      deck: Types.ObjectId;
      front: string;
      back: string;
      tags: string[];
      origin: "import";
      dedupeKey: string;
      reading: string;
      partOfSpeech: Pos;
      examples: CardExample[];
      hanViet: string;
      order?: number;
      reviewIssues: string[];
    }

    const toInsert: ImportCardDoc[] = [];
    const toOverwrite: ImportCardDoc[] = [];
    let skipped = 0;
    const errors: { rowNumber: number; no?: number; front: string; back: string; error: string }[] = [];
    let rowNo = 1;

    for (const [rowIdx, row] of table.rows.entries()) {
      rowNo += 1;
      const front = (row[mapping.front] ?? "").trim();
      const back = (row[mapping.back] ?? "").trim();
      const tags = this.parseTags(row[mapping.tags ?? ""]);

      if (front === "") {
        errors.push({
          rowNumber: rowNo,
          no: extrasByRow[rowIdx]?.order,
          front,
          back,
          error: "front is required",
        });
        continue;
      }

      const extra = extrasByRow[rowIdx]!;
      const key = cardDedupeKey(front, back, extra.reading);
      const reviewIssues = this.withAiIssues(await this.reviewIssues(row, mapping, front), front, extra, back || suggested.get(rowIdx) || "");
      const doc: ImportCardDoc = {
        deck: targetDeck._id,
        front,
        back: back || suggested.get(rowIdx) || "",
        tags,
        origin: "import",
        dedupeKey: key,
        reading: extra.reading,
        partOfSpeech: extra.partOfSpeech,
        examples: extra.examples,
        hanViet: extra.hanViet,
        order: extra.order,
        reviewIssues: [
          ...reviewIssues,
          ...(back === ""
            ? [suggested.has(rowIdx) ? "nghĩa do AI gợi ý — cần kiểm tra" : "chưa có nghĩa — cần tự nhập"]
            : []),
        ],
      };

      const noteDuplicate = () => {
        if (dupList.length >= MAX_DUPLICATES_LISTED) return;
        const inDeck = existingByKey.get(key);
        const earlier = seenInFile.get(key);
        dupList.push({
          rowNumber: rowNo,
          no: extra.order,
          front,
          reading: extra.reading,
          back,
          of: inDeck
            ? { source: "deck", front: inDeck.front, reading: inDeck.reading ?? "", back: inDeck.back }
            : { source: "file", front: earlier!.front, reading: earlier!.reading, back: earlier!.back, no: earlier!.no, rowNumber: earlier!.rowNumber },
        });
      };

      const noteBlank = () => {
        if (reviewIssues.length > 0) needsReview.push({ rowNumber: rowNo, no: extra.order, front, issues: reviewIssues });
        if (back === "") needsMeaning.push({ rowNumber: rowNo, no: extra.order, front, suggested: suggested.has(rowIdx) });
      };

      if (seenInFile.has(key)) {
        skipped += 1; // a later copy of the same row in the file
        noteDuplicate();
        continue;
      }

      if (existingKeys.has(key)) {
        if (policy === "overwrite") {
          toOverwrite.push(doc);
          noteBlank();
        } else {
          skipped += 1;
          noteDuplicate();
        }
        seenInFile.set(key, { no: extra.order, rowNumber: rowNo, front, reading: extra.reading, back });
      } else {
        seenInFile.set(key, { no: extra.order, rowNumber: rowNo, front, reading: extra.reading, back });
        toInsert.push(doc);
        noteBlank();
      }
    }

    // Insert the new rows in one batched write. A concurrent duplicate (a
    // truly simultaneous second confirm) surfaces as E11000 on the unique
    // index — absorb it as a skip, never crash (P3-IMPORT-04).
    let imported = 0;
    let insertedDocs: { _id: Types.ObjectId; examples?: unknown[] }[] = [];
    if (toInsert.length > 0) {
      try {
        const res = await this.card.insertMany(
          toInsert as unknown as Document[],
          { ordered: false },
        );
        imported = res.length;
        insertedDocs = res as unknown as { _id: Types.ObjectId; examples?: unknown[] }[];
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code === 11000 || code === 11001) {
          // Duplicate-key collisions (a concurrent confirm): with an
          // unordered insert every other row still lands. Count the
          // collisions as skipped; the unique index guarantees no copy.
          const e = error as {
            insertedDocs?: unknown[];
            writeErrors?: unknown[];
            result?: { insertedCount?: number };
          };
          insertedDocs = (e.insertedDocs ?? []) as typeof insertedDocs;
          imported = e.insertedDocs?.length ?? e.result?.insertedCount ?? 0;
          skipped += Math.max(1, e.writeErrors?.length ?? toInsert.length - imported);
        } else {
          throw error;
        }
      }
    }

    let overwritten = 0;
    if (toOverwrite.length > 0) {
      for (const doc of toOverwrite) {
        const current = existingByKey.get(doc.dedupeKey);
        // `overwrite` updates the editable face fields, keeps provenance.
        await this.card
          .updateOne(
            { _id: current?._id ?? { deck: targetDeck._id, dedupeKey: doc.dedupeKey } },
            {
              $set: {
                front: doc.front,
                back: doc.back,
                tags: doc.tags,
                reading: doc.reading,
                partOfSpeech: doc.partOfSpeech,
                examples: doc.examples,
                hanViet: doc.hanViet,
                order: doc.order,
                reviewIssues: doc.reviewIssues,
              },
              $setOnInsert: {
                deck: targetDeck._id,
                dedupeKey: doc.dedupeKey,
                origin: "import",
              },
            },
            { upsert: true },
          )
          .exec();
        overwritten += 1;
      }
    }

    // New cards that came without an example get one generated in the
    // background (id order matches the insert order of `toInsert`).
    const byKey = new Map(toInsert.map((d) => [d.dedupeKey, d]));
    const pending = insertedDocs
      .map((doc) => {
        const src = byKey.get((doc as unknown as { dedupeKey: string }).dedupeKey);
        return src && src.examples.length === 0
          ? {
              id: doc._id,
              deck: targetDeck._id,
              term: src.front,
              meaning: src.back,
              reading: src.reading,
              partOfSpeech: src.partOfSpeech,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // Examples are never generated by the import itself: the admin checks the
    // cards first, then starts generation with the deck's "Tạo ví dụ" button
    // (`examples/:deckId/retry`), which has its own progress and runs on the server.
    return {
      deckId,
      imported,
      skipped,
      overwritten,
      errors,
      needsMeaning,
      needsReview,
      examplesQueued: 0,
      examplesDeferred: pending.length,
      duplicates: dupList,
    };
  }

  // ── internals ───────────────────────────────────────────────────────

  /** Parse + enforce the row cap (T-P3-11's data-side twin). */
  private async parseTable(file: UploadedImportFile): Promise<Table> {
    let table: Table;
    try {
      table = await this.parseFile(file);
    } catch (error) {
      if (error instanceof UnsupportedFormatError) {
        throw new HttpException(
          { statusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE, message: error.detail },
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        );
      }
      if (error instanceof EmptyTableError) {
        throw new UnprocessableEntityException(error.detail);
      }
      throw new UnprocessableEntityException("Cannot parse the import file");
    }

    if (table.rows.length > ImportService.MAX_ROWS) {
      throw new UnprocessableEntityException(
        `File has ${table.rows.length} rows; the limit is ${ImportService.MAX_ROWS} per import`,
      );
    }
    return table;
  }

  private parseTags(raw: string | undefined): string[] {
    if (!raw || !raw.trim()) return [];
    return raw
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
}
