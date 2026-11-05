import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const CARD_KINDS = ["VOCABULARY", "GRAMMAR", "CUSTOM"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/**
 * Where a card came from. `manual` = created in the UI; `import` = a batch
 * import; `saved` = saved from learning (P3-CARD-04 / spec §4.2 "lưu từ").
 */
export const CARD_ORIGINS = ["manual", "import", "saved"] as const;
export type CardOrigin = (typeof CARD_ORIGINS)[number];

/** One example sentence on a card (inline subdocument). */
export interface CardExample {
  /** Japanese example sentence. */
  sentence: string;
  /** Translation (e.g. Vietnamese); may be empty. */
  translation?: string;
}

/**
 * A single flashcard (P3-CARD-02, spec §4.2–4.3, database.md "flashcards").
 *
 * A card belongs to exactly one deck and renders `front` → `back`. It may
 * wrap a content entry — a vocabulary term or a grammar point — for provenance
 * and future "edit through content"; the displayed `front`/`back` are stored on
 * the card so the study engine is self-contained and never goes stale if the
 * content entry is later edited or removed.
 *
 * `dedupeKey` is a stable content fingerprint scoped to the deck; the
 * `(deck, dedupeKey)` unique index makes "save a word" and import re-sends
 * idempotent (T-P3-03) and lets preview detect duplicates before writing
 * (T-P3-01/02).
 */
@Schema({ _id: true, timestamps: true })
export class Flashcard {
  /** Owning deck. */
  @Prop({ type: Types.ObjectId, ref: "FlashcardDeck", required: true })
  deck: Types.ObjectId;

  /** What this card represents. */
  @Prop({ type: String, enum: CARD_KINDS, default: "CUSTOM" })
  kind: CardKind;

  /** Provenance within the owning content entry, when `kind` is not CUSTOM. */
  @Prop({ type: Types.ObjectId, ref: "Vocabulary" })
  vocabulary?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: "GrammarPoint" })
  grammar?: Types.ObjectId | null;

  /** Question face (e.g. the Japanese term, a sentence with a blank, a rule). */
  @Prop({ type: String, trim: true, required: true })
  front: string;

  /** Answer face (e.g. reading + meaning, structure + usage). */
  @Prop({ type: String, trim: true, required: true })
  back: string;

  /** Optional example sentences shown on the answer face (0..N). */
  /** Hiragana reading; empty for hiragana/katakana-only words. */
  @Prop({ type: String, trim: true, default: "" })
  reading?: string;

  /** Mnemonic picture: a small data: URL (uploaded) or a Wikimedia https URL. */
  @Prop({ type: String, default: "" })
  image?: string;

  /** Attribution line for a suggested (Wikimedia Commons) image. */
  @Prop({ type: String, trim: true, default: "" })
  imageCredit?: string;

  /** Only verb / noun / adjective are distinguished. */
  @Prop({ type: String, enum: ["verb", "noun", "adjective", ""], default: "" })
  partOfSpeech?: "verb" | "noun" | "adjective" | "";

  @Prop({
    type: [
      {
        _id: false,
        sentence: { type: String, required: true, trim: true },
        translation: { type: String, trim: true, default: "" },
      },
    ],
    default: [],
  })
  examples: CardExample[];

  /** Âm Hán Việt supplied by the source (e.g. "DUY TRÌ"); empty = derive. */
  @Prop({ type: String, trim: true, default: "" })
  hanViet?: string;

  /** Position in the source list (STT) — keeps an imported file's order. */
  @Prop({ type: Number })
  order?: number;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, enum: CARD_ORIGINS, default: "manual" })
  origin: CardOrigin;

  /**
   * Stable fingerprint scoped to the deck, unique with `deck` — see above.
   * Set server-side so the client can never collide or spoof it.
   */
  @Prop({ type: String, required: true })
  dedupeKey: string;

  // Managed by `@Schema({ timestamps: true })` — type-only.
  createdAt: Date;
  updatedAt: Date;
}

export type FlashcardDocument = HydratedDocument<Flashcard>;

export const FlashcardSchema = SchemaFactory.createForClass(Flashcard);
// List the cards of one deck (P3-CARD-02 "index theo deckId").
FlashcardSchema.index({ deck: 1 });
// Idempotent save / import + duplicate detection within a deck.
FlashcardSchema.index({ deck: 1, dedupeKey: 1 }, { unique: true });
