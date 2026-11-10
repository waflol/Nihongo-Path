import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { SRS_DEFAULT_STATE, type SrsState } from "../srs.algorithm.js";

/**
 * Per-user SRS state for one card (P3-SRS-02, database.md "user_card_progress").
 *
 * One document per `(user, card)` — the unique index makes multi-device
 * review a plain last-write-wins overwrite of the same document (P3-SRS-06,
 * "ghi sau thắng theo quy tắc rõ"): there is exactly one progress record, so
 * two concurrent reviews cannot fork it. The document is only ever mutated
 * through the SRS service, which re-anchors the due date to the user's
 * timezone on every review (P3-SRS-05).
 *
 * `state` embeds the versioned algorithm payload (ADR-srs, Q-03) — an
 * upgrade to FSRS adds a new shape here and reads the old one via
 * `state.schemaVersion`, without touching the collection.
 */
@Schema({ _id: true, timestamps: true })
export class UserCardProgress {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Flashcard", required: true })
  card: Types.ObjectId;

  /** Opaque SRS payload (SM-2 today; versioned for FSRS). */
  @Prop({ type: Object, default: SRS_DEFAULT_STATE })
  state: SrsState;

  /**
   * The day the card is due, in the user's timezone at the last review
   * (`YYYY-MM-DD`, from `localDayKey`). `dueAt` is the exact UTC instant.
   * Both are written together on every review.
   */
  @Prop({ type: Date, required: true })
  dueAt: Date;

  @Prop({ type: String, required: true })
  dueDay: string;

  /** How many times the card has been shown overall (all grades). */
  @Prop({ type: Number, default: 0 })
  seenCount: number;

  /** Epoch ms of the last review (multi-device ordering, P3-SRS-06). */
  @Prop({ type: Number, required: true })
  lastReviewedAtMs: number;

  // Managed by `@Schema({ timestamps: true })` — type-only.
  createdAt: Date;
  updatedAt: Date;
}

export type UserCardProgressDocument = HydratedDocument<UserCardProgress>;

export const UserCardProgressSchema =
  SchemaFactory.createForClass(UserCardProgress);
// One progress record per (user, card) — multi-device overwrite is a same-doc
// update, never a second record (P3-SRS-06).
UserCardProgressSchema.index({ user: 1, card: 1 }, { unique: true });
// The review queue: what is due for this user today (P3-SRS-02 / T-P3-05).
UserCardProgressSchema.index({ user: 1, dueDay: 1 });
// "Learned today" lookups (new-card allowance, exercise priority).
UserCardProgressSchema.index({ user: 1, createdAt: 1 });
