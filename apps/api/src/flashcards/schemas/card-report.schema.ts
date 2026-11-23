import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const REPORT_KINDS = ["translation", "hanviet", "example", "reading", "other"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "REJECTED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** One admin status change (P5-FEEDBACK-02 processing history). */
export interface ReportHistoryEntry {
  from?: ReportStatus;
  to: ReportStatus;
  /** Admin who made the change. */
  by?: Types.ObjectId;
  note?: string;
  at: Date;
}

/**
 * A learner's error report / suggested correction on a card of a shared deck
 * (wrong translation, wrong Hán-Việt, bad example, …). Admins review these.
 * The card's text is snapshotted so the report stays readable after edits.
 */
@Schema({ _id: true, timestamps: true })
export class CardReport {
  @Prop({ type: Types.ObjectId, ref: "Flashcard", required: true, index: true })
  card: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "FlashcardDeck", required: true })
  deck: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: REPORT_KINDS, required: true })
  kind: ReportKind;

  /** What is wrong, in the reporter's words. */
  @Prop({ type: String, trim: true, default: "", maxlength: 1000 })
  message: string;

  /** The reporter's proposed correct text. */
  @Prop({ type: String, trim: true, default: "", maxlength: 1000 })
  suggestion: string;

  @Prop({ type: String, default: "" }) cardFront: string;
  @Prop({ type: String, default: "" }) cardBack: string;
  @Prop({ type: String, default: "" }) cardHanViet: string;
  @Prop({ type: String, default: "" }) deckTitle: string;

  @Prop({ type: String, enum: REPORT_STATUSES, default: "OPEN", index: true })
  status: ReportStatus;

  /** Every admin status change (who / from → to / note / when). */
  @Prop({
    type: [
      {
        from: { type: String, enum: REPORT_STATUSES },
        to: { type: String, enum: REPORT_STATUSES, required: true },
        by: { type: Types.ObjectId, ref: "User" },
        note: { type: String, maxlength: 1000 },
        at: { type: Date, required: true, default: () => new Date() },
      },
    ],
    default: [],
  })
  history: ReportHistoryEntry[];
}

export type CardReportDocument = HydratedDocument<CardReport>;
export const CardReportSchema = SchemaFactory.createForClass(CardReport);
CardReportSchema.index({ user: 1, card: 1, kind: 1, status: 1 });
