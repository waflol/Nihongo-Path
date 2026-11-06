import { createHash, randomUUID } from "node:crypto";
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
import { ReadingService } from "../flashcards/reading.service.js";
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
import { ocrWithRetry, parsePdf, renderPdfPage, tableFromOcrPages } from "./parsers/pdf.js";

/** What the multipart upload hands the service (multer, in-memory). */
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

type Pos = "verb" | "noun" | "adjective" | "";

/** Accepts English, Vietnamese, Japanese and short forms. */
function normalizePos(raw: string | undefined): Pos | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^(verb|v|động từ|dong tu|động|動詞)$/.test(v)) return "verb";
  if (/^(noun|n|danh từ|danh tu|danh|名詞)$/.test(v)) return "noun";
  if (/^(adjective|adj|a|tính từ|tinh tu|tính|形容詞|形容動詞)$/.test(v)) return "adjective";
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
  errors: { rowNumber: number; error: string }[];
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
  file?: UploadedImportFile;
  /** Content hash = key of the parsed table in the PDF cache. */
  key: string;
  /** OCR'd PDFs: rows per page, for the page-by-page review. */
  pages?: { n: number; rows: number; ok: boolean; lostKanji: number }[];
}

/** What the browser sees of a job (never the file bytes). */
export type PdfJobView = Omit<PdfJob, "file" | "userId" | "key">;

function viewOf(j: PdfJob): PdfJobView {
  const { file: _file, userId: _userId, key: _key, ...view } = j;
  void _file;
  void _userId;
  void _key;
  return view;
}

