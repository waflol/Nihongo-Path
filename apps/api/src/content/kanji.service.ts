import {
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
import { FilterQuery, Model } from "mongoose";
import { AiExampleService } from "../ai/ai-example.service.js";
import { formatHanViet, hanVietNorm } from "./han-viet-norm.js";
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
   * AI suggestion for a kanji (plan-kanji §5.2): suggests Hán Việt (multiple
   * readings supported), Vietnamese meanings, mnemonic, and translates any
   * untranslated related words. Does NOT auto-publish.
   */
  async generateAi(char: string): Promise<{
    hanViet: string;
    meanings: string[];
    mnemonic: string;
    words: RelatedWord[];
  }> {
    const doc = await this.model.findOne({ char }).exec();
    if (!doc) throw new NotFoundException("Kanji not found");
    await this.fillWordMeanings(doc);
    const curated = loadCuratedHanViet()[char];
    const ai = await this.ai.suggestKanji({
      char: doc.char,
      hanViet: doc.hanViet || curated || "",
      onyomi: doc.onyomi,
      kunyomi: doc.kunyomi,
      meaningsEn: doc.meaningsEn,
    });
    const combinedHv = formatHanViet(
      [doc.hanViet, curated, ...(ai?.hanViet ?? [])].filter(Boolean).join("/"),
    );
    const meanings =
      ai?.meanings && ai.meanings.length > 0
        ? ai.meanings
        : doc.meanings.length > 0
        ? doc.meanings
        : doc.meaningsEn;
    const mnemonic = ai?.mnemonic || doc.mnemonic || "";
    return {
      hanViet: combinedHv || doc.hanViet,
      meanings,
      mnemonic,
      words: doc.words,
    };
  }

  async remove(char: string): Promise<void> {
    const res = await this.model.deleteOne({ char }).exec();
    if (!res.deletedCount) throw new NotFoundException("Kanji not found");
  }
}
