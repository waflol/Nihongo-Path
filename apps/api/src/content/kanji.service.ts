import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsvSync } from "csv-parse/sync";
import { parseXlsx } from "../import/parsers/xlsx.js";
import type { Table } from "../import/parsers/types.js";
import { buildXlsx } from "./kanji-xlsx.js";
import { FilterQuery, Model } from "mongoose";
import { AiExampleService } from "../ai/ai-example.service.js";
import { formatHanViet, hanVietNorm } from "./han-viet-norm.js";
import { fetchMaziiKanji, type MaziiKanjiReadings } from "./mazii-kanji.js";
import { Flashcard } from "../flashcards/schemas/card.schema.js";
import { Vocabulary } from "./schemas/vocabulary.schema.js";
import { Kanji, type KanjiDocument, type RelatedWord } from "./schemas/kanji.schema.js";
import type { KanjiBulkDto, KanjiDto, KanjiUpdateDto } from "./dto/kanji.dto.js";
import type { PageResult } from "./content.service.js";

export interface KanjiListQuery {
  page?: number;
  limit?: number;
  level?: string[];
  hanViet?: string;
  contains?: string;
  q?: string;
  status?: string;
  missing?: string;
}

export interface KanjiAdminLevelSummary {
  level: string;
  total: number;
  published: number;
  draft: number;
  withHanViet: number;
  withMeaning: number;
  withMnemonic: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lists omit the heavy `strokes` array; the detail route returns it. */
const LIST_PROJECTION = { strokes: 0 };

function loadCuratedHanViet(): Record<string, string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), "..", "..", "packages", "shared", "han-viet.json"),
    join(process.cwd(), "packages", "shared", "han-viet.json"),
    join(here, "..", "..", "..", "..", "packages", "shared", "han-viet.json"),
    join(here, "..", "..", "..", "..", "..", "packages", "shared", "han-viet.json"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as Record<string, string>;
    } catch {
      /* try next candidate */
    }
  }
  return {};
}

/** Columns of the kanji CSV backup (export → import round-trips every field). */
export const KANJI_CSV_COLUMNS = [
  "char", "level", "rank", "status", "hanViet", "onyomi", "kunyomi", "strokeCount",
  "meanings", "meaningsEn", "mnemonic", "radicals", "words", "strokes", "source", "strokeCredit", "lang",
] as const;

const LIST_SEP = " | ";
const splitList = (v: string): string[] =>
  v.split("|").map((x) => x.trim()).filter(Boolean);

/** Workbook / CSV column titles → the field they fill. */
const KANJI_HEADER_ALIAS: Record<string, string> = {
  "Chữ": "char", "Cấp": "level", "STT": "rank", "Trạng thái": "status", "Hán Việt": "hanViet",
  "Onyomi": "onyomi", "Kunyomi": "kunyomi", "Số nét": "strokeCount", "Nghĩa tiếng Việt": "meanings",
  "Nghĩa tiếng Anh": "meaningsEn", "Liên tưởng": "mnemonic", "Bộ thủ": "radicals", "Nguồn": "source",
  "Credit nét vẽ": "strokeCredit", "Ngôn ngữ": "lang",
};
const STATUS_ALIAS: Record<string, "DRAFT" | "PUBLISHED"> = {
  draft: "DRAFT", published: "PUBLISHED", "bản nháp": "DRAFT", "xuất bản": "PUBLISHED", "đã xuất bản": "PUBLISHED",
};
interface KanjiExtra {
  words?: Map<string, RelatedWord[]>;
  strokes?: Map<string, string[]>;
}

export interface KanjiCsvResult {
  rows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { line: number; char: string; message: string }[];
}

@Injectable()
export class KanjiService implements OnModuleInit {
  constructor(
    @InjectModel(Kanji.name) private readonly model: Model<Kanji>,
    @InjectModel(Vocabulary.name) private readonly vocab: Model<Vocabulary>,
    @InjectModel(Flashcard.name) private readonly cards: Model<Flashcard>,
    private readonly ai: AiExampleService,
  ) {}