function pagesOf(table: Table): PdfJob["pages"] {
  return table.ocr?.pages.map((p, i) => ({
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
    private readonly morph: ReadingService,
    private readonly exampleSuggest: ExampleSuggestService,
    @Optional() private readonly ai?: AiExampleService,
  ) {}

  /** Parse a PDF (OCR when needed), remembering the table by content hash. */
  private async parsePdfCached(buffer: Buffer, onProgress?: (done: number, total: number) => void): Promise<Table> {
    const key = createHash("sha256").update(buffer).digest("hex");
    const hit = this.pdfCache.get(key);
    if (hit) return hit;
    const table = await parsePdf(buffer, this.ai ? (png, n) => this.ai!.ocrVocabPage(png, n) : undefined, onProgress);
    // Preview runs this twice (columns, then rows): don't pay for OCR twice.
    this.pdfCache.set(key, table);
    if (this.pdfCache.size > 12) this.pdfCache.delete(this.pdfCache.keys().next().value!);
    return table;
  }

  // ── Background PDF reading jobs ─────────────────────────────────────
  // Reading a scanned book through OCR takes minutes, so it runs as a job the
  // browser can leave and come back to. State is in memory (lost on restart).
  private readonly jobs = new Map<string, PdfJob>();

  /** Start (or reuse a finished) PDF read; returns at once. */
  async startPdfJob(caller: AuthUser, file: UploadedImportFile, deckId: string): Promise<PdfJobView> {
    await this.resolveWritableDeck(caller, deckId);
    const now = Date.now();
    for (const [id, j] of this.jobs) if (now - j.createdAt > JOB_TTL_MS) this.jobs.delete(id);
    const mine = [...this.jobs.values()].filter((j) => j.userId === caller.sub);
    if (mine.some((j) => j.status === "running")) {
      throw new ConflictException("Một PDF đang được đọc — đợi nó xong rồi hãy nhập file khác");
    }
    if (mine.length >= 5) {
      const oldest = mine.sort((a, b) => a.createdAt - b.createdAt)[0];
      this.jobs.delete(oldest.id);
    }
    const job: PdfJob = {
      id: randomUUID(),
      userId: caller.sub,
      deckId,
      fileName: file.originalname,
      status: "running",
      done: 0,
      total: 0,
      createdAt: now,
      file,
      key: createHash("sha256").update(file.buffer).digest("hex"),
    };
    this.jobs.set(job.id, job);
    void this.parsePdfCached(file.buffer, (done, total) => {
      job.done = done;
      job.total = total;
    })
      .then((table) => {
        job.status = "done";
        job.rows = table.rows.length;
        job.pages = pagesOf(table);
        job.finishedAt = Date.now();
      })
      .catch((error: unknown) => {
        job.status = "error";
        job.error =
          error instanceof UnsupportedFormatError || error instanceof EmptyTableError
            ? error.detail
            : "Không đọc được file PDF";
        job.finishedAt = Date.now();
        job.file = undefined;
      });
    return viewOf(job);
  }

  listPdfJobs(caller: AuthUser): PdfJobView[] {
    return [...this.jobs.values()]
      .filter((j) => j.userId === caller.sub)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(viewOf);
  }

  getPdfJob(caller: AuthUser, id: string): PdfJobView {
    return viewOf(this.ownJob(caller, id));
  }

  /** The uploaded file of a finished job, so preview/confirm can run without re-uploading. */
  pdfJobFile(caller: AuthUser, id: string): UploadedImportFile {
    const job = this.ownJob(caller, id);
    if (job.status !== "done" || !job.file) {
      throw new ConflictException("PDF này chưa đọc xong hoặc đã hết hạn — hãy chọn lại file");
    }
    return job.file;
  }

  /** One page of the job's PDF as a PNG, so it can be compared with what was read. */
  async pdfJobPageImage(caller: AuthUser, id: string, n: number): Promise<Buffer> {
    const job = this.ownJob(caller, id);
    if (!job.file) throw new NotFoundException("File của tác vụ này đã hết hạn");
    try {
      return await renderPdfPage(job.file.buffer, n);
    } catch (error) {
      if (error instanceof UnsupportedFormatError) throw new NotFoundException(error.detail);
      throw error;
    }
  }

  /** What was read from one page (OCR'd PDFs). */
  pdfJobPageRows(caller: AuthUser, id: string, n: number) {
    const job = this.ownJob(caller, id);
    const page = this.pdfCache.get(job.key)?.ocr?.pages[n - 1];
    if (page === undefined) throw new NotFoundException("Trang này không có dữ liệu OCR");
    return { n, ok: page !== null, rows: (page ?? []).map((r) => ({ ...r, lostKanji: lostKanji(r) })) };
  }

  /** Read one page again (after a failure, or when the result looked wrong). */
  async retryPdfJobPage(caller: AuthUser, id: string, n: number): Promise<PdfJobView> {
    const job = this.ownJob(caller, id);
    const table = this.pdfCache.get(job.key);
    if (job.status !== "done" || !job.file || !table?.ocr || !this.ai) {
      throw new ConflictException("Không đọc lại được trang này (tác vụ đã hết hạn hoặc không phải PDF scan)");
    }
    if (n < 1 || n > table.ocr.pages.length) throw new NotFoundException("Trang không tồn tại");
    const png = await this.pdfJobPageImage(caller, id, n);
    const rows = await ocrWithRetry(png, n, (img) => this.ai!.ocrVocabPage(img, n));
    const pages = [...table.ocr.pages];
    pages[n - 1] = rows;
    const next = tableFromOcrPages(pages);
    this.pdfCache.set(job.key, next);
    job.rows = next.rows.length;
    job.pages = pagesOf(next);
    return viewOf(job);
  }

  private ownJob(caller: AuthUser, id: string): PdfJob {
    const job = this.jobs.get(id);
    if (!job || job.userId !== caller.sub) {
      throw new NotFoundException("Không tìm thấy tác vụ đọc PDF (có thể đã hết hạn)");
    }
    return job;
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
    const hanViet = mapping.hanViet ? (row[mapping.hanViet] ?? "").trim() : "";
    const rawNo = mapping.order ? (row[mapping.order] ?? "").trim().replace(/\.$/, "") : "";
    const order = /^\d{1,6}$/.test(rawNo) ? Number(rawNo) : undefined;
    return { reading, partOfSpeech: pos, examples, hanViet, order };
  }

  /**
   * Per-row extras (reading/POS/examples) for every row that has a front and
   * a back. Computed once up front because the reading is part of a card's
   * duplicate key (kanji + hiragana + meaning).
   */
  private async rowExtras(
    table: Table,
    mapping: ColumnMapping,
  ): Promise<(Awaited<ReturnType<ImportService["extras"]>> | null)[]> {
    const out: (Awaited<ReturnType<ImportService["extras"]>> | null)[] = [];
    for (const row of table.rows) {
      const front = (row[mapping.front] ?? "").trim();
      const back = (row[mapping.back] ?? "").trim();
      out.push(front && back ? await this.extras(row, mapping, front) : null);
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
  ): Promise<ImportPreview> {
    await this.resolveWritableDeck(caller, deckId);
    const table = await this.parseTable(file);
    const targetDeck = await this.resolveWritableDeck(caller, deckId);

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
    const extrasByRow = await this.rowExtras(table, mapping);
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

    const rows: PreviewRow[] = [];
    let ok = 0;
    let errors = 0;
    let duplicates = 0;

    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const rawFront = (row[mapping.front] ?? "").trim();
      const rawBack = (row[mapping.back] ?? "").trim();
      const tags = this.parseTags(row[mapping.tags ?? ""]);

      if (rawFront === "" || rawBack === "") {
        rows.push({
          rowNumber: i + 2,
          front: rawFront,
          back: rawBack,
          tags,
          status: "error",
          error: `missing ${rawFront === "" ? "front" : ""}${rawFront === "" && rawBack === "" ? " & " : ""}${rawBack === "" ? "back" : ""} value`,
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

      rows.push({
        rowNumber: i + 2,
        front: rawFront,
        back: rawBack,
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
  ): Promise<ImportConfirmResult> {
    const targetDeck = await this.resolveWritableDeck(caller, deckId);
    const table = await this.parseTable(file);

    // Rebuild the exact rows the preview showed, in the same order.
    const extrasByRow = await this.rowExtras(table, mapping);
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
    }

    const toInsert: ImportCardDoc[] = [];
    const toOverwrite: ImportCardDoc[] = [];
    let skipped = 0;
    const errors: { rowNumber: number; error: string }[] = [];
    let rowNo = 1;

    for (const [rowIdx, row] of table.rows.entries()) {
      rowNo += 1;
      const front = (row[mapping.front] ?? "").trim();
      const back = (row[mapping.back] ?? "").trim();
      const tags = this.parseTags(row[mapping.tags ?? ""]);

      if (front === "" || back === "") {
        errors.push({ rowNumber: rowNo, error: "front and back are required" });
        continue;
      }

      const extra = extrasByRow[rowIdx]!;
      const key = cardDedupeKey(front, back, extra.reading);
      const doc: ImportCardDoc = {
        deck: targetDeck._id,
        front,
        back,
        tags,
        origin: "import",
        dedupeKey: key,
        reading: extra.reading,
        partOfSpeech: extra.partOfSpeech,
        examples: extra.examples,
        hanViet: extra.hanViet,
        order: extra.order,
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

      if (seenInFile.has(key)) {
        skipped += 1; // a later copy of the same row in the file
        noteDuplicate();
        continue;
      }

      if (existingKeys.has(key)) {
        if (policy === "overwrite") {
          toOverwrite.push(doc);
        } else {
          skipped += 1;
          noteDuplicate();
        }
        seenInFile.set(key, { no: extra.order, rowNumber: rowNo, front, reading: extra.reading, back });
      } else {
        seenInFile.set(key, { no: extra.order, rowNumber: rowNo, front, reading: extra.reading, back });
        toInsert.push(doc);
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
