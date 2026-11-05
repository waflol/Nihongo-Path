import {
  Injectable,
  UnprocessableEntityException,
  ConflictException,
  HttpStatus,
  HttpException,
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
  /** Why the row is unusable, when `status === "error"`. */
  error?: string;
}

export interface ImportPreview {
  deckId: string;
  format: Table["format"];
  /** The file's header columns — what the mapping step can choose from. */
  columns: string[];
  totalRows: number;
  okRows: number;
  errorRows: number;
  duplicateRows: number;
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
@Injectable()
export class ImportService {
  /** Hard cap on data rows per import file (the row-count twin of T-P3-11). */
  static readonly MAX_ROWS = 5000;

  constructor(
    @InjectModel("Flashcard")
    private readonly card: Model<FlashcardDocument>,
    @InjectModel("FlashcardDeck")
    private readonly deck: Model<FlashcardDeckDocument>,
    private readonly morph: ReadingService,
  ) {}

  /**
   * Optional card fields of one row: mapped values win; an empty/unmapped
   * hiragana or part-of-speech is derived from the word itself (kanji words
   * get a reading, kana-only/katakana words stay empty).
   */
  private async extras(
    row: Record<string, string>,
    mapping: ColumnMapping,
    front: string,
  ): Promise<{ reading: string; partOfSpeech: Pos; examples: CardExample[] }> {
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
    return { reading, partOfSpeech: pos, examples };
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
  private parseFile(file: UploadedImportFile): Table {
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
    const table = this.parseTable(file);
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
      .select("dedupeKey")
      .exec();
    const existingKeys = new Set(existing.map((c) => c.dedupeKey));

    // Within-file duplicates: a key seen earlier in the same file.
    const seenInFile = new Set<string>();

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
        });
        duplicates += 1;
        seenInFile.add(key);
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
      });
      ok += 1;
      seenInFile.add(key);
    }

    return {
      deckId,
      format: table.format,
      columns: table.columns,
      totalRows: table.rows.length,
      okRows: ok,
      errorRows: errors,
      duplicateRows: duplicates,
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
  ): Promise<ImportConfirmResult> {
    const targetDeck = await this.resolveWritableDeck(caller, deckId);
    const table = this.parseTable(file);

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
      .select("dedupeKey front back")
      .exec();
    const existingKeys = new Set(existing.map((c) => c.dedupeKey));
    const existingByKey = new Map(existing.map((c) => [c.dedupeKey, c]));
    const seenInFile = new Set<string>();

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
      };

      if (seenInFile.has(key)) {
        skipped += 1; // a later copy of the same row in the file
        continue;
      }
      seenInFile.add(key);

      if (existingKeys.has(key)) {
        if (policy === "overwrite") {
          toOverwrite.push(doc);
        } else {
          skipped += 1;
        }
      } else {
        toInsert.push(doc);
      }
    }

    // Insert the new rows in one batched write. A concurrent duplicate (a
    // truly simultaneous second confirm) surfaces as E11000 on the unique
    // index — absorb it as a skip, never crash (P3-IMPORT-04).
    let imported = 0;
    if (toInsert.length > 0) {
      try {
        const res = await this.card.insertMany(
          toInsert as unknown as Document[],
          { ordered: false },
        );
        imported = res.length;
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

    return {
      deckId,
      imported,
      skipped,
      overwritten,
      errors,
    };
  }

  // ── internals ───────────────────────────────────────────────────────

  /** Parse + enforce the row cap (T-P3-11's data-side twin). */
  private parseTable(file: UploadedImportFile): Table {
    let table: Table;
    try {
      table = this.parseFile(file);
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