  /**
   * Best-effort startup sync: upgrade imported kanji that only stored a single
   * Hán Việt reading when `packages/shared/han-viet.json` lists multiple
   * readings (e.g. "trọng" → "trọng/trùng").
   */
  async onModuleInit(): Promise<void> {
    try {
      const curated = loadCuratedHanViet();
      const ops = Object.entries(curated)
        .filter(([, hv]) => hv.includes("/"))
        .map(([char, hv]) => {
          const formatted = formatHanViet(hv);
          const primary = formatted.split("/")[0];
          return {
            updateOne: {
              filter: { char, hanViet: { $in: ["", primary] } },
              update: { $set: { hanViet: formatted, hanVietNorm: hanVietNorm(formatted) } },
            },
          };
        });
      if (ops.length > 0) {
        await this.model.bulkWrite(ops);
      }
    } catch {
      /* never block startup if DB is not connected */
    }
  }

  /**
   * Vietnamese meanings already in the database, by priority: published
   * `vocabulary` entries, then flashcards whose front is the term (optionally
   * followed by "(reading)"). Placeholder import rows ("meaning 1") and
   * empty values are ignored. Returns term → meaning.
   */
  private async knownMeanings(words: { term: string; reading: string }[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const terms = words.map((w) => w.term);
    const clean = (raw: string) =>
      raw.split("\n")[0].replace(/\s*\[[^\]]*\]\s*$/, "").trim();
    const usable = (m: string) => m.length > 0 && !/^meaning\s*\d*$/i.test(m);

    const v = await this.vocab
      .find({ term: { $in: terms }, status: "PUBLISHED" })
      .select("term meaning")
      .lean()
      .exec();
    for (const r of v) {
      const m = clean(r.meaning ?? "");
      if (usable(m) && !out.has(r.term)) out.set(r.term, m);
    }

    const rest = terms.filter((t) => !out.has(t));
    if (rest.length === 0) return out;
    const alt = rest.map(escapeRe).join("|");
    const c = await this.cards
      .find({ $or: [{ front: { $in: rest } }, { front: new RegExp(`^(${alt})\\s*[（(]`) }] })
      .select("front back")
      .limit(200)
      .lean()
      .exec();
    for (const r of c) {
      const term = rest.find((t) => r.front === t || r.front.startsWith(t) && /^\s*[（(]/.test(r.front.slice(t.length)));
      const m = clean(r.back ?? "");
      if (term && usable(m) && !out.has(term)) out.set(term, m);
    }
    return out;
  }

  /**
   * Lazy Vietnamese translation of related words (plan §2.4): on first open
   * of a kanji, words without `meaning` are translated once and persisted,
   * so later opens cost nothing. Failure is silent — English gloss shows.
   */
  private async fillWordMeanings(doc: KanjiDocument): Promise<void> {
    const todo = doc.words.filter((w) => !w.meaning && w.glossEn);
    if (todo.length === 0) return;
    // 1) meanings already stored in the DB; 2) only the rest go to the AI.
    const map = await this.knownMeanings(todo).catch(() => new Map<string, string>());
    const missing = todo.filter((w) => !map.has(w.term));
    if (missing.length > 0) {
      try {
        const ai = await this.ai.translateWords(
          missing.map((w) => ({ term: w.term, reading: w.reading, glossEn: w.glossEn ?? "" })),
        );
        for (const [k, v] of ai ?? []) map.set(k, v);
      } catch {
        // AI unavailable — keep what the DB gave us.
      }
    }
    if (map.size === 0) return;
    for (const w of doc.words) {
      const vi = map.get(w.term);
      if (vi && !w.meaning) {
        w.meaning = vi;
        // Positional-free update so a concurrent admin edit is not clobbered.
        await this.model
          .updateOne({ _id: doc._id, "words.term": w.term, "words.meaning": "" }, { $set: { "words.$.meaning": vi } })
          .exec();
      }
    }
  }

  private buildFilter(query: KanjiListQuery): FilterQuery<KanjiDocument> {
    const and: FilterQuery<KanjiDocument>[] = [];
    const filter: FilterQuery<KanjiDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.level?.length) {
      const mapped = query.level.map((l) => (l === "NONE" ? "" : l));
      filter.level = { $in: mapped };
    }
    if (query.hanViet?.trim()) {
      const tokens = hanVietNorm(query.hanViet)
        .split("/")
        .filter(Boolean)
        .map(escapeRe);
      for (const t of tokens) {
        and.push({
          hanVietNorm: new RegExp(query.contains ? t : `(?:^|[\\/,;\\s]+)${t}`),
        });
      }
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      const qRe = new RegExp(escapeRe(q), "i");
      const hv = hanVietNorm(q)
        .split("/")
        .filter(Boolean)
        .map(escapeRe);
      const or: FilterQuery<KanjiDocument>[] = [
        { char: q.length === 1 ? q : { $in: [...q] } },
        { "words.term": new RegExp(escapeRe(q)) },
        { meanings: qRe },
        { meaningsEn: qRe },
      ];
      if (hv.length > 0) {
        or.push({ hanVietNorm: new RegExp(`(?:^|[\\/,;\\s]+)${hv[0]}`) });
      }
      and.push({ $or: or });
    }
    if (query.missing === "hanViet") {
      and.push({ $or: [{ hanViet: "" }, { hanViet: { $exists: false } }] });
    } else if (query.missing === "meaning") {
      and.push({ "meanings.0": { $exists: false } });
    } else if (query.missing === "mnemonic") {
      and.push({ $or: [{ mnemonic: "" }, { mnemonic: { $exists: false } }] });
    }
    if (and.length > 0) filter.$and = and;
    return filter;
  }

