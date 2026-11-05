import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const DECK_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type DeckStatus = (typeof DECK_STATUSES)[number];

/**
 * A flashcard deck (P3-CARD-01, spec §4.2–4.3, database.md "flashcard_decks").
 *
 * Two kinds coexist in one collection:
 * - **Shared** (`shared: true`) — admin-authored, read by any signed-in user
 *   (T-P3-08). `user` stays null.
 * - **Personal** (`shared: false`) — belongs to `user`, fully private
 *   (T-P3-07): only the owner may read or write it.
 *
 * Personal decks are the target of "save a word while learning" and of
 * personal imports; shared decks are seeded by admin imports.
 */
@Schema({ _id: true, timestamps: true })
export class FlashcardDeck {
  @Prop({ type: String, trim: true, required: true })
  title: string;

  @Prop({ type: String, trim: true })
  summary?: string;

  /** Owner of a personal deck; null for shared decks. */
  @Prop({ type: Types.ObjectId, ref: "User" })
  user?: Types.ObjectId | null;

  /** `true` → admin-authored, visible to all signed-in users. */
  @Prop({ type: Boolean, default: false })
  shared: boolean;

  /** Optional level tag (e.g. `N5`), free-form, mirrors content `level`. */
  @Prop({ type: String, trim: true })
  level?: string;

  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  @Prop({
    type: String,
    default: "PUBLISHED",
    enum: DECK_STATUSES,
  })
  status: DeckStatus;

  /** Example sentences still being generated after an import (progress). */
  @Prop({ type: Number, default: 0 })
  exampleTotal?: number;

  @Prop({ type: Number, default: 0 })
  exampleDone?: number;

  /** Publish the deck once its examples are generated (new deck from an import). */
  @Prop({ type: Boolean, default: false })
  publishWhenReady?: boolean;

  // Managed by `@Schema({ timestamps: true })` — type-only, see user.schema.ts.
  createdAt: Date;
  updatedAt: Date;
}

export type FlashcardDeckDocument = HydratedDocument<FlashcardDeck>;

export const FlashcardDeckSchema =
  SchemaFactory.createForClass(FlashcardDeck);
// Personal listing for one user; shared listing (user = null).
FlashcardDeckSchema.index({ user: 1, shared: 1, status: 1 });
