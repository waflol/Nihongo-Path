/**
 * Client-side mirrors of the API's exam payloads (P4-UI-01/02).
 *
 * Two payload shapes cross the wire:
 * - `ExamSit` — while the sitting is in progress. Its questions carry ONLY
 *   the served options: no answer, no explanation (P4-SEC-01).
 * - `ExamResult` — after submit / time-out: per-question verdicts, the
 *   correct option, and the bank's explanation (T-P4-05).
 */

export type AttemptStatus = "in_progress" | "submitted" | "timed_out";

export interface ExamListItem {
  _id: string;
  title: string;
  description?: string;
  examType?: string;
  year?: number | null;
  level?: string;
  /** null = untimed. */
  timeLimitMin: number | null;
  questionCount: number;
  createdAt: string;
}

export interface AttemptListItem {
  attemptId: string;
  exam: string;
  examTitle: string;
  examType?: string;
  level?: string;
  status: AttemptStatus;
  percent: number | null;
  score: number | null;
  total: number | null;
  startedAtMs: number;
  deadlineMs: number | null;
  submittedAtMs: number | null;
}

export interface SitQuestion {
  qid: string;
  kind: string;
  prompt: string;
  sub?: string;
  /** Options in the order the learner sees them (served order). */
  options: string[];
}

interface ExamMeta {
  title: string;
  examType?: string;
  level?: string;
  total: number;
}

export interface ExamSit {
  attemptId: string;
  examId: string;
  status: AttemptStatus;
  startedAtMs: number;
  /** null = untimed exam. */
  deadlineMs: number | null;
  remainingMs: number;
  exam: ExamMeta;
  questions: SitQuestion[];
  /** question id → served option index (null = unanswered). */
  answers: Record<string, number | null>;
  flagged: string[];
}

export interface ResultQuestion extends SitQuestion {
  /** The learner's pick (served index), null = unanswered. */
  given: number | null;
  /** Served index of the correct option. */
  correctIndex: number;
  correct: boolean;
  explain?: string;
}

export interface ExamResult extends Omit<ExamSit, "remainingMs"> {
  submittedAtMs: number;
  durationSec: number;
  score: number;
  total: number;
  percent: number;
  results: ResultQuestion[];
}

/** Discriminated union: a result has `results`, a sit does not. */
export type ExamPayload = ExamSit | ExamResult;

export function isExamResult(p: ExamPayload): p is ExamResult {
  return "results" in p && Array.isArray((p as ExamResult).results);
}

export interface ExamStats {
  attempts: number;
  avgPercent: number | null;
  byLevel: { level: string; attempts: number; avgPercent: number }[];
  byType: { examType: string; attempts: number; avgPercent: number }[];
  byExam: { exam: string; examTitle: string; attempts: number; bestPercent: number; lastPercent: number }[];
  recent: {
    attemptId: string;
    examTitle: string;
    status: string;
    percent: number;
    submittedAtMs: number;
  }[];
  series: { key: string; attempts: number; avgPercent: number | null }[];
}