  async list(query: KanjiListQuery): Promise<PageResult<KanjiDocument>> {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50) || 50));
    const filter = this.buildFilter(query);
    const [items, total] = await Promise.all([
      this.model
        .find(filter, LIST_PROJECTION)
        .sort({ rank: 1, char: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  /** Count of PUBLISHED kanji per level, for the public N5–N1 tabs. */
  async levels(): Promise<{ level: string; count: number }[]> {
    const rows = await this.model
      .aggregate<{ _id: string; count: number }>([
        { $match: { status: "PUBLISHED" } },
        { $group: { _id: "$level", count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ])
      .exec();
    return rows.map((r) => ({ level: r._id, count: r.count }));
  }

  /** Admin level summary across N5–N1 (and unassigned): totals, published/draft, and field coverage. */
  async adminLevels(): Promise<KanjiAdminLevelSummary[]> {
    const rows = await this.model
      .aggregate<{
        _id: string;
        total: number;
        published: number;
        draft: number;
        withHanViet: number;
        withMeaning: number;
        withMnemonic: number;
      }>([
        {
          $group: {
            _id: { $ifNull: ["$level", ""] },
            total: { $sum: 1 },
            published: { $sum: { $cond: [{ $eq: ["$status", "PUBLISHED"] }, 1, 0] } },
            draft: { $sum: { $cond: [{ $ne: ["$status", "PUBLISHED"] }, 1, 0] } },
            withHanViet: {
              $sum: {
                $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$hanViet", ""] } }, 0] }, 1, 0],
              },
            },
            withMeaning: {
              $sum: {
                $cond: [{ $gt: [{ $size: { $ifNull: ["$meanings", []] } }, 0] }, 1, 0],
              },
            },
            withMnemonic: {
              $sum: {
                $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$mnemonic", ""] } }, 0] }, 1, 0],
              },
            },
          },
        },
      ])
      .exec();
    const order = ["N5", "N4", "N3", "N2", "N1", ""];
    const byLevel = new Map(rows.map((r) => [r._id ?? "", r]));
    const keys = [...new Set([...order, ...byLevel.keys()])];
    return keys
      .map((level) => {
        const r = byLevel.get(level);
        return {
          level,
          total: r?.total ?? 0,
          published: r?.published ?? 0,
          draft: r?.draft ?? 0,
          withHanViet: r?.withHanViet ?? 0,
          withMeaning: r?.withMeaning ?? 0,
          withMnemonic: r?.withMnemonic ?? 0,
        };
      })
      .filter((x) => order.includes(x.level) || x.total > 0);
  }

  /** On/kun readings (hiragana-able) of up to 60 distinct characters: char → { on, kun }. */
  async readings(chars: string): Promise<Record<string, { on: string[]; kun: string[] }>> {
    const list = [...new Set([...chars].filter((c) => /[\u4e00-\u9fff々]/.test(c)))].slice(0, 60);
    if (list.length === 0) return {};
    const docs = await this.model.find({ char: { $in: list } }, { char: 1, onyomi: 1, kunyomi: 1 }).lean().exec();
    return Object.fromEntries(docs.map((d) => [d.char, { on: d.onyomi ?? [], kun: d.kunyomi ?? [] }]));
  }

  async get(char: string, publishedOnly: boolean): Promise<KanjiDocument> {
    const doc = await this.model
      .findOne(publishedOnly ? { char, status: "PUBLISHED" } : { char })
      .exec();
    if (!doc) throw new NotFoundException("Kanji not found");
    await this.fillWordMeanings(doc);
    return doc;
  }

  async create(input: KanjiDto): Promise<KanjiDocument> {
    if (await this.model.exists({ char: input.char }).exec()) {
      throw new ConflictException("Kanji already exists");
    }
    const hanViet = formatHanViet(input.hanViet ?? "");
    return this.model.create({
      ...input,
      hanViet,
      hanVietNorm: hanVietNorm(hanViet),
      strokeCount: input.strokeCount ?? 0,
      source: "admin",
    });
  }

  async update(char: string, input: KanjiUpdateDto): Promise<KanjiDocument> {
    // `hanVietNorm` is always derived; `char` may be renamed (must stay unique).
    const { char: nextChar, ...rest } = input;
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) update[k] = v;
    const renamed = nextChar?.trim();
    if (renamed && renamed !== char) {
      if (await this.model.exists({ char: renamed }).exec()) {
        throw new ConflictException("Kanji already exists");
      }
      update.char = renamed;
    }
    if (typeof rest.hanViet === "string") {
      const formatted = formatHanViet(rest.hanViet);
      update.hanViet = formatted;
      update.hanVietNorm = hanVietNorm(formatted);
    }
    const doc = await this.model
      .findOneAndUpdate({ char }, { $set: update }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException("Kanji not found");
    return doc;
  }

  /**
   * Every kanji as an Excel workbook: "Kanji" (one row per kanji), "Từ vựng"
   * (one row per related word) and "Nét vẽ" (one row per stroke path). Nothing
   * is dropped, so `importFile` restores a database exactly.
   */
  async exportXlsx(): Promise<Uint8Array> {
    const docs = await this.model.find({}).sort({ rank: 1, char: 1 }).lean().exec();
    const join = (a?: string[]) => (a ?? []).join(LIST_SEP);
    const main = docs.map((d) => [
      d.char, d.level ?? "", d.rank ?? 0, d.status === "PUBLISHED" ? "Xuất bản" : "Bản nháp", d.hanViet ?? "",
      join(d.onyomi), join(d.kunyomi), d.strokeCount ?? 0, join(d.meanings), join(d.meaningsEn),
      d.mnemonic ?? "", join(d.radicals), d.source ?? "", d.strokeCredit ?? "", d.lang ?? "vi",
    ]);
    const words = docs.flatMap((d) =>
      (d.words ?? []).map((w) => [d.char, w.term, w.reading ?? "", w.meaning ?? "", w.glossEn ?? "", w.level ?? ""]),
    );
    const strokes = docs.flatMap((d) => (d.strokes ?? []).map((path, i) => [d.char, i + 1, path]));
    return buildXlsx([
      {
        name: "Kanji",
        columns: [
          { header: "Chữ", width: 8, center: true }, { header: "Cấp", width: 7, center: true },
          { header: "STT", width: 7, center: true }, { header: "Trạng thái", width: 12, center: true },
          { header: "Hán Việt", width: 16 }, { header: "Onyomi", width: 18 }, { header: "Kunyomi", width: 22 },
          { header: "Số nét", width: 8, center: true }, { header: "Nghĩa tiếng Việt", width: 32 },
          { header: "Nghĩa tiếng Anh", width: 28 }, { header: "Liên tưởng", width: 50 }, { header: "Bộ thủ", width: 14 },
          { header: "Nguồn", width: 18 }, { header: "Credit nét vẽ", width: 30 }, { header: "Ngôn ngữ", width: 10, center: true },
        ],
        rows: main,
      },
      {
        name: "Từ vựng",
        columns: [
          { header: "Chữ", width: 8, center: true }, { header: "Từ", width: 16 }, { header: "Cách đọc", width: 18 },
          { header: "Nghĩa tiếng Việt", width: 30 }, { header: "Nghĩa tiếng Anh", width: 40 }, { header: "Cấp", width: 7, center: true },
        ],
        rows: words,
      },
      {
        name: "Nét vẽ",
        columns: [
          { header: "Chữ", width: 8, center: true }, { header: "Nét số", width: 8, center: true },
          { header: "Đường vẽ (SVG path)", width: 90 },
        ],
        rows: strokes,
      },
      {
        name: "Ghi chú",
        table: false,
        columns: [{ header: "Hướng dẫn", width: 110 }],
        rows: [
          ["Đây là bản sao lưu chữ Kanji của Nihongo Path. Dùng nút “Nhập” ở trang Quản lý Kanji để khôi phục vào bất kỳ database nào."],
          ["Sheet “Kanji”: mỗi dòng một chữ (khoá là cột Chữ). Danh sách (Onyomi, Kunyomi, Nghĩa, Bộ thủ) ngăn cách bằng dấu |."],
          ["Sheet “Từ vựng” và “Nét vẽ”: mỗi dòng một từ / một nét; nếu sheet có chữ nào thì danh sách của chữ đó được thay bằng nội dung sheet."],
          ["Đừng đổi tên sheet hoặc tiêu đề cột. Có thể sửa nội dung, thêm dòng chữ mới, hoặc để trống ô để xoá giá trị (trừ Từ vựng/Nét vẽ)."],
        ],
      },
    ]);
  }

  /** Restore from an uploaded file: `.xlsx` (the export) or a CSV with the same columns. */
  async importFile(body: Uint8Array | string): Promise<KanjiCsvResult> {
    if (typeof body !== "string" && body[0] === 0x50 && body[1] === 0x4b) return this.importXlsx(body);
    const text = typeof body === "string" ? body : new TextDecoder().decode(body);
    return this.importCsv(text);
  }

  private async importXlsx(buf: Uint8Array): Promise<KanjiCsvResult> {
    const grid = (t: Table): string[][] => [t.columns, ...t.rows.map((r) => t.columns.map((c) => r[c] ?? ""))];
    let main: Table;
    try {
      main = parseXlsx(buf, "Kanji");
    } catch (e) {
      throw new BadRequestException(`Không đọc được sheet “Kanji”: ${(e as Error).message}`);
    }
    const sheet = (name: string): Table | null => {
      try {
        return parseXlsx(buf, name);
      } catch {
        return null; // the sheet is optional
      }
    };
    const extra: KanjiExtra = {};
    const wordsT = sheet("Từ vựng");
    if (wordsT) {
      extra.words = new Map();
      for (const r of wordsT.rows) {
        const ch = (r["Chữ"] ?? "").trim();
        const term = (r["Từ"] ?? "").trim();
        if (!ch || !term) continue;
        const list = extra.words.get(ch) ?? [];
        list.push({
          term, reading: (r["Cách đọc"] ?? "").trim(), meaning: (r["Nghĩa tiếng Việt"] ?? "").trim(),
          glossEn: (r["Nghĩa tiếng Anh"] ?? "").trim() || undefined, chars: [...term],
          level: (r["Cấp"] ?? "").trim() || undefined,
        });
        extra.words.set(ch, list);
      }
    }
    const strokesT = sheet("Nét vẽ");
    if (strokesT) {
      extra.strokes = new Map();
      const rows = strokesT.rows
        .map((r) => ({ ch: (r["Chữ"] ?? "").trim(), n: Number(r["Nét số"]) || 0, d: (r["Đường vẽ (SVG path)"] ?? "").trim() }))
        .filter((r) => r.ch && r.d)
        .sort((a, b) => a.n - b.n);
      for (const r of rows) extra.strokes.set(r.ch, [...(extra.strokes.get(r.ch) ?? []), r.d]);
    }
    return this.importRecords(grid(main), extra);
  }

  /**
   * Upsert kanji from CSV text (same columns as the workbook's "Kanji" sheet,
   * or the original English names; `words` / `strokes` may be JSON cells).
   */
  async importCsv(text: string): Promise<KanjiCsvResult> {
    let records: string[][];
    try {
      records = parseCsvSync(text, { bom: true, relax_column_count: true, skip_empty_lines: true }) as string[][];
    } catch (e) {
      throw new BadRequestException(`CSV không đọc được: ${(e as Error).message}`);
    }
    return this.importRecords(records);
  }

  /**
   * Upsert kanji from a header + rows grid (only the columns present are
   * written, `char` is required). A row with a bad value is skipped and
   * reported. Empty `words` / `strokes` never wipe existing data.
   */
  private async importRecords(records: string[][], extra: KanjiExtra = {}): Promise<KanjiCsvResult> {
    if (records.length < 2) throw new BadRequestException("File không có dòng dữ liệu");
    const header = records[0].map((h) => KANJI_HEADER_ALIAS[h.trim()] ?? h.trim());
    const col = new Map<string, number>(header.map((h, i) => [h, i]));
    if (!col.has("char")) throw new BadRequestException("File thiếu cột “Chữ” (char)");
    const known = new Set<string>(KANJI_CSV_COLUMNS);
    const result: KanjiCsvResult = { rows: records.length - 1, created: 0, updated: 0, skipped: 0, errors: [] };
    const ops: Parameters<typeof this.model.bulkWrite>[0] = [];
    const fail = (line: number, char: string, message: string) => {
      result.skipped++;
      if (result.errors.length < 30) result.errors.push({ line, char, message });
    };
    records.slice(1).forEach((r, idx) => {
      const line = idx + 2;
      const get = (c: string) => (col.has(c) ? (r[col.get(c)!] ?? "").trim() : undefined);
      const char = (get("char") ?? "").trim();
      if (!char) return; // blank spreadsheet row
      if ([...char].length > 4) return fail(line, char, "chữ Kanji quá dài");
      const set: Record<string, unknown> = {};
      for (const c of known) {
        const v = get(c);
        if (v === undefined || c === "char") continue;
        switch (c) {
          case "level":
            if (v !== "" && !["N5", "N4", "N3", "N2", "N1"].includes(v)) return fail(line, char, `cấp “${v}” không hợp lệ`);
            set.level = v;
            break;
          case "status": {
            const st = STATUS_ALIAS[v.toLowerCase()];
            if (!st) return fail(line, char, `trạng thái “${v}” không hợp lệ`);
            set.status = st;
            break;
          }
          case "rank":
          case "strokeCount": {
            const n = v === "" ? 0 : Number(v);
            if (!Number.isInteger(n) || n < 0) return fail(line, char, `${c} “${v}” không phải số nguyên ≥ 0`);
            set[c] = n;
            break;
          }
          case "hanViet": {
            const f = formatHanViet(v);
            set.hanViet = f;
            set.hanVietNorm = hanVietNorm(f);
            break;
          }
          case "onyomi": case "kunyomi": case "meanings": case "meaningsEn": case "radicals":
            set[c] = splitList(v);
            break;
          case "words":
          case "strokes": {
            if (v === "") break; // never wipe the heavy data with an empty cell
            try {
              const j = JSON.parse(v) as unknown;
              if (!Array.isArray(j)) throw new Error("không phải mảng");
              if (c === "strokes") {
                if (!j.every((x) => typeof x === "string")) throw new Error("nét vẽ phải là chuỗi");
                set.strokes = j;
              } else {
                set.words = j
                  .filter((w): w is Record<string, unknown> => typeof w === "object" && w !== null && typeof (w as Record<string, unknown>).term === "string")
                  .map((w) => ({
                    term: String(w.term),
                    reading: String(w.reading ?? ""),
                    meaning: String(w.meaning ?? ""),
                    glossEn: w.glossEn === undefined ? undefined : String(w.glossEn),
                    chars: Array.isArray(w.chars) ? w.chars.map(String) : [...String(w.term)],
                    level: w.level === undefined ? undefined : String(w.level),
                  }));
              }
            } catch (e) {
              return fail(line, char, `${c}: JSON lỗi (${(e as Error).message})`);
            }
            break;
          }
          default:
            set[c] = v; // mnemonic, source, strokeCredit, lang
        }
      }
      // The "Từ vựng" / "Nét vẽ" sheets replace the lists of the kanji they mention.
      const w = extra.words?.get(char);
      if (w) set.words = w;
      const st = extra.strokes?.get(char);
      if (st) set.strokes = st;
      ops.push({ updateOne: { filter: { char }, update: { $set: set, $setOnInsert: { char } }, upsert: true } });
    });
    for (let i = 0; i < ops.length; i += 500) {
      const res = await this.model.bulkWrite(ops.slice(i, i + 500), { ordered: false });
      result.created += res.upsertedCount ?? 0;
      result.updated += res.matchedCount ?? 0;
    }
    return result;
  }

  async bulkUpdate(dto: KanjiBulkDto): Promise<{ modifiedCount: number }> {
    const filter: FilterQuery<KanjiDocument> = {};
    if (dto.chars?.length) {
      filter.char = { $in: dto.chars };
    } else if (dto.filterLevel !== undefined) {
      filter.level = dto.filterLevel === "NONE" ? "" : dto.filterLevel;
    } else {
      throw new BadRequestException("Provide chars or filterLevel");
    }
    const update: Record<string, unknown> = {};
    if (dto.level !== undefined) update.level = dto.level === "NONE" ? "" : dto.level;
    if (dto.status !== undefined) update.status = dto.status;
    if (Object.keys(update).length === 0) {
      throw new BadRequestException("Provide level or status to update");
    }
    const res = await this.model.updateMany(filter, { $set: update }).exec();
    return { modifiedCount: res.modifiedCount ?? 0 };
  }

  /**
   * AI suggestion for a kanji (plan-kanji §5.2): Vietnamese meanings and a
   * mnemonic only. Hán Việt / on / kun come from the Mazii check. Does NOT
   * auto-publish or save.
   */
  async generateAi(char: string): Promise<{ meanings: string[]; mnemonic: string }> {
    const doc = await this.model.findOne({ char }).exec();
    if (!doc) throw new NotFoundException("Kanji not found");
    const ai = await this.ai.suggestKanji({
      char: doc.char,
      hanViet: doc.hanViet || loadCuratedHanViet()[char] || "",
      onyomi: doc.onyomi,
      kunyomi: doc.kunyomi,
      meaningsEn: doc.meaningsEn,
    });
    const meanings =
      ai?.meanings && ai.meanings.length > 0
        ? ai.meanings
        : doc.meanings.length > 0
        ? doc.meanings
        : doc.meaningsEn;
    return { meanings, mnemonic: ai?.mnemonic || doc.mnemonic || "" };
  }

  /** Look the kanji up on Mazii (javi) and return its Hán Việt / on / kun readings. Does not save. */
  async checkMazii(char: string): Promise<MaziiKanjiReadings> {
    let found: MaziiKanjiReadings | null;
    try {
      found = await fetchMaziiKanji(char);
    } catch {
      throw new BadGatewayException("Không kết nối được Mazii");
    }
    if (!found) throw new NotFoundException(`Mazii không có chữ ${char}`);
    return found;
  }

  /** Every kanji character in the database, in learning order. */
  async allChars(): Promise<string[]> {
    const docs = await this.model.find({}, { char: 1 }).sort({ rank: 1, char: 1 }).lean().exec();
    return docs.map((d) => d.char);
  }

  /** Check the kanji on Mazii and save its Hán Việt / on / kun (only the fields Mazii returned). */
  async syncFromMazii(char: string): Promise<MaziiKanjiReadings> {
    if (!(await this.model.exists({ char }).exec())) throw new NotFoundException("Kanji not found");
    const m = await this.checkMazii(char);
    const patch: KanjiUpdateDto = {};
    if (m.hanViet) patch.hanViet = m.hanViet;
    if (m.onyomi.length) patch.onyomi = m.onyomi;
    if (m.kunyomi.length) patch.kunyomi = m.kunyomi;
    if (Object.keys(patch).length) await this.update(char, patch);
    return m;
  }

  async remove(char: string): Promise<void> {
    const res = await this.model.deleteOne({ char }).exec();
    if (!res.deletedCount) throw new NotFoundException("Kanji not found");
  }
}
