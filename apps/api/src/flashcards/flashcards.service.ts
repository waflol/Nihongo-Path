import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
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
import { cardDedupeKey, cardDedupeKeyForCopy } from "./dedupe.js";
import { ExampleSuggestService } from "./example-suggest.service.js";
import type { VocabularyDocument } from "../content/schemas/vocabulary.schema.js";
import type { GrammarPointDocument } from "../content/schemas/grammar-point.schema.js";
import type { UserCardProgressDocument } from "../srs/schemas/progress.schema.js";

/** Personal deck write input (the caller's own deck). */
export interface DeckWriteInput {
  title: string;
  summary?: string;
  level?: string;
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
  partOfSpeech?: "verb" | "noun" | "adjective" | "";
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
  lang: string;
  status: string;
  shared: boolean;
  user: string | null;
  cardCount: number;
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
  ) {}

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
      lang: input.lang,
      status: input.status ?? "PUBLISHED",
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
      });
      if (suggestion) {
        examples = [
          { sentence: suggestion.sentence, translation: suggestion.translation },
        ];
      }
    }
    return this.card.create({
      deck: doc._id,
      front: input.front,
      back: input.back,
      reading: input.reading?.trim() ?? "",
      image: input.image ?? "",
      imageCredit: input.imageCredit?.trim() ?? "",
      partOfSpeech: input.partOfSpeech ?? "",
      examples,
      tags: input.tags ?? [],
      origin: input.origin ?? "manual",
      dedupeKey: key,
    });
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
      lang: doc.lang,
      status: doc.status,
      shared: doc.shared,
      user: doc.user ? String(doc.user) : null,
      cardCount,
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
      partOfSpeech?: "verb" | "noun" | "adjective" | "";
      examples?: CardExample[];
      tags?: string[];
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

    const front = input.front?.trim() ?? cardDoc.front;
    const back = input.back?.trim() ?? cardDoc.back;
    if (front === "" || back === "") {
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
    if (input.examples !== undefined) cardDoc.examples = cleanExamples(input.examples);
    if (input.tags !== undefined) cardDoc.tags = input.tags;
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
    const entry = await this.grammar
      .findById(new Types.ObjectId(grammarId))
      .exec();
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
    return entry.meaning;
  }
}

const DEFAULT_DECK_TITLE = "Từ vựng của tôi";
