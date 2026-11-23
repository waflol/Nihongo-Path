import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * Where the learner's feedback points at. `card` stays in the legacy
 * `card_reports` collection; everything below is a *general* feedback
 * row (P5-FEEDBACK-01): vocabulary notes, transcript issues, translation
 * corrections, or anything else without a structured target.
 */
export const FEEDBACK_SOURCES = [
  "vocabulary",
  "grammar",
  "transcript",
  "translation",
  "exam",
  "general",
] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

export const FEEDBACK_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** One admin status change + note (P5-FEEDBACK-02 processing history). */
export interface FeedbackHistoryEntry {
  from?: FeedbackStatus;
  to: FeedbackStatus;
  /** Admin who made the change (id; anonymised on account deletion). */
  by?: Types.ObjectId;
  note?: string;
  at: Date;
}

/**
 * A learner's general feedback message (P5-FEEDBACK-01). Unlike
 * `card_reports` (a report *about* a card), this is free-form: wrong
 * reading, bad AI translation, a broken transcript, a suggestion, …
 * `status` + embedded `history` give the admin inbox the audit trail
 * required by P5-FEEDBACK-02.
 */
@Schema({ _id: true, timestamps: true })
export class UserFeedback {
  @Prop({ type: String, enum: FEEDBACK_SOURCES, required: true, index: true })
  source: FeedbackSource;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  user: Types.ObjectId;

  /** Optional structured target (a card id, an exam attempt id, …). */
  @Prop({ type: String, maxlength: 64 })
  targetId?: string;

  /** What the learner saw, snapshotted so the thread stays readable. */
  @Prop({ type: String, maxlength: 500 })
  context?: string;

  @Prop({ type: String, trim: true, required: true, maxlength: 4000 })
  message: string;

  /** Suggested fix / expectation (optional). */
  @Prop({ type: String, trim: true, maxlength: 4000 })
  suggestion?: string;

  @Prop({ type: String, enum: FEEDBACK_STATUSES, default: "OPEN", index: true })
  status: FeedbackStatus;

  @Prop({
    type: [
      {
        from: { type: String, enum: FEEDBACK_STATUSES },
        to: { type: String, enum: FEEDBACK_STATUSES, required: true },
        by: { type: Types.ObjectId, ref: "User" },
        note: { type: String, maxlength: 1000 },
        at: { type: Date, required: true, default: () => new Date() },
      },
    ],
    default: [],
  })
  history: FeedbackHistoryEntry[];

  createdAt: Date;
  updatedAt: Date;
}

export type UserFeedbackDocument = HydratedDocument<UserFeedback>;
export const UserFeedbackSchema = SchemaFactory.createForClass(UserFeedback);
UserFeedbackSchema.index({ status: 1, createdAt: -1 });
