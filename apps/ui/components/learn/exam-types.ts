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
  /** JLPT bank fields (NP-406) — absent on legacy flat questions. */
  mondai?: string;
  section?: string;
  /** The question belongs to the shared passage with this id. */
  stimulusId?: string;
  groupOrder?: number;
  sectionKey?: string;
  /** Listening clip of this question (NP-410). */
  audio?: AudioRef;
  /** The picture printed with the question (options drawn as pictures, a 発話表現 scene). */
  image?: string;
}

/** URL of a question's picture. */
export const imageSrc = (id: string): string => `/api/exam-image/${encodeURIComponent(id)}`;

/** An exam part (文字・語彙 / 文法 / 読解 / 聴解) as the sit payload describes it. */
export interface SitSection {
  key: string;
  title?: string;
  /** Cumulative absolute deadline (ms); null = untimed. */
  deadlineMs: number | null;
  remainingMs: number;
}

/** A listening clip: the asset, and the stretch of it this question/passage plays (NP-410). */
export interface AudioRef {
  assetId: string;
  startSec?: number;
  endSec?: number;
}

/** Player URL for a clip; the `#t=` media fragment makes the browser play only the stretch. */
export function audioSrc(a: AudioRef): string {
  const t = a.startSec !== undefined || a.endSec !== undefined ? `#t=${a.startSec ?? 0}${a.endSec !== undefined ? `,${a.endSec}` : ""}` : "";
  return `/api/exam-audio/${encodeURIComponent(a.assetId)}${t}`;
}

/** A shared passage (answer-free). */
export interface Stimulus {
  id: string;
  kind: string;
  title?: string;
  body: string;
  bodyB?: string;
  notes?: string;
  imageUrl?: string;
  audioUrl?: string;
  /** Listening clip shared by the group. */
  audio?: AudioRef;
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
  /** JLPT sectional layout; absent on flat exams. */
  sections?: SitSection[];
  stimuli?: Stimulus[];
  maxPoints?: number;
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
  points?: number;
  sectionScores?: Record<string, { score: number; total: number; points: number; maxPoints: number }>;
  /** JLPT-style 0–60 estimate per section — an ESTIMATE, not the official scale. */
  sectionEstimates?: Record<string, number>;
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
