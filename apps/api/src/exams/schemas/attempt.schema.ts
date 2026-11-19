import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const ATTEMPT_STATUSES = ["in_progress", "submitted", "timed_out"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/**
 * One sitting of one exam by one user (P4-EXAM-03).
 *
 * Two rules keep the attempt self-contained and tamper-proof:
 * - **Snapshots**: the exam title / family / level are copied onto the
 *   attempt, so deleting (or renaming) the exam never breaks history and
 *   stats run without a join.
 * - **Served-order answers**: `answers` maps question id → the index the
 *   learner saw the option at (the attempt's `optionOrder` maps it back to
 *   the bank). Grading happens on the server (P4-EXAM-06); the client only
 *   reports served indices, and a finished attempt's `correct` map is
 *   written exactly once, by the grader.
 *
 * One active sitting per (user, exam): the partial unique index on
 * `status: "in_progress"` makes a second start resume, never fork
 * (T-P4-06); a retake after finishing is a brand-new row.
 */
@Schema({ _id: true, timestamps: true, collection: "exam_attempts" })
export class ExamAttempt {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Exam", required: true })
  exam: Types.ObjectId;

  // ── Snapshots of the exam the sitting started from ────────────────
  @Prop({ type: String, required: true })
  examTitle: string;

  @Prop({ type: String })
  examType?: string;

  @Prop({ type: String })
  level?: string;

  /** 32-bit seed every shuffle of the sitting was drawn from (P4-EXAM-05). */
  @Prop({ type: Number, required: true })
  seed: number;

  /** Bank question ids in the order they were served (empty when unshuffled). */
  @Prop({ type: [String], default: [] })
  questionOrder: string[];

  /**
   * Per bank question: the served option positions as indices into the bank
   * option list (empty when the exam does not shuffle options).
   */
  @Prop({ type: Object, default: () => ({}) })
  optionOrder: Record<string, number[]>;

  @Prop({ type: Number, required: true })
  startedAtMs: number;

  /** UTC instant the sitting is due; null = untimed exam. */
  @Prop({ type: Number })
  deadlineMs?: number | null;

  @Prop({ type: String, enum: ATTEMPT_STATUSES, default: "in_progress" })
  status: AttemptStatus;

  /** Learner picks, question id → served option index (`null` = unanswered).
   * Plain embedded JSON — `type: Object` never casts the nulls a Map would. */
  @Prop({ type: Object, default: () => ({}) })
  answers: Record<string, number | null>;

  /** Questions the learner flagged to revisit (P4-UI-01 "cờ đánh dấu"). */
  @Prop({ type: [String], default: [] })
  flagged: string[];

  @Prop({ type: Number })
  submittedAtMs?: number;

  /** Elapsed minutes the sitting took (finished attempts). */
  @Prop({ type: Number })
  durationSec?: number;

  // ── Graded (written once, on submit / time-out) ──────────────────
  /** Grader's verdict per question, written by the server only. */
  @Prop({ type: Object, default: () => ({}) })
  correct: Record<string, boolean>;

  /** `0`…`total` — how many bank questions the sitting answered right. */
  @Prop({ type: Number, default: 0 })
  score: number;

  @Prop({ type: Number, default: 0 })
  total: number;

  /** `score / total` as 0–100 (0 when untaken / empty exam). */
  @Prop({ type: Number, default: 0 })
  percent: number;

  // ── JLPT sectional scoring (NP-406). Absent on flat exams. ────────
  /** Points-based totals (a question's `points`, not its count). */
  @Prop({ type: Number })
  points?: number;

  @Prop({ type: Number })
  maxPoints?: number;

  /** Per-section verdicts: `{score; total; points; maxPoints}`. */
  @Prop({ type: Object })
  sectionScores?: Record<string, { score: number; total: number; points: number; maxPoints: number }>;

  /**
   * Per-section cumulative deadlines (NP-406, v1 fixed accumulation):
   * `{ key: absoluteMs }`. The overall `deadlineMs` is the last one.
   */
  @Prop({ type: Object })
  sectionDeadlinesMs?: Record<string, number>;

  /** Snapshot of the exam's parts: `[{key, title}]` (empty on flat exams). */
  @Prop({ type: [String], default: [] })
  sectionKeys: string[];

  /** Question id → the section key it was drawn for (NP-406). */
  @Prop({ type: Object })
  questionSections?: Record<string, string>;

  // Managed by `@Schema({ timestamps: true })` — type-only.
  createdAt: Date;
  updatedAt: Date;
}

export type ExamAttemptDocument = HydratedDocument<ExamAttempt>;

export const ExamAttemptSchema = SchemaFactory.createForClass(ExamAttempt);
// One active sitting per (user, exam) (T-P4-06).
ExamAttemptSchema.index(
  { user: 1, exam: 1 },
  { unique: true, partialFilterExpression: { status: "in_progress" } },
);
// "My attempts" list, newest first.
ExamAttemptSchema.index({ user: 1, startedAtMs: -1 });
// Stats (P4-EXAM-08): finished attempts grouped by level / family.
ExamAttemptSchema.index({ exam: 1, status: 1 });
