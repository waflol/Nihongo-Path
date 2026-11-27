import { correctHanViet, correctHanVietPartial, hanVietFits, harmonizeHanViet, norm as hvNorm, setKanjiHanViet, suggestHanViet } from "../import/han-viet-suggest.js";
import { createHash } from "node:crypto";
import { readingFitsKanji } from "../import/kanji-reading.js";
import { ensureKanjiTables } from "../import/kanji-table.js";
import { ReadingService, WORD_NOTE_RE, readingVariants, splitStrayReading } from "./reading.service.js";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  type OnModuleInit,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { HanVietCheckLogDocument } from "./schemas/han-viet-check-log.schema.js";
import { Model, Types } from "mongoose";
import {
  FlashcardDeck,
  type DeckStatus,
  type FlashcardDeckDocument,
} from "./schemas/deck.schema.js";
import {
  CardOrigin,
  type CardExample,
  type FlashcardDocument,
} from "./schemas/card.schema.js";
import { CONTENT_ADMIN } from "../common/roles.js";
import type { AuthUser } from "../auth/auth.types.js";
import { isHiraganaWord, isKatakanaWord, normalizeWord, stripNa, stripNaReading, toHiragana, toKatakana } from "../import/normalize-word.js";
import { derivePartsOfSpeech, primaryPos } from "../import/parts-of-speech.js";
import { readingOfTokens, splitVariants, splitWordNote } from "../import/word-note.js";
import { fetchMaziiWord, type MaziiWord } from "../import/mazii-word.js";
import { cardDedupeKey, cardDedupeKeyForCopy } from "./dedupe.js";
import { ExampleSuggestService } from "./example-suggest.service.js";
import { AiResultCacheService } from "../ai/ai-result-cache.service.js";
import type { KanjiDocument } from "../content/schemas/kanji.schema.js";
import type { VocabularyDocument } from "../content/schemas/vocabulary.schema.js";
import type { GrammarPointDocument } from "../content/schemas/grammar-point.schema.js";
import type { UserCardProgressDocument } from "../srs/schemas/progress.schema.js";

/** Personal deck write input (the caller's own deck). */
/** Which card field an import warning is about. */
export type ReviewField = "hanViet" | "reading" | "back";
/** Which cards the "Cần xem xét" list shows: every warning, or the ones about one field. */
export type ReviewFilter = "all" | ReviewField;
/** What a whole-deck re-check covers: one field, all three, or reading + meaning together (one AI pass). */
export type RecheckField = ReviewFilter | "readingBack";

/** The field a warning text is about (the wording is written by the import / the checks). */
export const reviewFieldOf = (t: string): ReviewField => (/^Hán Việt/.test(t) ? "hanViet" : /^cách đọc/.test(t) ? "reading" : "back");

/** The warning for a reading that holds words which are not a reading (e.g. Vietnamese from the meaning column). */
export function strayReadingIssue(reading: string, stray: string, kana: string): string {
  return `cách đọc “${reading}” lẫn chữ không phải cách đọc: “${stray}”${kana ? ` (gợi ý: ${kana})` : ""}`;
}

/**
 * The fields a person corrected by hand in one edit: the value changed and the change is not the
 * check's own suggestion being applied (`resolve`). With or without a warning on the field.
 */
export function userFixedFields(
  before: { reading: string; back: string; hanViet: string },
  after: { reading: string; back: string; hanViet: string },
  resolve?: ReviewField,
): ReviewField[] {
  return (["reading", "back", "hanViet"] as const).filter((f) => f !== resolve && after[f].trim() !== before[f].trim());
}

/**
 * Is this card a word from the learned vocabulary — every reading on it was confirmed by a person
 * for the word? Then the AI check leaves it alone by default. `meaningLearned` says whether the
 * card's meaning is also one a person tied to the word (so the meaning check is skipped too).
 */
export function learnedVocab(
  variants: string[],
  confirmed: string[],
  meaning: string,
  meanings: { reading: string; meaning: string }[],
  norm: (t: string) => string,
): { reading: boolean; meaning: boolean } {
  const reading = variants.length > 0 && variants.every((v) => confirmed.includes(v));
  const mine = norm(meaning);
  return { reading, meaning: reading && !!mine && meanings.some((x) => norm(x.meaning) === mine) };
}

/** Mongo clause selecting the cards with a warning of the given kind. */
function reviewClause(f: ReviewFilter): Record<string, unknown> {
  if (f === "hanViet") return { reviewIssues: { $regex: /^Hán Việt/ } };
  if (f === "reading") return { reviewIssues: { $regex: /^cách đọc/ } };
  if (f === "back") return { reviewIssues: { $elemMatch: { $not: /^(Hán Việt|cách đọc)/ } } };
  return { "reviewIssues.0": { $exists: true } };
}

export interface DeckWriteInput {
  title: string;
  summary?: string;
  level?: string;
  pillar?: "vocab" | "grammar" | "kanji";
  systemKey?: string;
  category?: string;
  lang?: string;
  /** `DRAFT` | `PUBLISHED` — validated by the DTO's `@IsIn` + the schema. */
  status?: DeckStatus;
}

/** Trim examples and drop blank ones. */
function cleanExamples(list: CardExample[] | undefined): CardExample[] {
  return (list ?? [])
    .map((e) => ({
      sentence: (e.sentence ?? "").trim(),
      translation: (e.translation ?? "").trim(),
    }))
    .filter((e) => e.sentence !== "");
}

/** Personal card write input (in the caller's own deck). */
export interface CardWriteInput {
  deckId: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: "verb" | "noun" | "adjective" | "adjective-na" | "adverb" | "phrase" | "";
  partsOfSpeech?: string[];
  note?: string;
  examples?: CardExample[];
  tags?: string[];
  /** `manual` (default) or `saved` — provenance only; never `import` here. */
  origin?: Exclude<CardOrigin, "import">;
}

/**
 * The deck shape the API returns to clients: the deck's own fields plus the
 * card count. A **plain object** (not a Mongoose document) — the UI only
 * reads these fields, and spreading a document would drop its prototype
 * methods from the type.
 */
export interface DeckView {
  _id: string;
  title: string;
  summary?: string;
  level?: string;
  pillar?: "vocab" | "grammar" | "kanji";
  systemKey?: string;
  category?: string;
  lang: string;
  status: string;
  shared: boolean;
  user: string | null;
  cardCount: number;
  /** Set while example sentences are being generated after an import. */
  examples: { total: number; done: number; paused: boolean } | null;
  /** The deck stays a draft until the examples are ready, then publishes. */
  createdAt: string;
  updatedAt: string;
}

export interface SavedVocabCard {
  card: FlashcardDocument;
  /** `false` when the card already existed in the deck (idempotent save). */
  created: boolean;
}

/**
 * Personal-deck CRUD + "save a word while learning" (P3-CARD-03/04).
 *
 * Ownership model (database.md "flashcard_decks"):
 * - **Personal decks** (`shared: false`) are private: only the owner reads or
 *   writes them (T-P3-07).
 * - **Shared decks** (`shared: true`) are admin-authored and read-only for
 *   any signed-in user (T-P3-08); admins may create/update them.
 *
 * "Save a word" (spec §4.2) wraps a content entry on a new card but never
 * writes to the content collection itself — the card keeps its own `front`/
 * `back` so the study engine is self-contained (P3-CARD-02).
 */
/** Most cards one bulk "áp dụng / bỏ qua tất cả" request settles. */
const BULK_REVIEW_MAX = 5000;

@Injectable()
export class FlashcardsService implements OnModuleInit {
  constructor(
    @InjectModel("FlashcardDeck")
    private readonly deck: Model<FlashcardDeckDocument>,
    @InjectModel("Flashcard")
    private readonly card: Model<FlashcardDocument>,
    @InjectModel("UserCardProgress")
    private readonly progress: Model<UserCardProgressDocument>,
    @InjectModel("Vocabulary")
    private readonly vocabulary: Model<VocabularyDocument>,
    @InjectModel("GrammarPoint")
    private readonly grammar: Model<GrammarPointDocument>,
    private readonly exampleSuggest: ExampleSuggestService,
    @Optional() private readonly aiCache?: AiResultCacheService,
    @Optional() private readonly morph?: ReadingService,
    @Optional() @InjectModel("Kanji") private readonly kanji?: Model<KanjiDocument>,
    @Optional() @InjectModel("HanVietCheckLog") private readonly hvLog?: Model<HanVietCheckLogDocument>,
  ) {}

  /**
   * The import warnings of a card as actionable items: which field each is
   * about and, where one can be worked out, the value that would fix it
   * (Hán Việt from the curated table, reading from the analyser).
   */
  private ensureKanjiTable(): Promise<void> {
    return ensureKanjiTables(this.kanji);
  }

  private async reviewItems(c: FlashcardDocument): Promise<{ text: string; field: ReviewField; fix?: string }[]> {
    const out: { text: string; field: ReviewField; fix?: string }[] = [];
    for (const text of c.reviewIssues ?? []) {
      const field: ReviewField = /^Hán Việt/.test(text) ? "hanViet" : /^cách đọc/.test(text) ? "reading" : "back";
      let fix: string | undefined;
      // A warning written by the AI's check carries its own suggestion.
      const aiRaw = /\((?:AI|Mazii) gợi ý: (.+)\)$/.exec(text)?.[1];
      // Older warnings may carry the ký spelling: show it as kí, like everywhere else.
      const ai = aiRaw && field === "hanViet" ? harmonizeHanViet(c.front, aiRaw) : aiRaw;
      if (ai) {
        const cur = field === "hanViet" ? c.hanViet : field === "reading" ? c.reading : c.back;
        if (ai !== (cur ?? "") && (field !== "hanViet" || hanVietFits(c.front, ai))) fix = ai;
      } else if (field === "hanViet") {
        // The whole word from the table, else the syllables the table can vouch for (a kanji it lacks stays as written).
        const v = suggestHanViet(c.front) || (c.hanViet ? (correctHanVietPartial(c.front, c.hanViet) ?? "") : "");
        if (v && v !== (c.hanViet ?? "")) fix = v;
      } else if (field === "reading" && splitStrayReading(c.reading).stray) {
        // Vietnamese words in the reading: the fix is the reading without them.
        const kana = splitStrayReading(c.reading).kana;
        if (kana) fix = kana;
      } else if (field === "reading" && this.morph && !/có thể từ đúng là|Mazii có “/.test(text)) {
        try {
          const a = await this.morph.analyze(c.front.replace(WORD_NOTE_RE, ""));
          // The card's reading is one this word is known to have (人気 = にんき / ひとけ): nothing to warn about.
          if (a.readings.length > 0 && readingVariants(c.reading).some((r) => a.readings.includes(r))) continue;
          if (a.reading && a.reading !== (c.reading ?? "")) fix = a.reading;
        } catch {
          /* analyser unavailable — no suggestion */
        }
      }
      out.push({ text, field, fix });
    }
    return out;
  }

