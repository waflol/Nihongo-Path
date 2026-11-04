import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * A study session (P3-SRS-04, database.md "study_sessions").
 *
 * One document per (user, day, device-class) summarises a review sitting:
 * how many cards were shown, the grade breakdown, and the wall-clock day in
 * the user's timezone so "today's session" is meaningful to them, not to
 * the server. Sessions are append-only stats (read for the "tiến độ"
 * screen, P3-UI-03); the SRS state itself lives in `user_card_progress`.
 */
export const SESSION_DEVICE = ["web", "mobile", "unknown"] as const;
export type SessionDevice = (typeof SESSION_DEVICE)[number];

@Schema({ _id: true, timestamps: true })
export class StudySession {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  /** Optional owning deck (null = a cross-deck "everything due" session). */
  @Prop({ type: Types.ObjectId, ref: "FlashcardDeck" })
  deck?: Types.ObjectId | null;

  /** The user-local date of the sitting, `YYYY-MM-DD` (P3-SRS-05). */
  @Prop({ type: String, required: true })
  day: string;

  /** IANA zone the sitting happened in — recorded, not assumed. */
  @Prop({ type: String, required: true })
  timezone: string;

  @Prop({ type: String, enum: SESSION_DEVICE, default: "unknown" })
  device: SessionDevice;

  @Prop({ type: Number, default: 0 })
  cardsReviewed: number;

  /** Grade histogram for the sitting (`{ AGAIN: n, HARD: n, … }`). */
  @Prop({ type: Object, default: () => ({}) })
  grades: Record<string, number>;

  /** Epoch ms the sitting started. */
  @Prop({ type: Number, required: true })
  startedAtMs: number;

  /** Epoch ms the sitting ended. */
  @Prop({ type: Number })
  endedAtMs?: number;

  // Managed by `@Schema({ timestamps: true })` — type-only.
  createdAt: Date;
  updatedAt: Date;
}

export type StudySessionDocument = HydratedDocument<StudySession>;

export const StudySessionSchema =
  SchemaFactory.createForClass(StudySession);
// "My sessions this month", newest first (P3-UI-03 progress).
StudySessionSchema.index({ user: 1, day: -1 });
