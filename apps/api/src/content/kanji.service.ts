import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { AiExampleService } from "../ai/ai-example.service.js";
import { hanVietNorm } from "./han-viet-norm.js";
import { Flashcard } from "../flashcards/schemas/card.schema.js";
import { Vocabulary } from "./schemas/vocabulary.schema.js";
import { Kanji, type KanjiDocument } from "./schemas/kanji.schema.js";
import type { KanjiDto, KanjiUpdateDto } from "./dto/kanji.dto.js";
import type { PageResult } from "./content.service.js";

export interface KanjiListQuery {
  page?: number;
  limit?: number;
  level?: string[];
  hanViet?: string;
  contains?: string;
  q?: string;
  status?: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lists omit the heavy `strokes` array; the detail route returns it. */
const LIST_PROJECTION = { strokes: 0 };

@Injectable()
export class KanjiService {
  constructor(
    @InjectModel(Kanji.name) private readonly model: Model<Kanji>,
    @InjectModel(Vocabulary.name) private readonly vocab: Model<Vocabulary>,
    @InjectModel(Flashcard.name) private readonly cards: Model<Flashcard>,
    private readonly ai: AiExampleService,
  ) {}

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
    const filter: FilterQuery<KanjiDocument> = {};
    if (query.status) filter.status = query.status;
    if (query.level?.length) filter.level = { $in: query.level };
    if (query.hanViet?.trim()) {
      const norm = escapeRe(hanVietNorm(query.hanViet));
      filter.hanVietNorm = new RegExp(query.contains ? norm : `^${norm}`);
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      filter.$or = [
        { char: q.length === 1 ? q : { $in: [...q] } },
        { "words.term": new RegExp(escapeRe(q)) },
      ];
    }
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

  /** Count of PUBLISHED kanji per level, for the N5–N1 tabs. */
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
    return this.model.create({
      ...input,
      hanVietNorm: hanVietNorm(input.hanViet ?? ""),
      source: "admin",
    });
  }

  async update(char: string, input: KanjiUpdateDto): Promise<KanjiDocument> {
    // `char` is the key, never rewritable; `hanVietNorm` is always derived.
    const { char: _ignored, ...rest } = input;
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) update[k] = v;
    if (typeof rest.hanViet === "string") {
      update.hanVietNorm = hanVietNorm(rest.hanViet);
    }
    const doc = await this.model
      .findOneAndUpdate({ char }, { $set: update }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException("Kanji not found");
    return doc;
  }

  async remove(char: string): Promise<void> {
    const res = await this.model.deleteOne({ char }).exec();
    if (!res.deletedCount) throw new NotFoundException("Kanji not found");
  }
}