  /**
   * One-off, idempotent: cards that have a reading were keyed on
   * (front, back) only. Re-key them on (front, back, reading) so duplicate
   * detection means "same kanji + hiragana + meaning". A re-key that would
   * collide falls back to the id-scoped key (same as an edited copy).
   */
  async onModuleInit(): Promise<void> {
    try {
      const cursor = this.card
        .find({ reading: { $exists: true, $ne: "" } })
        .select("front back reading dedupeKey")
        .cursor();
      for await (const c of cursor) {
        const canonical = cardDedupeKey(c.front, c.back, c.reading ?? "");
        const copy = cardDedupeKeyForCopy(c.front, c.back, String(c._id), c.reading ?? "");
        if (c.dedupeKey === canonical || c.dedupeKey === copy) continue;
        try {
          await this.card.updateOne({ _id: c._id }, { $set: { dedupeKey: canonical } }).exec();
        } catch {
          await this.card.updateOne({ _id: c._id }, { $set: { dedupeKey: copy } }).exec();
        }
      }
    } catch {
      /* best effort — never block startup */
    }
  }

  // ── Decks ───────────────────────────────────────────────────────────

  /**
   * List the caller's decks: their personal decks + all published shared
   * decks. Personal decks of other users are never returned (T-P3-07).
   *
   * Each deck carries its `cardCount` so the UI can show "12 thẻ" without a
   * second request per deck (P3-UI-03).
   */
  /**
   * Decks of the caller whose example sentences are being generated in the
   * background (own personal decks; for an admin also the shared ones) — feeds
   * the progress popup that follows the user around the site.
   */
  async exampleJobs(
    caller: AuthUser,
  ): Promise<{ deckId: string; title: string; shared: boolean; total: number; done: number; paused: boolean }[]> {
    const mine: Record<string, unknown>[] = [{ user: new Types.ObjectId(caller.sub), shared: false }];
    if (this.isAdmin(caller)) mine.push({ shared: true });
    const decks = await this.deck
      .find({ exampleTotal: { $gt: 0 }, $or: mine })
      .select("title shared exampleTotal exampleDone examplePaused")
      .sort({ _id: -1 })
      .limit(20)
      .lean()
      .exec();
    return decks.map((d) => ({
      deckId: String(d._id),
      title: d.title,
      shared: d.shared === true,
      total: d.exampleTotal ?? 0,
      done: Math.min(d.exampleDone ?? 0, d.exampleTotal ?? 0),
      paused: d.examplePaused === true,
    }));
  }

  async listDecks(caller: AuthUser): Promise<DeckView[]> {
    const [personal, shared] = await Promise.all([
      this.deck
        .find({ user: new Types.ObjectId(caller.sub), shared: false })
        .sort({ _id: -1 })
        .exec(),
      this.deck
        .find({ shared: true, status: "PUBLISHED" })
        .sort({ _id: -1 })
        .exec(),
    ]);
    const decks = [...personal, ...shared];

    const counts = await this.card
      .aggregate([
        { $match: { deck: { $in: decks.map((d) => d._id) } } },
        { $group: { _id: "$deck", cardCount: { $sum: 1 } } },
      ])
      .exec();
    const byDeck = new Map(counts.map((c) => [String(c._id), c.cardCount]));
    return decks.map((d) => this.toDeckView(d, byDeck.get(String(d._id)) ?? 0));
  }

  /**
   * Read one deck. Shared decks must be PUBLISHED; a personal deck is only
   * readable by its owner or an admin (T-P3-07).
   */
  async getDeck(caller: AuthUser, id: string): Promise<FlashcardDeckDocument> {
    const doc = await this.findOneDeck(id);
    if (doc.shared) {
      if (doc.status !== "PUBLISHED" && !this.isAdmin(caller)) {
        throw new NotFoundException("Deck not available");
      }
      return doc;
    }
    if (String(doc.user) !== caller.sub && !this.isAdmin(caller)) {
      throw new ForbiddenException("Cannot access another user's deck");
    }
    return doc;
  }

  /** `getDeck` plus its `cardCount`, so the card manager's header can show "N thẻ". */
  async getDeckWithCount(caller: AuthUser, id: string): Promise<Record<string, unknown>> {
    const doc = await this.getDeck(caller, id);
    const cardCount = await this.card.countDocuments({ deck: doc._id }).exec();
    return { ...doc.toObject(), cardCount };
  }

  /**
   * Create a personal deck for the caller. Admins may instead seed a shared
   * deck by passing `shared: true` (that is the import path, P3-IMPORT-04,
   * but hand-created shared decks work the same way).
   */
  async createDeck(
    caller: AuthUser,
    input: DeckWriteInput & { shared?: boolean },
  ): Promise<FlashcardDeckDocument> {
    const shared = input.shared ?? false;
    if (shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Only admins create shared decks");
    }
    return this.deck.create({
      title: input.title,
      summary: input.summary,
      level: input.level,
      category: input.category,
      lang: input.lang,
      status: input.status ?? "DRAFT",
      shared,
      // Shared decks have no owner; personal decks belong to the caller.
      user: shared ? null : new Types.ObjectId(caller.sub),
    });
  }

