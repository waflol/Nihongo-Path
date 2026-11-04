import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  FlashcardDeck,
  type DeckStatus,
  type FlashcardDeckDocument,
} from "./schemas/deck.schema.js";
import { CardOrigin, type FlashcardDocument } from "./schemas/card.schema.js";
import { CONTENT_ADMIN } from "../common/roles.js";
import type { AuthUser } from "../auth/auth.types.js";
import { cardDedupeKey } from "./dedupe.js";
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

/** Personal card write input (in the caller's own deck). */
export interface CardWriteInput {
  deckId: string;
  front: string;
  back: string;
  tags?: string[];
  /** `manual` (default) or `saved` — provenance only; never `import` here. */
  origin?: Exclude<CardOrigin, "import">;
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
export class FlashcardsService {
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
  ) {}

  // ── Decks ───────────────────────────────────────────────────────────

  /**
   * List the caller's decks: their personal decks + all published shared
   * decks. Personal decks of other users are never returned (T-P3-07).
   */
  async listDecks(caller: AuthUser): Promise<FlashcardDeckDocument[]> {
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
    return [...personal, ...shared];
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
      .sort({ _id: 1 })
      .limit(limit)
      .exec();
  }

  /**
   * Add a card to the caller's own personal deck. Idempotent by content:
   * the same (front, back) in the same deck is a conflict, not a duplicate
   * (T-P3-03). The `dedupeKey` is computed server-side — clients can't
   * spoof or collide it (P3-CARD-02).
   */
  async createCard(caller: AuthUser, input: CardWriteInput): Promise<FlashcardDocument> {
    const doc = await this.getDeck(caller, input.deckId);
    if (doc.shared) {
      throw new ForbiddenException("Cannot add cards to a shared deck");
    }
    const key = cardDedupeKey(input.front, input.back);
    const existing = await this.card
      .findOne({ deck: doc._id, dedupeKey: key })
      .exec();
    if (existing) {
      throw new ConflictException("An identical card already exists in this deck");
    }
    return this.card.create({
      deck: doc._id,
      front: input.front,
      back: input.back,
      tags: input.tags ?? [],
      origin: input.origin ?? "manual",
      dedupeKey: key,
    });
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
