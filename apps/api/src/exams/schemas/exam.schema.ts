import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const EXAM_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/**
 * An exam: a named set of bank questions with a time limit and shuffle rules
 * (P4-EXAM-02). Admin-authored — questions come from the `exercise_questions`
 * bank (P4-EXAM-01), either learner-generated or standalone.
 *
 * `examType` is free-form (e.g. `JLPT N5 — Từ vựng`): the official-exam
 * rights question (Q-12, P4 half) stays open, so branding for real
 * JLPT / NAT titles is a decision, not a code path.
 *
 * The correct answer of every bank question NEVER lives on the exam —
 * grading happens on submit against the bank, and the sit payload strips
 * `answer`/`explain` (P4-SEC-01, T-P4-03).
 */
@Schema({ _id: true, timestamps: true, collection: "exams" })
export class Exam {
  @Prop({ type: String, trim: true, required: true })
  title: string;

  @Prop({ type: String, trim: true })
  description?: string;

  /** Free-form exam family label (e.g. "JLPT N5 — Từ vựng"). */
  @Prop({ type: String, trim: true, default: "" })
  examType?: string;

  /** Year the exam covers (e.g. 2025), when the family tracks years. */
  @Prop({ type: Number })
  year?: number;

  /** JLPT-style level tag (`N5`…`N1`); empty when the exam is not level-bound. */
  @Prop({ type: String, trim: true, default: "" })
  level?: string;

  /** Minutes to finish the exam; absent = untimed (P4-EXAM-02 "cấu hình được thời gian"). */
  @Prop({ type: Number, min: 1, max: 240 })
  timeLimitMin?: number;

  /** Question bank ids, in authoring order — the served order is the attempt's seed. */
  @Prop({ type: [Types.ObjectId], default: [] })
  questions: Types.ObjectId[];

  /** Shuffling (P4-EXAM-05): questions and/or the option order per question. */
  @Prop({
    type: {
      questions: { type: Boolean, default: true },
      options: { type: Boolean, default: true },
    },
    default: () => ({ questions: true, options: true }),
  })
  shuffle: { questions: boolean; options: boolean };

  @Prop({ type: String, enum: EXAM_STATUSES, default: "DRAFT" })
  status: ExamStatus;

  /** Admin who created the exam. */
  @Prop({ type: String, required: true })
  createdBy: string;

  // Managed by `@Schema({ timestamps: true })` — type-only.
  createdAt: Date;
  updatedAt: Date;
}

export type ExamDocument = HydratedDocument<Exam>;

export const ExamSchema = SchemaFactory.createForClass(Exam);
// "What can I take now" + admin listing: published first, by level / family.
ExamSchema.index({ status: 1, level: 1, examType: 1 });