  /** Update the caller's own personal deck (never a shared one here). */
  async updateDeck(
    caller: AuthUser,
    id: string,
    input: Partial<DeckWriteInput>,
  ): Promise<FlashcardDeckDocument> {
    const doc = await this.getDeck(caller, id);
    if (doc.shared) {
      // Shared decks are the admin content surface — only admins edit them.
      if (!this.isAdmin(caller)) {
        throw new ForbiddenException("Shared decks are admin-managed");
      }
    }
    const update: Partial<FlashcardDeck> = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.summary !== undefined) update.summary = input.summary;
    if (input.level !== undefined) update.level = input.level;
    if (input.category !== undefined) update.category = input.category;
    if (input.lang !== undefined) update.lang = input.lang;
    if (input.status !== undefined) update.status = input.status;
    const res = await this.deck
      .findByIdAndUpdate(doc._id, update, { new: true, runValidators: true })
      .exec();
    if (!res) throw new NotFoundException("Deck not found");
    return res;
  }

  /** Delete the caller's own personal deck; cascade its cards + progress. */
  async deleteDeck(caller: AuthUser, id: string): Promise<void> {
    const doc = await this.getDeck(caller, id);
    if (doc.shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Shared decks are admin-managed");
    }
    // Cascade (T-P3-10): this deck's cards, then any progress pointing at
    // those cards, then the deck itself.
    const cards = await this.card
      .find({ deck: doc._id }, { _id: 1 })
      .exec();
    if (cards.length > 0) {
      await this.progress
        .deleteMany({ card: cards.map((c) => c._id) })
        .exec();
    }
    await this.card.deleteMany({ deck: doc._id }).exec();
    await this.deck.deleteOne({ _id: doc._id }).exec();
  }

  // ── Export ──────────────────────────────────────────────────────────

  /**
   * One deck as a UTF-8 CSV (BOM so Excel reads Japanese) with the SAME
   * columns the import wizard understands — an export can be re-imported:
   * `front,back,reading,partOfSpeech,example,exampleTranslation,tags`.
   * Several examples are joined with `|`. No row cap.
   */
  async exportDeckCsv(
    caller: AuthUser,
    deckId: string,
  ): Promise<{ filename: string; csv: string }> {
    const deck = await this.getDeck(caller, deckId);
    const cards = await this.card
      .find({ deck: deck._id })
      .sort({ _id: 1 })
      .lean()
      .exec();

    const cell = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    const header = [
      "front",
      "back",
      "reading",
      "partOfSpeech",
      "hanViet",
      "order",
      "example",
      "exampleTranslation",
      "tags",
    ];
    const lines = [header.map(cell).join(",")];
    for (const c of cards) {
      const ex = c.examples ?? [];
      lines.push(
        [
          c.front,
          c.back,
          c.reading ?? "",
          c.partOfSpeech ?? "",
          c.hanViet ?? "",
          c.order != null ? String(c.order) : "",
          ex.map((e) => e.sentence).join(" | "),
          ex.map((e) => e.translation ?? "").join(" | "),
          (c.tags ?? []).join(", "),
        ]
          .map(cell)
          .join(","),
      );
    }

    const slug =
      deck.title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "bo-the";
    return { filename: `${slug}.csv`, csv: "\uFEFF" + lines.join("\r\n") + "\r\n" };
  }

  // ── Cards ───────────────────────────────────────────────────────────

  /** Cards in a deck the caller may read (same rules as `getDeck`). */
  async listCards(
    caller: AuthUser,
    deckId: string,
    limit = 100,
  ): Promise<FlashcardDocument[]> {
    await this.getDeck(caller, deckId);
    return this.card
      .find({ deck: new Types.ObjectId(deckId) })
      .sort({ order: 1, _id: 1 })
      .limit(limit)
      .exec();
  }

  /** Mongo filter for the card-manager list: text search, one tag, "no example". */
  private cardFilter(
    deckId: string,
    f: { q?: string; tag?: string; missing?: boolean; pos?: string; card?: string; review?: ReviewFilter },
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { deck: new Types.ObjectId(deckId) };
    if (f.card && Types.ObjectId.isValid(f.card)) filter._id = new Types.ObjectId(f.card);
    const q = f.q?.trim();
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ front: rx }, { back: rx }, { reading: rx }, { hanViet: rx }];
    }
    if (f.tag) filter.tags = f.tag;
    if (f.missing) filter.examples = { $size: 0 };
    // A part of speech: the primary one or any of the extra ones (`noun-suru` lives only in the list).
    if (f.pos) filter.$and = [f.pos === "noun-suru" ? { partsOfSpeech: "noun-suru" } : { $or: [{ partOfSpeech: f.pos }, { partsOfSpeech: f.pos }] }];
    if (f.review) Object.assign(filter, reviewClause(f.review));
    return filter;
  }

  /**
   * One page of a deck's cards for the card manager, with the filter applied
   * server-side (decks can hold thousands of cards) plus every tag in the deck
   * with its card count.
   */
  async pageCards(
    caller: AuthUser,
    deckId: string,
    opts: { page: number; pageSize: number; q?: string; tag?: string; missing?: boolean; pos?: string; card?: string; review?: ReviewFilter },
  ): Promise<{
    items: FlashcardDocument[];
    total: number;
    missingExamples: number;
    needsReview: number;
    needsReviewBy: Record<ReviewField, number>;
    tags: { tag: string; count: number }[];
  }> {
    await this.getDeck(caller, deckId);
    const filter = this.cardFilter(deckId, opts);
    const deckOid = new Types.ObjectId(deckId);
    const [items, total, missingExamples, needsReview, byHanViet, byReading, byBack, tagRows] = await Promise.all([
      this.card
        .find(filter)
        .sort({ order: 1, _id: 1 })
        .skip((opts.page - 1) * opts.pageSize)
        .limit(opts.pageSize)
        .exec(),
      this.card.countDocuments(filter).exec(),
      this.card.countDocuments({ deck: deckOid, examples: { $size: 0 } }).exec(),
      this.card.countDocuments({ deck: deckOid, ...reviewClause("all") }).exec(),
      this.card.countDocuments({ deck: deckOid, ...reviewClause("hanViet") }).exec(),
      this.card.countDocuments({ deck: deckOid, ...reviewClause("reading") }).exec(),
      this.card.countDocuments({ deck: deckOid, ...reviewClause("back") }).exec(),
      this.card
        .aggregate<{ _id: string; count: number }>([
          { $match: { deck: deckOid } },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ])
        .exec(),
    ]);
    if (items.some((c) => (c.reviewIssues?.length ?? 0) > 0)) await this.ensureKanjiTable();
    return {
      items: await Promise.all(
        items.map(async (c) =>
          (c.reviewIssues?.length ?? 0) > 0
            ? Object.assign(c.toObject(), { reviewItems: await this.reviewItems(c) })
            : c,
        ),
      ) as FlashcardDocument[],
      total,
      missingExamples,
      needsReview,
      needsReviewBy: { hanViet: byHanViet, reading: byReading, back: byBack },
      tags: tagRows.map((t) => ({ tag: t._id, count: t.count })),
    };
  }

  /**
   * Words of a deck whose card still has NO example although the AI already
   * answered for that word (the answer is saved, but it was not accepted onto
   * the card — e.g. the sentence failed the "really uses this word" check, or
   * the card was cleared afterwards). Lets an admin see what the AI produced
   * and add it by hand.
   */
  async aiUnusedExamples(
    caller: AuthUser,
    deckId: string,
    limit = 500,
  ): Promise<{
    total: number;
    items: {
      cardId: string;
      front: string;
      reading: string;
      back: string;
      kind: string;
      ja: string;
      vi: string;
      matches?: boolean;
      /** Why this answer is not on the card yet. */
      reason: string;
      /** True when the answer is fine and only needs the generation to be run again. */
      usable: boolean;
      service: string;
      model: string;
      createdAt: Date;
    }[];
  }> {
    await this.getDeck(caller, deckId);
    const empty = await this.card
      .find({ deck: new Types.ObjectId(deckId), examples: { $size: 0 } })
      .select("front back reading partsOfSpeech")
      .sort({ order: 1, _id: 1 })
      .lean()
      .exec();
    // The AI is asked about the word without its parenthesised note.
    const termOf = (front: string) => front.replace(/[（(][^）)]*[）)]/g, "").trim();
    const byTerm = new Map<string, typeof empty>();
    for (const c of empty) {
      const t = termOf(c.front);
      byTerm.set(t, [...(byTerm.get(t) ?? []), c]);
    }
    const answers = (await this.aiCache?.findByTerms([...byTerm.keys()])) ?? [];
    const items = [];
    for (const a of answers) {
      // Only an answer that carries a usable sentence: a written one (`ja`) or a translation.
      if (!a.vi?.trim()) continue;
      for (const c of byTerm.get(a.term) ?? []) {
        // Judged against this very card (its reading counts as a written form of the word).
        let reason = "";
        let usable = false;
        if (a.kind === "write") {
          const check = await this.exampleSuggest.checkAiSentence(a.term, c.reading, a.ja ?? "", (c.partsOfSpeech ?? []).includes("noun-suru"));
          usable = check.ok;
          reason = check.reason;
        } else if (a.matches === false) {
          reason = "AI báo từ không dùng đúng nghĩa trong câu Tatoeba tìm được";
        } else {
          usable = true;
        }
        items.push({
          cardId: String(c._id),
          front: c.front,
          reading: c.reading ?? "",
          back: c.back,
          kind: a.kind,
          ja: a.ja ?? "",
          vi: a.vi,
          matches: a.matches,
          reason:
            reason ||
            "Câu hợp lệ nhưng thẻ chưa được cập nhật (kết quả lưu sau lần chạy trước) — bấm “Tạo ví dụ” để áp dụng",
          usable,
          service: a.service,
          model: a.model ?? "",
          createdAt: a.createdAt,
        });
      }
    }
    return { total: items.length, items: items.slice(0, limit) };
  }

  /**
   * "Áp dụng tất cả" / "Bỏ qua tất cả": settle one kind of import warning (Hán Việt, reading
   * or meaning) on many cards at once — an explicit id list, or every card of the deck that
   * still has that warning (narrowed by the manager's search / tag filter). `apply` takes each
   * card's suggested fix (a card without one is skipped); `dismiss` keeps the card as it is
   * (and, for readings, teaches the analyser). Capped so one request stays bounded.
   */
  async bulkResolveReview(
    caller: AuthUser,
    deckId: string,
    input: {
      field: ReviewField;
      action: "apply" | "dismiss";
      ids?: string[];
      filter?: { q?: string; tag?: string; missing?: boolean; pos?: string };
    },
  ): Promise<{ matched: number; applied: number; dismissed: number; skipped: number }> {
    const deck = await this.getDeck(caller, deckId);
    if (deck.shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Only admins modify shared-deck cards");
    }
    let match: Record<string, unknown>;
    if (input.ids && input.ids.length > 0) {
      let oids: Types.ObjectId[];
      try {
        oids = input.ids.map((i) => new Types.ObjectId(i));
      } catch {
        throw new BadRequestException("Invalid card id");
      }
      match = { deck: deck._id, _id: { $in: oids }, ...reviewClause(input.field) };
    } else {
      match = this.cardFilter(deckId, { ...(input.filter ?? {}), review: input.field });
    }
    const cards = await this.card.find(match).sort({ order: 1, _id: 1 }).limit(BULK_REVIEW_MAX).exec();
    await this.ensureKanjiTable();
    let applied = 0;
    let dismissed = 0;
    let skipped = 0;
    for (let i = 0; i < cards.length; i += 10) {
      await Promise.all(
        cards.slice(i, i + 10).map(async (c) => {
          try {
            if (input.action === "dismiss") {
              await this.updateCard(caller, String(c._id), { resolve: input.field });
              dismissed++;
              return;
            }
            const fix = (await this.reviewItems(c)).find((it) => it.field === input.field && it.fix)?.fix;
            if (!fix) {
              skipped++;
              return;
            }
            await this.updateCard(caller, String(c._id), { [input.field]: fix, resolve: input.field });
            applied++;
          } catch {
            skipped++;
          }
        }),
      );
    }
    return { matched: cards.length, applied, dismissed, skipped };
  }

  /**
   * Add and/or remove tags on many cards at once — either an explicit id list
   * or everything matching a filter (so "select all 4861" needs no id list).
   */
  async bulkTags(
    caller: AuthUser,
    deckId: string,
    input: {
      ids?: string[];
      filter?: { q?: string; tag?: string; missing?: boolean; pos?: string };
      add?: string[];
      remove?: string[];
    },
  ): Promise<{ matched: number }> {
    const deck = await this.getDeck(caller, deckId);
    if (deck.shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Only admins modify shared-deck cards");
    }
    const clean = (l?: string[]) =>
      [...new Set((l ?? []).map((t) => t.trim().replace(/^#/, "")).filter(Boolean))];
    const add = clean(input.add);
    const remove = clean(input.remove);
    if (add.length === 0 && remove.length === 0) {
      throw new BadRequestException("Nothing to add or remove");
    }
    let match: Record<string, unknown>;
    if (input.ids && input.ids.length > 0) {
      let oids: Types.ObjectId[];
      try {
        oids = input.ids.map((i) => new Types.ObjectId(i));
      } catch {
        throw new BadRequestException("Invalid card id");
      }
      match = { deck: deck._id, _id: { $in: oids } };
    } else if (input.filter) {
      match = this.cardFilter(deckId, input.filter);
    } else {
      throw new BadRequestException("ids or filter required");
    }
    let matched = 0;
    // $addToSet and $pull on the same field conflict, so run them in turn.
    if (remove.length > 0) {
      const r = await this.card.updateMany(match, { $pull: { tags: { $in: remove } } }).exec();
      matched = r.matchedCount;
    }
    if (add.length > 0) {
      const r = await this.card
        .updateMany(match, { $addToSet: { tags: { $each: add } } })
        .exec();
      matched = r.matchedCount;
    }
    return { matched };
  }

  /**
   * Add a card to a deck the caller owns (personal) — or, for an admin, to
   * a **shared** deck (the admin manages shared content; T-P3-08). Idempotent
   * by content: the same (front, back) in the same deck is a conflict, not a
   * duplicate (T-P3-03). The `dedupeKey` is computed server-side — clients
   * can't spoof or collide it (P3-CARD-02).
   */
  async createCard(caller: AuthUser, input: CardWriteInput): Promise<FlashcardDocument> {
    const doc = await this.getDeck(caller, input.deckId);
    if (doc.shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Only admins add cards to a shared deck");
    }
    const key = cardDedupeKey(input.front, input.back, input.reading ?? "");
    const existing = await this.card
      .findOne({ deck: doc._id, dedupeKey: key })
      .exec();
    if (existing) {
      throw new ConflictException("An identical card already exists in this deck");
    }
    // No example supplied → suggest ONE (best effort; never blocks the add).
    let examples = cleanExamples(input.examples);
    if (examples.length === 0) {
      const suggestion = await this.exampleSuggest.suggest({
        term: input.front,
        meaning: input.back,
        reading: input.reading,
        partOfSpeech: input.partOfSpeech,
        suru: input.partsOfSpeech?.includes("noun-suru"),
      });
      if (suggestion) {
        examples = [
          { sentence: suggestion.sentence, translation: suggestion.translation },
        ];
      }
    }
    const created = await this.card.create({
      deck: doc._id,
      front: input.front,
      back: input.back,
      reading: input.reading?.trim() ?? "",
      image: input.image ?? "",
      imageCredit: input.imageCredit?.trim() ?? "",
      partOfSpeech: input.partOfSpeech ?? "",
      partsOfSpeech: input.partsOfSpeech ?? [],
      note: input.note?.trim() ?? "",
      examples,
      tags: input.tags ?? [],
      origin: input.origin ?? "manual",
      dedupeKey: key,
    });
    // Not found on Tatoeba → let the AI write/translate one in the background
    // (the add is not held up). Only fills a card that is still empty.
    if (examples.length === 0) {
      void this.exampleSuggest
        .suggestFull({
          term: input.front,
          meaning: input.back,
          reading: input.reading,
          partOfSpeech: input.partOfSpeech,
          suru: input.partsOfSpeech?.includes("noun-suru"),
        })
        .then((hit) =>
          hit
            ? this.card
                .updateOne(
                  { _id: created._id, examples: { $size: 0 } },
                  {
                    $set: {
                      examples: [
                        {
                          sentence: hit.sentence,
                          translation: hit.translation,
                          ...(hit.source ? { source: hit.source } : {}),
                        },
                      ],
                    },
                  },
                )
                .exec()
            : undefined,
        )
        .catch(() => undefined);
    }
    return created;
  }

  /**
   * Admin view of the shared decks (manage surface): every shared deck in any
   * status, with its card count. Personal decks are never included — they
   * belong to their owner.
   */
  async adminListSharedDecks(): Promise<DeckView[]> {
    const shared = await this.deck
      .find({ shared: true })
      .sort({ _id: -1 })
      .exec();
    const ids = shared.map((d) => d._id);
    const counts = await this.card
      .aggregate([
        { $match: { deck: { $in: ids } } },
        { $group: { _id: "$deck", cardCount: { $sum: 1 } } },
      ])
      .exec();
    const byDeck = new Map(counts.map((c) => [String(c._id), c.cardCount]));
    return shared.map((d) => this.toDeckView(d, byDeck.get(String(d._id)) ?? 0));
  }

  /** Map a deck document to the plain `DeckView` the API returns. */
  private toDeckView(doc: FlashcardDeckDocument, cardCount: number): DeckView {
    return {
      _id: String(doc._id),
      title: doc.title,
      summary: doc.summary,
      level: doc.level,
      pillar: doc.pillar ?? "vocab",
      systemKey: doc.systemKey,
      category: doc.category ?? "",
      lang: doc.lang,
      status: doc.status,
      shared: doc.shared,
      user: doc.user ? String(doc.user) : null,
      cardCount,
      examples:
        (doc.exampleTotal ?? 0) > 0
          ? { total: doc.exampleTotal ?? 0, done: doc.exampleDone ?? 0, paused: doc.examplePaused ?? false }
          : null,
      createdAt: doc.createdAt?.toISOString() ?? "",
      updatedAt: doc.updatedAt?.toISOString() ?? "",
    };
  }

  /**
   * Delete one card from a deck the caller may **write** to (their own
   * personal deck, or a shared deck for an admin — T-P3-08). The card's
   * progress rows are dropped too.
   */
  async deleteCard(caller: AuthUser, cardId: string): Promise<void> {
    let cardDoc: FlashcardDocument | null;
    try {
      cardDoc = await this.card
        .findById(new Types.ObjectId(cardId))
        .exec();
    } catch {
      throw new NotFoundException("Card not found");
    }
    if (!cardDoc) throw new NotFoundException("Card not found");

    // Read access via getDeck, plus: shared decks are admin-write only.
    const deck = await this.getDeck(caller, String(cardDoc.deck));
    if (deck.shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Only admins modify shared-deck cards");
    }

    await this.progress.deleteMany({ card: cardDoc._id }).exec();
    await this.card.deleteOne({ _id: cardDoc._id }).exec();
  }

  /**
   * Update the editable faces of one card (front / back / tags) in a deck the
   * caller may **write** to (their own personal deck, or a shared deck for an
   * admin — T-P3-08). The `dedupeKey` is recomputed from the new content so a
   * rename that collides with another card is rejected by the unique index
   * rather than silently duplicating it.
   */
  async updateCard(
    caller: AuthUser,
    cardId: string,
    input: {
      front?: string;
      back?: string;
      reading?: string;
      image?: string;
      imageCredit?: string;
      partOfSpeech?: "verb" | "noun" | "adjective" | "adjective-na" | "adverb" | "phrase" | "";
      partsOfSpeech?: string[];
      note?: string;
      examples?: CardExample[];
      tags?: string[];
      /** true = an admin looked at the import warnings: clear them. */
      reviewed?: boolean;
      /** Âm Hán Việt (applying a suggested fix). */
      hanViet?: string;
      /** Close the warnings about one field (applied or dismissed). */
      resolve?: ReviewField;
      /** Confirm every reading now on the card (with the card's meaning) so later checks accept them all. */
      learnReading?: boolean;
    },
  ): Promise<FlashcardDocument> {
    let cardDoc: FlashcardDocument | null;
    try {
      cardDoc = await this.card
        .findById(new Types.ObjectId(cardId))
        .exec();
    } catch {
      throw new NotFoundException("Card not found");
    }
    if (!cardDoc) throw new NotFoundException("Card not found");

    // Read access via getDeck, plus: shared decks are admin-write only.
    const deck = await this.getDeck(caller, String(cardDoc.deck));
    if (deck.shared && !this.isAdmin(caller)) {
      throw new ForbiddenException("Only admins modify shared-deck cards");
    }

    // What the card looked like before this edit.
    const before = { front: cardDoc.front, reading: cardDoc.reading ?? "", back: cardDoc.back ?? "", hanViet: cardDoc.hanViet ?? "" };
    const front = input.front?.trim() ?? cardDoc.front;
    const back = input.back?.trim() ?? cardDoc.back;
    // An imported card may still wait for its meaning; every other card needs both faces.
    if (front === "" || (back === "" && cardDoc.origin !== "import")) {
      throw new BadRequestException("front and back are required");
    }
    const reading = input.reading !== undefined ? input.reading.trim() : (cardDoc.reading ?? "");
    let key = cardDedupeKey(front, back, reading);

    // Editing always saves. If a DIFFERENT card in this deck already holds the
    // same front/back, this card keeps its own id-scoped key (no unique-index
    // clash, no "identical card exists" error blocking the update).
    const clash = await this.card
      .findOne({ deck: cardDoc.deck, dedupeKey: key, _id: { $ne: cardDoc._id } })
      .exec();
    if (clash) key = cardDedupeKeyForCopy(front, back, String(cardDoc._id), reading);

    cardDoc.front = front;
    cardDoc.back = back;
    if (input.reading !== undefined) cardDoc.reading = input.reading.trim();
    if (input.image !== undefined) cardDoc.image = input.image;
    if (input.imageCredit !== undefined) cardDoc.imageCredit = input.imageCredit.trim();
    if (input.partOfSpeech !== undefined) cardDoc.partOfSpeech = input.partOfSpeech;
    if (input.partsOfSpeech !== undefined) {
      cardDoc.partsOfSpeech = input.partsOfSpeech;
      // The primary part of speech follows the list unless it was sent too.
      if (input.partOfSpeech === undefined && input.partsOfSpeech.length > 0) cardDoc.partOfSpeech = primaryPos(input.partsOfSpeech);
    }
    if (input.note !== undefined) cardDoc.note = input.note.trim();
    if (input.examples !== undefined) cardDoc.examples = cleanExamples(input.examples);
    if (input.tags !== undefined) cardDoc.tags = input.tags;
    // Fixing the meaning / reading, or an explicit "reviewed", closes the import warnings.
    if (input.hanViet !== undefined) cardDoc.hanViet = harmonizeHanViet(input.front ?? cardDoc.front ?? "", input.hanViet.trim());
    if (input.reviewed || (input.back !== undefined && back !== "")) cardDoc.reviewIssues = [];
    // "Bỏ qua" on a reading warning keeps the card's reading: the analyser learns it.
    if (input.resolve === "reading" && input.reading === undefined && cardDoc.reading) {
      void this.morph?.learn(cardDoc.front, cardDoc.reading, cardDoc.back);
    }
    if (input.learnReading && cardDoc.reading) {
      for (const v of readingVariants(cardDoc.reading)) void this.morph?.learn(cardDoc.front, v, cardDoc.back);
    }
    if (input.resolve) {
      const of = (t: string): ReviewField => (/^Hán Việt/.test(t) ? "hanViet" : /^cách đọc/.test(t) ? "reading" : "back");
      cardDoc.reviewIssues = (cardDoc.reviewIssues ?? []).filter((t) => of(t) !== input.resolve);
    }
    // A person corrected a field by hand (not by applying the check's own suggestion): the check leaves
    // that field alone from now on, and the word (reading + meaning) goes into the learned vocabulary,
    // which the AI check skips by default in every deck.
    const fixedNow = userFixedFields(before, { reading: cardDoc.reading ?? "", back: cardDoc.back ?? "", hanViet: cardDoc.hanViet ?? "" }, input.resolve);
    const keep = front === before.front ? (cardDoc.userFixed ?? []) : [];
    if (fixedNow.length > 0 || keep.length !== (cardDoc.userFixed ?? []).length) cardDoc.userFixed = [...new Set([...keep, ...fixedNow])];
    const editedWord = front !== before.front || fixedNow.includes("reading") || fixedNow.includes("back");
    if (editedWord && cardDoc.reading) {
      for (const v of readingVariants(splitStrayReading(cardDoc.reading).kana)) void this.morph?.learn(cardDoc.front, v, cardDoc.back);
    }
    cardDoc.dedupeKey = key;
    await cardDoc.save();
    return cardDoc;
  }

  /**
   * "Save a word while learning" (P3-CARD-04, spec §4.2 / T-P3-09).
   *
   * Wraps an existing content entry on a card in the caller's default deck.
   * **Idempotent**: if the content is already a card in that deck, returns it
   * with `created: false` instead of 409 — saving the same word twice from
   * the UI is a no-op, not an error.
   *
   * The card's `front`/`back` are snapshotted from the content entry so the
   * study engine is self-contained even if the entry is later edited or
   * removed (P3-CARD-02).
   */
  async saveVocabulary(
    caller: AuthUser,
    vocabularyId: string,
  ): Promise<SavedVocabCard> {
    const entry = await this.vocabulary
      .findById(new Types.ObjectId(vocabularyId))
      .exec();
    if (!entry) throw new NotFoundException("Vocabulary entry not found");

    const target = await this.defaultDeckFor(caller);
    const front = this.vocabFront(entry);
    const back = this.vocabBack(entry);
    const key = cardDedupeKey(front, back);

    const existing = await this.card
      .findOne({ deck: target._id, dedupeKey: key })
      .exec();
    if (existing) {
      return { card: existing, created: false };
    }

    const cardDoc = await this.card.create({
      deck: target._id,
      kind: "VOCABULARY",
      vocabulary: entry._id,
      front,
      back,
      tags: entry.tags ?? [],
      origin: "saved",
      dedupeKey: key,
    });
    return { card: cardDoc, created: true };
  }

  /** Same idempotent save for a grammar point (P3-CARD-04, spec §4.3). */
  async saveGrammar(
    caller: AuthUser,
    grammarId: string,
  ): Promise<SavedVocabCard> {
    const entry = Types.ObjectId.isValid(grammarId)
      ? await this.grammar
          .findOne({ _id: new Types.ObjectId(grammarId), status: "PUBLISHED" })
          .exec()
      : null;
    if (!entry) throw new NotFoundException("Grammar point not found");

    const target = await this.defaultDeckFor(caller);
    const front = this.grammarFront(entry);
    const back = this.grammarBack(entry);
    const key = cardDedupeKey(front, back);

    const existing = await this.card
      .findOne({ deck: target._id, dedupeKey: key })
      .exec();
    if (existing) {
      return { card: existing, created: false };
    }

    const cardDoc = await this.card.create({
      deck: target._id,
      kind: "GRAMMAR",
      grammar: entry._id,
      front,
      back,
      tags: entry.tags ?? [],
      origin: "saved",
      dedupeKey: key,
    });
    return { card: cardDoc, created: true };
  }

  /** Background "re-check the whole deck" runs, by deck id (in memory; progress for the floating tracker). */
  private readonly rechecks = new Map<
    string,
    { deckId: string; owner: string; title: string; field: RecheckField; status: "running" | "paused" | "done" | "error"; done: number; total: number; flagged: number; changed: number; recent: { stt: number; word: string; oldHanViet: string; newHanViet: string }[]; recentFlags: { stt: number; word: string; field: "reading" | "back"; issue: string }[]; error?: string; cancelled?: boolean }
  >();

  /** The latest Hán Việt check of a deck: what it changed (STT, word, old → new Hán Việt). */
  async hanVietLog(caller: AuthUser, deckId: string) {
    const deck = await this.getDeck(caller, deckId);
    const doc = await this.hvLog?.findOne({ deck: deck._id }).lean().exec();
    const sub = (k: "reading" | "back" | "normalize") => {
      const d = (doc as unknown as Record<string, { startedAt: number; finishedAt?: number; total: number; finished: boolean; flags: unknown[] } | undefined> | null)?.[k];
      return d ? { ran: true, ...d } : { ran: false, finished: false, total: 0, startedAt: 0, flags: [] };
    };
    const base = { deckId: String(deck._id), title: deck.title, reading: sub("reading"), back: sub("back"), normalize: sub("normalize") };
    if (!doc) return { ...base, ran: false, finished: false, total: 0, startedAt: 0, changes: [] };
    return { ...base, ran: !!doc.startedAt, finished: doc.finished, total: doc.total, startedAt: doc.startedAt, finishedAt: doc.finishedAt, changes: doc.changes };
  }

  /** The caller's re-check runs (running or recently finished). */
  listRechecks(caller: AuthUser) {
    return [...this.rechecks.values()].filter((r) => r.owner === caller.sub).map(({ owner: _o, ...r }) => r);
  }

  /** Pause / resume the caller's re-check of a deck. */
  pauseRecheck(caller: AuthUser, deckId: string, pause: boolean): void {
    const j = this.rechecks.get(deckId);
    if (!j || j.owner !== caller.sub) return;
    if (pause && j.status === "running") j.status = "paused";
    else if (!pause && j.status === "paused") j.status = "running";
  }

  /** Stop the caller's running re-check of a deck (cards already checked keep their result); on a finished run, dismiss it. */
  cancelRecheck(caller: AuthUser, deckId: string): void {
    const j = this.rechecks.get(deckId);
    if (!j || j.owner !== caller.sub) return;
    if (j.status === "running" || j.status === "paused") {
      j.cancelled = true;
      j.status = "error";
      j.error = "Đã hủy";
    } else {
      this.rechecks.delete(deckId); // a finished run is dismissed from the progress list
    }
  }

  /** Start re-checking a whole deck in the background; returns at once. */
  async startRecheck(
    caller: AuthUser,
    deckId: string,
    verify: (
      items: { id: number; word: string; reading: string; hanViet: string; meaning: string; context?: string }[],
    ) => Promise<Map<number, { reading?: string; hanViet?: string; meaning?: string }> | null>,
    field: RecheckField = "all",
    force = false,
    batchSize = 10,
    ids?: string[],
    includeLearned = false,
  ) {
    const deck = await this.getDeck(caller, deckId);
    if (deck.shared && !this.isAdmin(caller)) throw new ForbiddenException("Shared decks are admin-managed");
    const key = String(deck._id);
    const running = this.rechecks.get(key);
    if (running && (running.status === "running" || running.status === "paused")) return { deckId: key, status: running.status, done: running.done, total: running.total, flagged: running.flagged, title: running.title, field: running.field };
    // One re-check at a time on the whole server: a small machine and one AI quota are shared.
    const other = [...this.rechecks.values()].find((r) => r.deckId !== key && (r.status === "running" || r.status === "paused"));
    if (other) throw new ConflictException("Đang có một lần kiểm tra khác chạy trên máy chủ — thử lại khi nó xong");
    const job = { deckId: key, owner: caller.sub, title: deck.title, field, status: "running" as "running" | "paused" | "done" | "error", done: 0, total: 0, flagged: 0, changed: 0, recent: [] as { stt: number; word: string; oldHanViet: string; newHanViet: string }[], recentFlags: [] as { stt: number; word: string; field: "reading" | "back"; issue: string }[], error: undefined as string | undefined };
    this.rechecks.set(key, job);
    void this.runRecheck(job, deck._id, verify, field, force, batchSize, ids?.filter((i) => Types.ObjectId.isValid(i)), includeLearned).catch((e: unknown) => {
      job.status = "error";
      job.error = e instanceof Error ? e.message : "Kiểm tra thất bại";
    });
    const { owner: _o, ...view } = job;
    return view;
  }

  /**
   * Re-check one kind of warning over a whole deck (or all three). Hán Việt is judged by the
   * kanji admin data alone; a reading by the kanji admin data and the analyser, the AI only
   * when they cannot settle it; a meaning by the AI. The old AI / table warnings of the checked
   * field are replaced by the fresh verdicts; warnings from the import itself, and every other
   * field's warnings, are kept.
   */
  private async runRecheck(
    job: { status: "running" | "paused" | "done" | "error"; done: number; total: number; flagged: number; changed: number; recent: { stt: number; word: string; oldHanViet: string; newHanViet: string }[]; recentFlags: { stt: number; word: string; field: "reading" | "back"; issue: string }[]; error?: string; cancelled?: boolean },
    deckOid: Types.ObjectId,
    verify: (
      items: { id: number; word: string; reading: string; hanViet: string; meaning: string; context?: string }[],
    ) => Promise<Map<number, { reading?: string; hanViet?: string; meaning?: string }> | null>,
    only: RecheckField,
    force = false,
    batchSize = 10,
    ids?: string[],
    /** Also judge words from the learned vocabulary (skipped by default). */
    includeLearned = false,
  ): Promise<void> {
    await this.ensureKanjiTable();
    const wants = (f: ReviewField) => only === "all" || only === f || (only === "readingBack" && f !== "hanViet");
    // Only what the re-check needs: the heavy fields (examples, image) stay in the database.
    const cards = await this.card
      .find({ deck: deckOid, ...(ids && ids.length > 0 ? { _id: { $in: ids.map((i) => new Types.ObjectId(i)) } } : {}) })
      .select("front reading back hanViet reviewIssues order readingChecked backChecked userFixed partOfSpeech partsOfSpeech note kind origin tags dedupeKey")
      .sort({ order: 1, _id: 1 })
      .limit(3000)
      .exec();
    job.total = cards.length;
    const changes: { stt: number; word: string; oldHanViet: string; newHanViet: string }[] = [];
    const startedAt = Date.now();
    const flags: { reading: { stt: number; word: string; issue: string }[]; back: { stt: number; word: string; issue: string }[] } = { reading: [], back: [] };
    // "Kiểm tra từ vựng" also tidies the word itself: stray spaces and the な of a な-adjective.
    const doNormalize = only !== "hanViet";
    // "Kiểm tra từ vựng": part of speech, reading and meaning come from Mazii (not the AI).
    const useMazii = only === "readingBack";
    const normFlags: { stt: number; word: string; issue: string }[] = [];
    const usedKeys = new Set<string>();
    if (doNormalize) for (const x of await this.card.find({ deck: deckOid }).select("dedupeKey").lean().exec()) if (x.dedupeKey) usedKeys.add(x.dedupeKey);
    const normOps: Parameters<Model<FlashcardDocument>["bulkWrite"]>[0] = [];
    const flushNorm = async () => {
      if (normOps.length === 0) return;
      await this.card.bulkWrite(normOps.splice(0), { ordered: false }).catch(() => null);
    };
    const normalizeCard = async (c: (typeof cards)[number]) => {
      const before = c.front;
      let next = normalizeWord(before);
      const notes: string[] = [];
      if (next !== before.trim()) notes.push("bỏ khoảng trắng");
      // A collocation followed by its explanation (`成績が上がる(=よくなる)`): the reading marks where the word ends.
      let note = c.note ?? "";
      let splitFrom: string | null = null;
      // Several words / phrases in one cell (味がつく・味をつける): the first stays on this card, the rest become cards of their own.
      const origReading = c.reading ?? "";
      let srcReading = origReading;
      const extra: { front: string; reading: string }[] = [];
      const variants = this.morph ? splitVariants(next, origReading) : null;
      if (variants) {
        splitFrom = next;
        next = variants[0].front;
        srcReading = variants[0].reading;
        extra.push(...variants.slice(1));
        notes.push(`tách ${variants.length} từ trong một ô`);
      }
      if (this.morph) {
        const morph = this.morph;
        const r = await splitWordNote(next, srcReading, async (t) => readingOfTokens(await morph.tokens(t))).catch(() => null);
        if (r?.review) {
          normFlags.push({ stt: c.order ?? cards.indexOf(c) + 1, word: clean(next), issue: `${r.review}: “${next}”` });
        } else if (r && r.word !== next) {
          splitFrom ??= next;
          next = r.word;
          note = r.note || note;
          notes.push("tách ghi chú ra khỏi từ");
        }
      }
      let pos = c.partOfSpeech ?? "";
      if (/な[)）]?$/.test(next) && [...next].length > 1 && (pos === "" || pos === "adjective" || pos === "adjective-na")) {
        // An い-adjective never ends in な: a な there means a な-adjective written with its particle.
        const isNa = pos !== "" || (this.morph ? (await this.morph.analyze(next).catch(() => null))?.partOfSpeech === "adjective-na" : false);
        if (isNa) {
          const bare = stripNa(next);
          if (bare !== next) notes.push("bỏ な");
          next = bare;
          pos = "adjective-na";
        }
      }
      // A noun that takes する (誤解, 乱暴) or doubles as a な-adjective: learn it from the analyser.
      let parts = c.partsOfSpeech ?? [];
      if (parts.length === 0 && this.morph) {
        const toks = await this.morph.tokens(clean(next)).catch(() => null);
        const found = toks ? derivePartsOfSpeech(next, pos, toks) : null;
        if (found) {
          parts = found;
          if (!pos) pos = primaryPos(found);
          notes.push(found.includes("noun-suru") ? "thêm từ loại: danh từ + する" : "thêm từ loại: tính từ な");
        }
      }
      // A な-adjective's reading drops its な too (フレッシュな → フレッシュ), or it never matches the word.
      const reading = origReading;
      let nextReading = pos === "adjective-na" && !/な$/.test(next) ? stripNaReading(srcReading) : srcReading;
      if (nextReading !== reading) notes.push("bỏ な ở cách đọc");
      // A katakana word reads as itself: its reading is katakana too (らっきー → ラッキー).
      if (nextReading && isKatakanaWord(clean(next)) && toKatakana(nextReading) !== nextReading) {
        nextReading = toKatakana(nextReading);
        notes.push("cách đọc sang katakana");
      }
      // A hiragana word (no kanji) reads in hiragana (キレイ → きれい).
      if (nextReading && isHiraganaWord(clean(next)) && toHiragana(nextReading) !== nextReading) {
        nextReading = toHiragana(nextReading);
        notes.push("cách đọc sang hiragana");
      }
      if (next === before && pos === (c.partOfSpeech ?? "") && nextReading === reading && parts.length === (c.partsOfSpeech ?? []).length && note === (c.note ?? "")) return;
      const stt = c.order ?? cards.indexOf(c) + 1;
      const key = cardDedupeKey(next, c.back ?? "", nextReading);
      if (key !== c.dedupeKey && usedKeys.has(key)) {
        normFlags.push({ stt, word: clean(before), issue: `“${before}” → “${next}” (${notes.join(", ")}): trùng một thẻ khác trong bộ, chưa sửa` });
        return;
      }
      const set: Record<string, unknown> = { front: next };
      if (nextReading !== reading) set.reading = nextReading;
      if (pos !== (c.partOfSpeech ?? "")) set.partOfSpeech = pos;
      if (parts.length !== (c.partsOfSpeech ?? []).length) set.partsOfSpeech = parts;
      if (note !== (c.note ?? "")) set.note = note;
      // The Hán Việt was read from the word + its note: read it again from the word alone.
      if (splitFrom && !(c.userFixed ?? []).includes("hanViet")) {
        const hv = suggestHanViet(next);
        if (hv) set.hanViet = harmonizeHanViet(next, hv);
      }
      if (key !== c.dedupeKey) {
        set.dedupeKey = key;
        usedKeys.delete(c.dedupeKey ?? "");
        usedKeys.add(key);
      }
      normOps.push({ updateOne: { filter: { _id: c._id }, update: { $set: set } } });
      // The other words of the cell: a new card each (same STT, meaning copied from this card for a person to adjust).
      for (const v of extra) {
        const r2 = this.morph ? await splitWordNote(v.front, v.reading, async (t) => readingOfTokens(await this.morph!.tokens(t))).catch(() => null) : null;
        const w2 = r2 && !r2.review ? r2.word : v.front;
        const n2 = r2 && !r2.review ? r2.note : "";
        const key2 = cardDedupeKey(w2, c.back ?? "", v.reading);
        if (usedKeys.has(key2)) {
          normFlags.push({ stt, word: clean(w2), issue: `“${w2}” (tách từ “${before}”): trùng một thẻ khác trong bộ, chưa tạo thẻ` });
          continue;
        }
        usedKeys.add(key2);
        const hv2 = suggestHanViet(w2);
        normOps.push({
          insertOne: {
            document: {
              deck: deckOid,
              kind: c.kind ?? "CUSTOM",
              origin: c.origin ?? "import",
              front: w2,
              back: c.back ?? "",
              reading: v.reading,
              note: n2,
              partOfSpeech: pos,
              hanViet: hv2 ? harmonizeHanViet(w2, hv2) : "",
              order: c.order,
              tags: c.tags ?? [],
              reviewIssues: ["nghĩa chép từ thẻ gốc khi tách thẻ, cần kiểm tra"],
              dedupeKey: key2,
            },
          },
        } as never);
        normFlags.push({ stt, word: clean(w2), issue: `tách từ “${before}” → thẻ mới “${w2}”${n2 ? ` (đồng nghĩa: ${n2})` : ""}` });
      }
      c.front = next;
      c.reading = nextReading;
      c.partOfSpeech = pos as typeof c.partOfSpeech;
      c.partsOfSpeech = parts;
      c.note = note;
      c.dedupeKey = key;
      normFlags.push({ stt, word: clean(next), issue: `“${before}” → “${next}”${nextReading !== reading ? ` · cách đọc “${reading}” → “${nextReading}”` : ""} (${notes.join(", ") || "từ loại tính từ な"})` });
      if (normOps.length >= 100) await flushNorm();
    };
    const saveLog = async (finished: boolean) => {
      if (!this.hvLog) return;
      const set: Record<string, unknown> = {};
      if (wants("hanViet")) Object.assign(set, { startedAt, total: cards.length, finished, finishedAt: finished ? Date.now() : undefined, changes: [...changes].sort((x, y) => x.stt - y.stt) });
      if (doNormalize) set.normalize = { startedAt, total: cards.length, finished, finishedAt: finished ? Date.now() : undefined, flags: [...normFlags].sort((x, y) => x.stt - y.stt) };
      for (const f of ["reading", "back"] as const) {
        if (wants(f)) set[f] = { startedAt, total: cards.length, finished, finishedAt: finished ? Date.now() : undefined, flags: [...flags[f]].sort((x, y) => x.stt - y.stt) };
      }
      await this.hvLog.updateOne({ deck: deckOid }, { $set: set }, { upsert: true }).exec().catch(() => null);
    };
    await saveLog(false);

    const clean = (t: string) => t.replace(WORD_NOTE_RE, "").trim();
    // The word to look up on Mazii: an optional part in brackets (てきぱき「と」, 勉強（する）) is not part of the headword.
    const maziiKey = (t: string) => clean(t).replace(/[「『（(][^」』）)]*[」』）)]/g, "").replace(/[〜～~]/g, "").trim() || clean(t);
    const fingerprint = (a: string, b: string) => createHash("sha1").update(`${a}|${b}`).digest("base64url").slice(0, 12);
    const tick = () => new Promise<void>((r) => setImmediate(r)); // let the API serve requests between chunks
    const gate = async () => {
      while (job.status === "paused" && !job.cancelled) await new Promise((r) => setTimeout(r, 500));
      return !job.cancelled;
    };

    // Analyser readings per word, asked once per run (a word repeats in a deck).
    const analysed = new Map<string, Promise<string[]>>();
    const analyserReadings = (word: string) => {
      let hit = analysed.get(word);
      if (!hit) {
        hit = (this.morph ? this.morph.analyze(word).then((a) => a.readings) : Promise.resolve([])).catch(() => []);
        analysed.set(word, hit);
      }
      return hit;
    };

    // Two or more single-kanji tokens in a row: the analyser did not know the compound, so its reading is only a guess.
    const frag = new Map<string, Promise<boolean>>();
    const fragmented = (word: string) => {
      let hit = frag.get(word);
      if (!hit) {
        hit = (this.morph ? this.morph.tokens(word) : Promise.resolve([])).then((ts) => ts.some((t, i) => i > 0 && /^\p{Script=Han}$/u.test(t.surface_form) && /^\p{Script=Han}$/u.test(ts[i - 1]!.surface_form))).catch(() => false);
        frag.set(word, hit);
      }
      return hit;
    };

    type Plan = {
      c: (typeof cards)[number];
      judgeReading: boolean;
      judgeBack: boolean;
      rHash: string;
      bHash: string;
      /** Reading parts neither the kanji data nor the analyser could confirm: what the AI is still asked. */
      askReading: string[];
      /** A katakana word whose reading does not match the word. */
      kataIssue?: string;
      /** The reading holds words that are not a reading (Latin / Vietnamese text). */
      strayIssue?: string;
      /** A reading valid for the word but tied to another meaning (from what people confirmed). */
      readingClash?: string;
      /** Mazii's entry for the word: `null` = Mazii does not have it, `undefined` = not looked up (or Mazii unreachable). */
      mazii?: MaziiWord | null;
      /** Not on Mazii as written, but its reading is a longer word that starts with it (怒鳴 → 怒鳴る). */
      maziiHint?: string;
    };

    // Stage 1 (local, no AI): decide per card what is judged, skipping what a past run already judged unchanged.
    const plans: Plan[] = [];
    for (const c of cards) {
      if (plans.length % 50 === 49) {
        await tick();
        if (!(await gate())) return;
      }
      if (doNormalize) await normalizeCard(c);
      const rawReading = c.reading ?? "";
      const word = clean(c.front);
      const rHash = fingerprint(word, rawReading);
      // Words that are not a reading at all (Vietnamese slipped in from the meaning column) are a warning of
      // their own; the rest is judged without them, so a valid kana part can never vouch for the stray words.
      const { kana: reading, stray } = splitStrayReading(rawReading);
      // A field a person corrected by hand after a warning is theirs: the check leaves it alone.
      const handFixed = (f: ReviewField) => (c.userFixed ?? []).includes(f);
      // A word from the learned vocabulary (a person fixed or kept it on some card) is skipped by default.
      const learned =
        includeLearned || stray || !this.morph
          ? { reading: false, meaning: false }
          : learnedVocab(readingVariants(reading), await this.morph.confirmedReadings(word), c.back ?? "", await this.morph.readingMeanings(word), hvNorm);
      const bHash = fingerprint(word, c.back ?? "");
      const p: Plan = {
        c,
        rHash,
        bHash,
        // A reading with stray words is judged again on every run (older runs let it through), until it is fixed.
        judgeReading: wants("reading") && !handFixed("reading") && (useMazii || (!learned.reading && (force || c.readingChecked !== rHash || !!stray))),
        judgeBack: wants("back") && !handFixed("back") && (useMazii || (!learned.meaning && (force || c.backChecked !== bHash))),
        askReading: [],
      };
      if (p.judgeReading && stray) p.strayIssue = strayReadingIssue(rawReading, stray, reading);
      if (p.judgeReading && reading && /^[\p{Script=Katakana}ー・\s]+$/u.test(word)) {
        // A katakana word is its own reading: only check the reading matches the word (no AI, no hiragana suggestion).
        const norm = (t: string) => t.replace(/[\s・]/g, "").replace(/[\u30A1-\u30F6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
        if (norm(reading) !== norm(word) && readingVariants(reading).every((v) => norm(v) !== norm(word))) p.kataIssue = `cách đọc “${reading}” không khớp với từ katakana “${word}”`;
      } else if (p.judgeReading && reading) {
        const variants = readingVariants(reading);
        // Every reading on the card is checked on its own: one valid one does not vouch for the rest.
        let invalid = variants.filter((v) => !readingFitsKanji(c.front, v));
        if (invalid.length > 0 && this.morph) {
          const known = await analyserReadings(word);
          invalid = invalid.filter((v) => !known.includes(v));
        }
        // Every kanji may fit its own on/kun reading while the WORD reads differently (一人 ひとり, not いちにん).
        // When the analyser knows the word and the card's reading is not among its readings, the AI gets the last word:
        // the analyser only escalates, it never raises a warning by itself.
        if (invalid.length === 0 && this.morph && /\p{Script=Han}/u.test(word)) {
          const known = (await analyserReadings(word)).filter((g) => /^[\p{Script=Hiragana}ー]+$/u.test(g));
          if (known.length > 0 && !variants.some((v) => known.includes(v))) invalid = variants;
          // The analyser reads an unknown compound kanji by kanji (一人 → イチ+ニン), so it would "confirm" a wrong reading: ask the AI too.
          else if (known.length > 0 && (await fragmented(word))) invalid = variants;
        }
        // A reading a person confirmed for this word (fixed by hand on any card, or kept on a warning) is not asked again.
        const confirmed = invalid.length > 0 && this.morph ? await this.morph.confirmedReadings(word) : [];
        p.askReading = invalid.filter((v) => !confirmed.includes(v));
        // A word with a reading per meaning: the card's reading must go with the card's meaning.
        const rm = (await this.morph?.readingMeanings(word)) ?? [];
        const mine = hvNorm(c.back ?? "");
        const [only1] = variants;
        if (mine && variants.length === 1 && only1 && new Set(rm.map((x) => x.reading)).size >= 2) {
          const owner = rm.find((x) => hvNorm(x.meaning) === mine);
          if (owner && owner.reading !== only1 && !rm.some((x) => x.reading === only1 && hvNorm(x.meaning) === mine)) p.readingClash = `cách đọc “${only1}” đúng với từ nhưng có vẻ thuộc nghĩa khác (gợi ý: ${owner.reading})`;
        }
      }
      if (useMazii) {
        p.askReading = [];
        p.readingClash = undefined;
      }
      plans.push(p);
    }

    await flushNorm();
    if (doNormalize) await saveLog(false);

    // Stage 1b: look every word up on Mazii (a few at a time; a word repeats in a deck).
    if (useMazii) {
      const words = [...new Set(plans.map((p) => maziiKey(p.c.front)).filter(Boolean))];
      const found = new Map<string, MaziiWord | null>();
      let cursor = 0;
      let streak = 0;
      let down = false;
      const lookup = async () => {
        while (!down) {
          if (!(await gate())) return;
          const w = words[cursor++];
          if (w === undefined) return;
          try {
            found.set(w, await fetchMaziiWord(w));
            streak = 0;
          } catch {
            // Unreachable ≠ not found: the card is left as it is. Ten failures in a row = Mazii is down.
            if (++streak >= 10) down = true;
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, () => lookup()));
      if (job.cancelled) return;
      if (down) {
        job.status = "error";
        job.error = "Không kết nối được Mazii — thử lại sau";
        return;
      }
      for (const p of plans) p.mazii = found.get(maziiKey(p.c.front));
      // A word Mazii does not have: see whether it is a cut-short word (怒鳴 for 怒鳴る), a misspelt kana word (たます for だます)
      // or a word with an extra particle (永遠に for 永遠), and say what the right one probably is.
      for (const p of plans) {
        const w = maziiKey(p.c.front);
        if (p.mazii !== null || job.cancelled) continue;
        const kana = readingVariants(splitStrayReading(p.c.reading ?? "").kana.replace(/[\s・]/g, ""))[0];
        if (kana && /\p{Script=Han}/u.test(w)) {
          const hit = await fetchMaziiWord(kana).catch(() => null);
          if (hit?.headword && hit.headword !== w && hit.headword.startsWith(w)) {
            p.maziiHint = `có thể từ đúng là “${hit.headword}” (thiếu đuôi?)`;
            continue;
          }          // Same reading, a different word that shares a character with this one (人で for 人手).
          if (hit?.headword && hit.headword !== w && hit.readings.some((r) => readingVariants(r).includes(kana)) && [...w].some((ch) => /\p{Script=Han}/u.test(ch) && hit.headword!.includes(ch))) {
            p.maziiHint = `có thể từ đúng là “${hit.headword}” (cùng cách đọc ${kana}, sai chữ?)`;
            continue;
          }
        }
        if (kana && /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(w) && readingVariants(w)[0] !== kana) {
          const hit = await fetchMaziiWord(kana).catch(() => null);
          if (hit && hit.readings.some((r) => readingVariants(r).includes(kana))) {
            p.maziiHint = `có thể từ đúng là “${kana}”${hit.headword && hit.headword !== kana ? ` (${hit.headword})` : ""} (sai chính tả?)`;
            continue;
          }
        }
        const stem = w.match(/^(.*\p{Script=Han}.*?)(に|と|な|の|で|を|が|は)$/u)?.[1];
        if (stem) {
          const hit = await fetchMaziiWord(stem).catch(() => null);
          if (hit) p.maziiHint = `Mazii có “${stem}”, không có “${w}” — có thể bỏ “${w.slice(stem.length)}”`;
        }
      }
    }

    /** Stage 3: turn a card's local + AI verdicts into the warnings and fixes to store. */
    const apply = async (p: Plan, r: { reading?: string; hanViet?: string; meaning?: string } | undefined) => {
      const c = p.c;
      const out: string[] = [];
      const reading = c.reading ?? "";
      const hanViet = c.hanViet ?? "";
      const meaning = c.back ?? "";
      if (p.strayIssue) out.push(p.strayIssue);
      if (p.kataIssue) out.push(p.kataIssue);
      if (p.readingClash) out.push(p.readingClash);
      if (p.askReading.length > 0 && r?.reading && /^[\p{Script=Hiragana}ー]+$/u.test(r.reading) && !p.askReading.includes(r.reading)) {
        out.push(`cách đọc “${p.askReading.join(" / ")}” có thể chưa đúng (AI gợi ý: ${r.reading})`);
      }
      // Hán Việt is looked up in the kanji admin data and replaced in place when it is wrong.
      let fixedHv: string | null = null;
      if (wants("hanViet") && !(c.userFixed ?? []).includes("hanViet")) {
        // A blank cell is filled when the data knows every kanji of the word.
        const right = hanViet ? (correctHanViet(c.front, hanViet) ?? correctHanVietPartial(c.front, hanViet)) : suggestHanViet(c.front);
        if (right && right !== hanViet) fixedHv = right;
      }
      if (p.judgeBack && r?.meaning && meaning && hvNorm(r.meaning) !== hvNorm(meaning)) {
        out.push(`nghĩa “${meaning}” có thể chưa sát (AI gợi ý: ${r.meaning})`);
      }
      // The warnings this run re-judges for this card (an import warning about a meaning is not one of them).
      const rejudged = (t: string) => {
        const f = reviewFieldOf(t);
        return f === "hanViet" ? wants("hanViet") : f === "reading" ? p.judgeReading : p.judgeBack && /\((?:AI|Mazii) gợi ý: |Mazii/.test(t);
      };
      // Mazii: part of speech is taken as is; reading and meaning are checked, and filled in when blank.
      const maziiSet: Record<string, unknown> = {};
      if (useMazii && p.mazii !== undefined) {
        const m = p.mazii;
        const stt = c.order ?? cards.indexOf(c) + 1;
        const w = maziiKey(c.front);
        const said: string[] = [];
        if (m === null) {
          if (p.judgeReading || p.judgeBack) {
            const guess = this.morph && /\p{Script=Han}/u.test(w) ? (await this.morph.analyze(w).catch(() => null))?.reading : "";
            out.push(`cách đọc “${reading}”: không tra được “${w}” trên Mazii${p.maziiHint ? ` — ${p.maziiHint}` : ""}, cần cập nhật cách đọc, từ loại và nghĩa thủ công${guess && !p.maziiHint ? ` (gợi ý: ${guess})` : ""}`);
          }
        } else {
          const cur = c.partsOfSpeech ?? [];
          if (m.parts.length > 0 && !(m.parts.length === cur.length && m.parts.every((x, i) => cur[i] === x))) {
            maziiSet.partsOfSpeech = m.parts;
            maziiSet.partOfSpeech = primaryPos(m.parts);
            said.push(`từ loại ${m.parts.join(" + ")}`);
          }
          const kataWord = /^[\p{Script=Katakana}ー・\s]+$/u.test(w);
          if (p.judgeReading && !kataWord && m.readings.length > 0) {
            const mine = readingVariants(splitStrayReading(reading).kana);
            const theirs = m.readings.flatMap((r) => readingVariants(r));
            if (mine.length === 0) {
              maziiSet.reading = m.readings[0];
              said.push(`cách đọc ${m.readings[0]}`);
            } else if (!mine.some((v) => theirs.includes(v))) {
              out.push(`cách đọc “${reading}” có thể chưa đúng (Mazii gợi ý: ${m.readings.join("、")})`);
            }
          }
          if (p.judgeBack && m.means.length > 0) {
            const stop = new Set(["su", "cai", "viec", "nguoi", "mot", "cac", "nhung", "de", "va", "la", "co", "khong", "duoc", "cua", "thi", "ma"]);
            const toks = (t: string) => hvNorm(t).split(/[^a-z0-9]+/).filter((x) => x.length >= 2 && !stop.has(x));
            const suggested = m.means.slice(0, 2).join("; ");
            if (!meaning.trim()) {
              maziiSet.back = suggested;
              said.push("nghĩa");
            } else {
              const theirs = new Set(m.means.flatMap(toks));
              if (!toks(meaning).some((x) => theirs.has(x))) out.push(`nghĩa “${meaning}” có thể chưa sát (Mazii gợi ý: ${suggested})`);
            }
          }
          if (said.length > 0) normFlags.push({ stt, word: w, issue: `cập nhật từ Mazii: ${said.join(", ")}` });
        }
      }
      const kept = (c.reviewIssues ?? []).filter((t) => !rejudged(t));
      const next = [...kept, ...out.filter((t) => !kept.some((k) => reviewFieldOf(k) === reviewFieldOf(t)))];
      if (out.length > 0) job.flagged++;
      for (const t of out) {
        const f = reviewFieldOf(t);
        if (f !== "reading" && f !== "back") continue;
        const entry = { stt: c.order ?? cards.indexOf(c) + 1, word: clean(c.front), issue: t };
        flags[f].push(entry);
        job.recentFlags = [...job.recentFlags.slice(-29), { ...entry, field: f }];
      }
      if (fixedHv !== null) {
        const ch = { stt: c.order ?? cards.indexOf(c) + 1, word: clean(c.front), oldHanViet: hanViet, newHanViet: fixedHv };
        changes.push(ch);
        job.changed = changes.length;
        job.recent = [...job.recent.slice(-29), ch];
      }
      const set: Record<string, unknown> = {};
      if (next.join("\n") !== (c.reviewIssues ?? []).join("\n")) set.reviewIssues = next;
      if (fixedHv !== null) set.hanViet = fixedHv;
      Object.assign(set, maziiSet);
      if (p.judgeReading && c.readingChecked !== p.rHash) set.readingChecked = p.rHash;
      if (p.judgeBack && c.backChecked !== p.bHash) set.backChecked = p.bHash;
      return Object.keys(set).length > 0 ? { updateOne: { filter: { _id: c._id }, update: { $set: set } } } : null;
    };

    const flush = async (batch: Plan[], got?: Map<number, { reading?: string; hanViet?: string; meaning?: string }>) => {
      const ops = (await Promise.all(batch.map((p, n) => apply(p, got?.get(n + 1))))).filter((o) => o !== null);
      if (ops.length > 0) await this.card.bulkWrite(ops);
      job.done += batch.length;
      if (changes.length > 0 || flags.reading.length > 0 || flags.back.length > 0) await saveLog(false);
    };

    // Stage 2a: cards the AI is not needed for are finished at once, in bulk.
    const needsAi = (p: Plan) => !useMazii && (p.askReading.length > 0 || (p.judgeBack && !!p.c.back));
    const local = plans.filter((p) => !needsAi(p));
    for (let i = 0; i < local.length; i += 100) {
      if (!(await gate())) return;
      await flush(local.slice(i, i + 100));
      await tick();
    }

    // Stage 2b: the rest go to the AI in batches (10 unless the user chose), a few batches at a time.
    const aiPlans = plans.filter(needsAi);
    const batches: Plan[][] = [];
    const bs = Math.max(1, Math.min(50, Math.floor(batchSize) || 10));
    for (let i = 0; i < aiPlans.length; i += bs) batches.push(aiPlans.slice(i, i + bs));
    let next = 0;
    let failed = false;
    const worker = async () => {
      while (!failed) {
        if (!(await gate()) || failed) return;
        const batch = batches[next++];
        if (!batch) return;
        const items = batch
          .map((p, n) => ({
            id: n + 1,
            word: clean(p.c.front),
            reading: p.askReading.join(" / "),
            hanViet: "",
            meaning: p.judgeBack ? (p.c.back ?? "") : "",
            // The meaning only helps the AI pick the reading of a word that has several.
            ...(p.askReading.length > 0 && !p.judgeBack && p.c.back ? { context: p.c.back } : {}),
          }))
          .filter((it) => it.reading || it.meaning);
        const got = await verify(items).catch(() => null);
        if (job.cancelled) return;
        if (!got) {
          failed = true;
          job.status = "error";
          job.error = "AI không phản hồi — thử lại sau";
          return;
        }
        await flush(batch, got);
      }
    };
    const width = Math.min(FlashcardsService.recheckConcurrency(), Math.max(1, batches.length));
    await Promise.all(Array.from({ length: width }, () => worker()));
    if (failed || job.cancelled) return;
    await saveLog(true);
    job.status = "done";
  }

  /** How many AI batches a re-check keeps in flight (env RECHECK_CONCURRENCY, 1–4, default 2). */
  private static recheckConcurrency(): number {
    const n = Math.floor(Number(process.env.RECHECK_CONCURRENCY));
    return Number.isFinite(n) && n > 0 ? Math.min(4, n) : 2;
  }

  // ── internals ───────────────────────────────────────────────────────

  private isAdmin(caller: AuthUser): boolean {
    return CONTENT_ADMIN.includes(caller.role);
  }

  private async findOneDeck(id: string): Promise<FlashcardDeckDocument> {
    let doc: FlashcardDeckDocument | null;
    try {
      doc = await this.deck.findById(new Types.ObjectId(id)).exec();
    } catch {
      throw new NotFoundException("Deck not found");
    }
    if (!doc) throw new NotFoundException("Deck not found");
    return doc;
  }

  /**
   * The caller's catch-all personal deck for "save a word" — created on first
   * save if absent. One deck per user, so a re-save lands in the same place
   * (T-P3-09). The default deck is PUBLISHED-with-no-shared-flag so it shows
   * up in the owner's deck list.
   */
  private async defaultDeckFor(caller: AuthUser): Promise<FlashcardDeckDocument> {
    const userId = new Types.ObjectId(caller.sub);
    const existing = await this.deck
      .findOne({ user: userId, shared: false, title: DEFAULT_DECK_TITLE })
      .exec();
    if (existing) return existing;
    return this.deck.create({
      title: DEFAULT_DECK_TITLE,
      user: userId,
      shared: false,
      status: "PUBLISHED",
    });
  }

  private vocabFront(entry: VocabularyDocument): string {
    return entry.reading ? `${entry.term} (${entry.reading})` : entry.term;
  }

  private vocabBack(entry: VocabularyDocument): string {
    const parts = [entry.meaning];
    if (entry.pos) parts.push(`[${entry.pos}]`);
    return parts.join(" ");
  }

  private grammarFront(entry: GrammarPointDocument): string {
    return entry.structure ? `${entry.label} — ${entry.structure}` : entry.label;
  }

  private grammarBack(entry: GrammarPointDocument): string {
    const parts = [entry.meaning];
    if (entry.coreExplanation) parts.push(entry.coreExplanation);
    if (entry.forms?.length) parts.push(entry.forms.join("\n"));
    const example = entry.examples?.[0];
    if (example) parts.push(`${example.sentence}\n${example.translation}`);
    return parts.join("\n\n");
  }
}

const DEFAULT_DECK_TITLE = "Từ vựng của tôi";
