import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { REVIEW_GRADES, type ReviewGrade } from "../srs.algorithm.js";

/**
 * Append-only review log (`srs_review_logs`, plan-fsrs-6 D4).
 *
 * One document per graded review. `reviewId` (client UUID) is unique per
 * user, so re-sending a batch never applies a review twice. This is the
 * input for measuring / optimizing the per-learner FSRS parameters.
 */
@Schema({ collection: "srs_review_logs", timestamps: false })
export class SrsReviewLog {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Flashcard", required: true })
  card: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "FlashcardDeck", required: true })
  deck: Types.ObjectId;

  @Prop({ type: String, required: true })
  reviewId: string;

  @Prop({ type: String, enum: REVIEW_GRADES, required: true })
  grade: ReviewGrade;

  /** Epoch ms of the review (after the D5 plausibility check). */
  @Prop({ type: Number, required: true })
  reviewedAt: number;

  /** True when the client's `reviewedAt` was rejected and server time used. */
  @Prop({ type: Boolean })
  clockAdjusted?: boolean;

  /** User-local date `YYYY-MM-DD`. */
  @Prop({ type: String, required: true })
  day: string;

  @Prop({ type: String, required: true })
  timezone: string;

  /** Days since the card's previous review (0 for the first). */
  @Prop({ type: Number, required: true })
  elapsedDays: number;

  @Prop({ type: Object, required: true })
  before: { stability?: number; difficulty?: number; schemaVersion: number };

  @Prop({ type: Object, required: true })
  after: {
    stability: number;
    difficulty: number;
    intervalDays: number;
    relearnHours: number;
  };

  /** "fsrs-4.5" | "fsrs-6" | "fsrs-6:user". */
  @Prop({ type: String, required: true })
  algorithm: string;
}

export type SrsReviewLogDocument = HydratedDocument<SrsReviewLog>;

export const SrsReviewLogSchema = SchemaFactory.createForClass(SrsReviewLog);
SrsReviewLogSchema.index({ user: 1, reviewId: 1 }, { unique: true });
SrsReviewLogSchema.index({ user: 1, card: 1, reviewedAt: 1 });
SrsReviewLogSchema.index({ user: 1, reviewedAt: 1 });
