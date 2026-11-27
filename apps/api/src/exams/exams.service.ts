import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { randomInt } from "node:crypto";
import { Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import { User, type UserDocument } from "../users/schemas/user.schema.js";
import {
  ExerciseQuestion,
  type ExerciseQuestionDocument,
  EXERCISE_KINDS,
  type ExerciseKind,
} from "../flashcards/schemas/exercise-question.schema.js";
import { questionKey } from "../flashcards/exercise-questions.service.js";
import { Exam, type ExamDocument } from "./schemas/exam.schema.js";
import {
  ExamAttempt,
  type ExamAttemptDocument,
} from "./schemas/attempt.schema.js";
import {
  ExamStimulus,
  type ExamStimulusDocument,
} from "./schemas/stimulus.schema.js";
import { optionOrder as optionOrderFor, seededOrder, originalAt, groupedOrder, mixSeed } from "./shuffle.js";
import { optionCountsOf, contentHashOf, isListeningMondai } from "./mondai.js";

// ── Pure, DB-free core (unit-tested) ─────────────────────────────────

/**
 * A question whose options must stay in printed order: 聴解 options are heard as "1, 2, 3" or
 * numbered on its picture, so a shuffled button 1 would no longer be the option 1 played.
 */
export const keepsOptionOrder = (q: Pick<BankQuestion, "mondai" | "image">): boolean => isListeningMondai(q.mondai) || !!q.image;

/** A bank question as the exam engine sees it (lean row, no mongoose doc). */
export interface BankQuestion {
  _id: string;
  kind: ExerciseKind;
  prompt: string;
  sub?: string;
  options: string[];
  answer: string;
  explain?: string;
  // ── JLPT exam-bank fields (NP-406) — undefined on legacy rows ──────
  mondai?: string;
  section?: string;
  /** id of the shared reading passage this question belongs to. */
  stimulusId?: string;
  /** position within the passage / cloze blank number. */
  groupOrder?: number;
  /** points the question is worth (default 1). */
  points?: number;
  /** Listening clip (NP-410). */
  audio?: { assetId: string; startSec?: number; endSec?: number };
  /** The picture printed with the question (an `ExamImageService` id). */
  image?: string;
}

/** A shared reading passage, as the engine serves it (no answers). */
export interface StimulusView {
  id: string;
  kind: string;
  title?: string;
  body: string;
  bodyB?: string;
  notes?: string;
  imageUrl?: string;
  /** Listening clip shared by the group (NP-410). */
  audio?: { assetId: string; startSec?: number; endSec?: number };
}

/** The attempt snapshot the engine works on (plain, lean-shaped). */
export interface AttemptCore {
  _id?: string;
  exam: string;
  examTitle: string;
  examType?: string;
  level?: string;
  seed: number;
  /** Bank question ids in served order. */
  questionOrder: string[];
  /** Served positions → bank option index, per question id. */
  optionOrder: Record<string, number[]>;
  startedAtMs: number;
  deadlineMs?: number | null;
  status: "in_progress" | "submitted" | "timed_out";
  /** Bank question id → served option index (null = unanswered). */
  answers: Record<string, number | null>;
  flagged: string[];
  submittedAtMs?: number;
  durationSec?: number;
  score?: number;
  total?: number;
  percent?: number;
  /** Per-section cumulative deadlines (NP-406); absent on flat exams. */
  sectionDeadlinesMs?: Record<string, number>;
  /** Per-section grading (NP-406); absent on flat exams. */
  sectionScores?: Record<string, { score: number; total: number; points: number; maxPoints: number }>;
  /** Points-based totals (NP-406); absent on flat exams. */
  points?: number;
  maxPoints?: number;
  /** Snapshot of the exam's part keys (NP-406); empty on flat exams. */
  sectionKeys?: string[];
  /** Question id → section key (NP-406). */
  questionSections?: Record<string, string>;
}

/** One served question in the sit payload — NO `answer`, NO `explain` (P4-SEC-01). */
export interface SitQuestion {
  qid: string;
  kind: string;
  prompt: string;
  sub?: string;
  /** Options in the served order. */
  options: string[];
  /** Exam-bank fields (NP-406) — omitted on legacy questions. */
  mondai?: string;
  section?: string;
  /** This question belongs to the shared passage with this id. */
  stimulusId?: string;
  /** Position within the passage / cloze blank. */
  groupOrder?: number;
  /** Section key this question was drawn for (exam sections, NP-406). */
  sectionKey?: string;
  /** Listening clip (NP-410): the UI plays `assetId` from `startSec` to `endSec`. */
  audio?: { assetId: string; startSec?: number; endSec?: number };
  /** The picture printed with the question (options drawn as pictures, a 発話表現 scene). */
  image?: string;
}

/** An exam part as the sit payload describes it (NP-406). */
export interface SitSection {
  key: string;
  title?: string;
  /** Cumulative deadline (absolute ms) at which this part is due; null = untimed. */
  deadlineMs: number | null;
  /** 0 when finished/untimed. */
  remainingMs: number;
}

export interface SitPayload {
  attemptId: string;
  /** The exam the sitting belongs to ("Làm lại" / deep-link back to it). */
  examId: string;
  status: AttemptCore["status"];
  startedAtMs: number;
  deadlineMs: number | null;
  /** 0 when finished / untimed → the UI disables the clock. */
  remainingMs: number;
  exam: { title: string; examType?: string; level?: string; total: number };
  questions: SitQuestion[];
  answers: Record<string, number | null>;
  flagged: string[];
  // ── JLPT sectional layout (NP-406). Absent on flat exams. ─────────
  sections?: SitSection[];
  /** Shared passages, answer-free (only passages whose questions are in the exam). */
  stimuli?: StimulusView[];
  /** Points-based totals (absent on flat exams). */
  maxPoints?: number;
}

/** A finished-question entry in the result payload (explain appears ONLY here). */
export interface ResultQuestion extends SitQuestion {
  /** The learner's pick (served index), null when unanswered. */
  given: number | null;
  /** Served index of the correct option. */
  correctIndex: number;
  correct: boolean;
  explain?: string;
}

export interface ResultPayload extends Omit<SitPayload, "remainingMs"> {
  submittedAtMs: number;
  durationSec: number;
  score: number;
  total: number;
  percent: number;
  /** Points-based totals + per-section breakdown (NP-406, sectional exams only). */
  points?: number;
  maxPoints?: number;
  sectionScores?: Record<string, { score: number; total: number; points: number; maxPoints: number }>;
  /** JLPT-style 0–60 estimate per section — an ESTIMATE, not the official scale. */
  sectionEstimates?: Record<string, number>;
  results: ResultQuestion[];
}

/** One finished attempt row (for stats). */
export interface FinishedRow {
  attemptId: string;
  exam: string;
  examTitle: string;
  examType?: string;
  level?: string;
  status: "submitted" | "timed_out";
  percent: number;
  score: number;
  total: number;
  submittedAtMs: number;
}

/** Served positions for a question: the stored order, or identity when unset. */
export function positionsOf(attempt: Pick<AttemptCore, "optionOrder">, qid: string, optionCount: number): number[] {
  const stored = attempt.optionOrder?.[qid];
  if (stored && Array.isArray(stored) && stored.length === optionCount) return stored;
  return Array.from({ length: optionCount }, (_, i) => i);
}

/** Options of a bank question in the served order. */
export function servedOptions(q: BankQuestion, attempt: Pick<AttemptCore, "optionOrder">): string[] {
  const pos = positionsOf(attempt, q._id, q.options.length);
  return pos.map((p) => q.options[p] ?? "");
}

/** `true` when the pick (a served index) is the correct bank option. */
export function pickIsCorrect(q: BankQuestion, attempt: Pick<AttemptCore, "optionOrder">, given: number | null | undefined): boolean {
  const answerIndex = q.options.indexOf(q.answer);
  if (answerIndex < 0) return false; // bank invariant: answer ∈ options
  if (given === null || given === undefined || !Number.isInteger(given)) return false;
  return originalAt(positionsOf(attempt, q._id, q.options.length), given) === answerIndex;
}

/**
 * Grade every question of an attempt against the bank (P4-EXAM-06).
 * Unanswered / out-of-range picks are wrong. Deterministic — a concurrent
 * double submit yields the same numbers.
 *
 * When the attempt carries `questionSections` (a JLPT sectional exam, NP-406)
 * the grade also reports the **points** totals and the **per-section**
 * breakdown. `score` / `total` / `percent` keep their legacy meaning (number
 * of correct questions) so the old stats are unchanged.
 */
export interface GradeResult {
  correct: Record<string, boolean>;
  score: number;
  total: number;
  percent: number;
  /** Points earned (a correct question counts its `points`, default 1). */
  points?: number;
  /** Points on offer across the sitting. */
  maxPoints?: number;
  /** Per section: how many answered right / total / points earned / points. */
  sectionScores?: Record<string, { score: number; total: number; points: number; maxPoints: number }>;
}

export function gradeAttempt(
  questions: BankQuestion[],
  attempt: Pick<AttemptCore, "optionOrder" | "answers" | "questionSections">,
): GradeResult {
  const correct: Record<string, boolean> = {};
  let score = 0;
  let points = 0;
  let maxPoints = 0;
  for (const q of questions) {
    const ok = pickIsCorrect(q, attempt, attempt.answers?.[q._id] ?? null);
    correct[q._id] = ok;
    const pts = q.points ?? 1;
    maxPoints += pts;
    if (ok) {
      score += 1;
      points += pts;
    }
  }
  const total = questions.length;
  const base: GradeResult = {
    correct,
    score,
    total,
    percent: total === 0 ? 0 : Math.round((score / total) * 1000) / 10,
  };
  // Sectional exams (NP-406) add the points + per-section breakdown.
  const qsec = attempt.questionSections;
  if (qsec && Object.keys(qsec).length > 0) {
    const sectionScores: GradeResult["sectionScores"] = {};
    for (const q of questions) {
      const sec = qsec[q._id];
      if (!sec) continue;
      let s = sectionScores[sec];
      if (!s) sectionScores[sec] = s = { score: 0, total: 0, points: 0, maxPoints: 0 };
      s.total += 1;
      s.maxPoints += q.points ?? 1;
      if (correct[q._id]) {
        s.score += 1;
        s.points += q.points ?? 1;
      }
    }
    base.points = points;
    base.maxPoints = maxPoints;
    base.sectionScores = sectionScores;
  }
  return base;
}

/**
 * JLPT-style scaled estimate (NP-406 / plan §6, D7): each part is mapped to
 * 0–60, linear in the part's share of its points. Clearly an ESTIMATE — the
 * label is part of the name — the official conversion is a different curve.
 */
export function estimateJlptScaled(
  sectionScores: Record<string, { points: number; maxPoints: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [sec, s] of Object.entries(sectionScores)) {
    out[sec] = s.maxPoints > 0 ? Math.round(60 * (s.points / s.maxPoints)) : 0;
  }
  return out;
}

export interface BuildSitOptions {
  /** The sections to describe (absent on flat exams → the payload stays legacy-shaped). */
  sections?: { key: string; title?: string; deadlineMs: number | null }[];
  /** Shared passages whose questions the sitting serves (answer-free views). */
  stimuli?: StimulusView[];
  /** Points on offer (sectional exams). */
  maxPoints?: number;
}

/**
 * Build the sit payload — the ONLY shape the learner sees mid-exam.
 * Deliberately answer-free: no `answer`, no `explain`, no `correct` (P4-SEC-01,
 * T-P4-03). Questions are presented in the attempt's served order — the
 * caller's `bank` argument may be in any order; it is re-sorted here.
 * `opts` adds the JLPT sectional layer (NP-406); omitted → legacy payload.
 */
export function buildSitPayload(
  attempt: AttemptCore,
  bank: BankQuestion[],
  now: number,
  opts: BuildSitOptions = {},
): SitPayload {
  const finished = attempt.status !== "in_progress";
  const ordered = orderByAttempt(attempt, bank);
  const questions: SitQuestion[] = ordered.map((q) => ({
    qid: q._id,
    kind: q.kind,
    prompt: q.prompt,
    sub: q.sub || undefined,
    options: servedOptions(q, attempt),
    mondai: q.mondai,
    section: q.section,
    stimulusId: q.stimulusId,
    groupOrder: q.groupOrder,
    sectionKey: attempt.questionSections?.[q._id],
    audio: q.audio,
    image: q.image,
  }));
  const payload: SitPayload = {
    attemptId: String(attempt._id ?? ""),
    examId: attempt.exam,
    status: attempt.status,
    startedAtMs: attempt.startedAtMs,
    deadlineMs: attempt.deadlineMs ?? null,
    remainingMs: finished || !attempt.deadlineMs ? 0 : Math.max(0, (attempt.deadlineMs ?? 0) - now),
    exam: {
      title: attempt.examTitle,
      examType: attempt.examType || undefined,
      level: attempt.level || undefined,
      total: questions.length,
    },
    questions,
    answers: { ...attempt.answers },
    flagged: [...attempt.flagged],
  };
  if (opts.sections && opts.sections.length > 0) {
    payload.sections = opts.sections.map((s) => ({
      key: s.key,
      title: s.title,
      deadlineMs: s.deadlineMs,
      remainingMs: finished || !s.deadlineMs ? 0 : Math.max(0, s.deadlineMs - now),
    }));
  }
  if (opts.stimuli && opts.stimuli.length > 0) payload.stimuli = opts.stimuli;
  if (opts.maxPoints !== undefined) payload.maxPoints = opts.maxPoints;
  return payload;
}

/**
 * Reorder `bank` into the attempt's served question order (ids that are no
 * longer in the bank are dropped). When the attempt has no stored order, the
 * bank's own order is used.
 */
function orderByAttempt(attempt: AttemptCore, bank: BankQuestion[]): BankQuestion[] {
  if (attempt.questionOrder.length === 0) return bank;
  const byId = new Map(bank.map((q) => [q._id, q]));
  return attempt.questionOrder.map((id) => byId.get(id)).filter((q): q is BankQuestion => q !== undefined);
}

/** The result payload — adds the graded, explained questions (T-P4-05). */
export function buildResultPayload(
  attempt: AttemptCore,
  bank: BankQuestion[],
  grade: GradeResult,
  opts: BuildSitOptions = {},
): ResultPayload {
  const base = buildSitPayload(attempt, bank, 0, opts);
  const { remainingMs, ...sit } = base;
  const byId = new Map(bank.map((q) => [q._id, q]));
  // Results follow the sit display order, joined back to the bank by qid.
  const results: ResultQuestion[] = sit.questions.map((s) => {
    const q = byId.get(s.qid)!;
    const given = attempt.answers[q._id] ?? null;
    return {
      ...s,
      given,
      correctIndex: positionsOf(attempt, q._id, q.options.length).indexOf(q.options.indexOf(q.answer)),
      correct: grade.correct[q._id] ?? false,
      explain: q.explain || undefined,
    };
  });
  const payload: ResultPayload = {
    ...sit,
    status: attempt.status,
    submittedAtMs: attempt.submittedAtMs ?? 0,
    durationSec: attempt.durationSec ?? 0,
    score: grade.score,
    total: grade.total,
    percent: grade.percent,
    results,
  };
  // Sectional exams (NP-406): the points + per-section + the 0–60 estimate.
  if (grade.sectionScores) {
    payload.points = grade.points;
    payload.maxPoints = grade.maxPoints;
    payload.sectionScores = grade.sectionScores;
    payload.sectionEstimates = estimateJlptScaled(grade.sectionScores);
  }
  return payload;
}

/** Stats summary of finished attempts (T-P4-08: everything derived from the rows). */
export function summarizeAttempts(rows: FinishedRow[]): {
  attempts: number;
  avgPercent: number | null;
  byLevel: { level: string; attempts: number; avgPercent: number }[];
  byType: { examType: string; attempts: number; avgPercent: number }[];
  byExam: { exam: string; examTitle: string; attempts: number; bestPercent: number; lastPercent: number }[];
  recent: FinishedRow[];
} {
  const avg = (list: FinishedRow[]): number =>
    list.length === 0 ? 0 : Math.round((list.reduce((a, r) => a + r.percent, 0) / list.length) * 10) / 10;

  const group = <K extends string>(rows: FinishedRow[], keyOf: (r: FinishedRow) => K): Map<K, FinishedRow[]> => {
    const m = new Map<K, FinishedRow[]>();
    for (const r of rows) {
      const k = keyOf(r);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  };

  const byLevelMap = group(rows, (r) => r.level?.trim() || "Khác");
  const byTypeMap = group(rows, (r) => r.examType?.trim() || "Khác");
  const byExamMap = group(rows, (r) => r.exam);

  const byExam = [...byExamMap.entries()].map(([exam, list]) => {
    const sorted = [...list].sort((a, b) => b.submittedAtMs - a.submittedAtMs);
    return {
      exam,
      examTitle: list[0].examTitle,
      attempts: list.length,
      bestPercent: Math.max(...list.map((r) => r.percent)),
      lastPercent: sorted[0].percent,
    };
  });

  return {
    attempts: rows.length,
    avgPercent: rows.length === 0 ? null : avg(rows),
    byLevel: [...byLevelMap.entries()].map(([level, list]) => ({ level, attempts: list.length, avgPercent: avg(list) })),
    byType: [...byTypeMap.entries()].map(([examType, list]) => ({ examType, attempts: list.length, avgPercent: avg(list) })),
    byExam,
    recent: [...rows].sort((a, b) => b.submittedAtMs - a.submittedAtMs).slice(0, 10),
  };
}

/** Per-day series (last `days` days in the user's zone): attempts + average percent. */
export function examSeries(rows: FinishedRow[], days: number, dayKeyOf: (ms: number) => string, todayKey: string): { key: string; attempts: number; avgPercent: number | null }[] {
  // Calendar days of the zone: `todayKey` is the last one; step back with Intl.
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const zoneOf = (y: number, m: number, d: number) => dayKeyOf(Date.UTC(y, m - 1, d));
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(ty, tm - 1, td - i));
    keys.push(zoneOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  }
  const perDay = new Map<string, FinishedRow[]>();
  for (const r of rows) {
    const key = r.submittedAtMs ? dayKeyOf(r.submittedAtMs) : todayKey;
    perDay.set(key, [...(perDay.get(key) ?? []), r]);
  }
  return keys.map((key) => {
    const list = perDay.get(key) ?? [];
    return {
      key,
      attempts: list.length,
      avgPercent:
        list.length === 0
          ? null
          : Math.round((list.reduce((a, r) => a + r.percent, 0) / list.length) * 10) / 10,
    };
  });
}

/**
 * The deadline rule (P4-EXAM-04 / T-P4-02): an untimed sitting (no
 * `deadlineMs`) always finishes as `submitted`; a timed one that is past due
 * when it lands on the server is `timed_out` — the CLIENT'S clock is never
 * trusted.
 */
export function finishStatus(deadlineMs: number | null | undefined, now: number): "submitted" | "timed_out" {
  return deadlineMs !== null && deadlineMs !== undefined && now >= deadlineMs ? "timed_out" : "submitted";
}

// ── Service (Mongo layer) ────────────────────────────────────────────

const MAX_BANK_QUESTION = 400;

export interface AuthorQuestionInput {
  kind: string;
  prompt: string;
  sub?: string;
  options: string[];
  answer: string;
  explain?: string;
  level?: string;
  /** JLPT exam-bank fields (NP-406). */
  mondai?: string;
  section?: string;
  stimulus?: string;
  groupOrder?: number;
  points?: number;
  rights?: "own" | "licensed" | "reference";
}

/**
 * Exam engine (P4-EXAM-04…09): start / draft / submit with SERVER-side
 * deadline + grading, per-attempt shuffle, and admin authoring of the
 * question bank and the exams themselves.
 *
 * Correctness lives in the pure helpers above; this class is plumbing:
 * resolve the bank, load the attempt, hand the helpers the data. The
 * learner never receives a question's `answer` or `explain` before the
 * sitting is graded (P4-SEC-01).
 */
@Injectable()
export class ExamsService {
  constructor(
    @InjectModel(ExerciseQuestion.name)
    private readonly bank: Model<ExerciseQuestionDocument>,
    @InjectModel(Exam.name)
    private readonly exams: Model<ExamDocument>,
    @InjectModel(ExamAttempt.name)
    private readonly attempts: Model<ExamAttemptDocument>,
    @InjectModel(User.name)
    private readonly user: Model<UserDocument>,
    @InjectModel(ExamStimulus.name)
    private readonly stimuli: Model<ExamStimulusDocument>,
  ) {}

  // ── Learner surface ───────────────────────────────────────────────

  /** Published exams the caller may take, with question counts. */
  async listExams(filter: { level?: string; examType?: string; year?: number }) {
    const q: Record<string, unknown> = { status: "PUBLISHED" };
    if (filter.level) q.level = filter.level;
    if (filter.examType) q.examType = filter.examType;
    if (filter.year) q.year = filter.year;
    const rows = await this.exams.find(q).sort({ createdAt: -1 }).lean().exec();
    return rows.map((e) => ({
      _id: String(e._id),
      title: e.title,
      description: e.description || undefined,
      examType: e.examType || undefined,
      year: e.year,
      level: e.level || undefined,
      timeLimitMin: e.timeLimitMin ?? null,
      questionCount: e.questions?.length ?? 0,
      createdAt: e.createdAt,
    }));
  }

  /**
   * Start (or resume) a sitting. A second start while one is in progress
   * returns the SAME attempt — the partial unique index `(user, exam,
   * in_progress)` enforces it (T-P4-06); a retake after finishing creates
   * a fresh row.
   */
  async start(caller: AuthUser, examId: string): Promise<SitPayload | ResultPayload> {
    const exam = await this.exams.findById(examId).lean().exec();
    if (!exam || exam.status !== "PUBLISHED") throw new NotFoundException("Exam not found");
    if (exam.questions.length === 0) {
      throw new BadRequestException("Đề chưa có câu hỏi"); // T-P4-09
    }

    const userId = new Types.ObjectId(caller.sub);
    const examOid = new Types.ObjectId(exam._id as unknown as string);
    let attempt = await this.attempts.findOne({ user: userId, exam: examOid, status: "in_progress" }).exec();

    if (!attempt) {
      const now = Date.now();
      const seed = randomInt(0, 0x7fffffff);
      // Sectional exam (NP-406): order each part independently (groups stay
      // together), accumulate the per-part deadlines; a flat exam keeps the
      // legacy single order + single deadline.
      const sections = exam.sections;
      const sectional = Array.isArray(sections) && sections.length > 0;
      let found: BankQuestion[];
      const qids: string[] = [];
      const optionOrder: Record<string, number[]> = {};
      let deadlineMs: number | null = null;
      let sectionDeadlinesMs: Record<string, number> | undefined;
      let questionSections: Record<string, string> | undefined;
      let sectionKeys: string[] | undefined;
      if (sectional) {
        const ids = sections.flatMap((s) => s.questions).filter((id) => String(id));
        found = await this.loadBank(ids);
        const existing = new Set(found.map((q) => String(q._id)));
        const shuffleQ = exam.shuffle?.questions !== false;
        const shuffleO = exam.shuffle?.options !== false;
        const foundById = new Map(found.map((q) => [q._id, q]));
        sectionDeadlinesMs = {};
        questionSections = {};
        sectionKeys = [];
        let cursor = now;
        for (const sec of sections) {
          sectionKeys.push(sec.key);
          const secFound = sec.questions
            .filter((id) => existing.has(String(id)))
            .map((id) => foundById.get(String(id)))
            .filter((q): q is BankQuestion => q !== undefined);
          // 聴解 plays in the order of its recording: its questions are never shuffled.
          const heard = secFound.length > 0 && secFound.every((q) => isListeningMondai(q.mondai));
          const secIds =
            shuffleQ && !heard
              ? groupedOrder(mixSeed(seed, sec.key), secFound.map((q) => ({ id: q._id, group: q.stimulusId, groupOrder: q.groupOrder })))
              : secFound.map((q) => q._id);
          for (const qid of secIds) {
            questionSections[qid] = sec.key;
            optionOrder[qid] = optionOrderFor(seed, qid, foundById.get(qid)!.options.length, shuffleO && !keepsOptionOrder(foundById.get(qid)!));
            qids.push(qid);
          }
          if (sec.timeLimitMin) {
            cursor += sec.timeLimitMin * 60_000;
            sectionDeadlinesMs[sec.key] = cursor;
            deadlineMs = cursor;
          }
        }
      } else {
        found = await this.loadBank(exam.questions);
        const existing = new Set(found.map((q) => String(q._id)));
        const order = exam.questions.filter((id) => existing.has(String(id))).map((id) => String(id));
        const served = exam.shuffle?.questions !== false ? seededOrder(seed, order.length).map((p) => order[p]) : order;
        qids.push(...served);
        for (const q of found) {
          optionOrder[q._id] = optionOrderFor(seed, q._id, q.options.length, exam.shuffle?.options !== false && !keepsOptionOrder(q));
        }
        deadlineMs = exam.timeLimitMin ? now + exam.timeLimitMin * 60_000 : null;
      }
      if (qids.length === 0) {
        throw new BadRequestException("Đề chưa có câu hỏi"); // T-P4-09 (bank rows gone)
      }
      const doc = {
        user: userId,
        exam: examOid,
        examTitle: exam.title,
        examType: exam.examType || undefined,
        level: exam.level || undefined,
        seed,
        questionOrder: qids,
        optionOrder,
        startedAtMs: now,
        deadlineMs,
        status: "in_progress" as const,
        answers: {},
        flagged: [],
        ...(sectionDeadlinesMs ? { sectionDeadlinesMs } : {}),
        ...(questionSections ? { questionSections } : {}),
        ...(sectionKeys && sectionKeys.length > 0 ? { sectionKeys } : {}),
      };
      try {
        attempt = await this.attempts.create(doc);
      } catch (err) {
        // Concurrent start lost the race — resume the winner's attempt.
        if ((err as { code?: number }).code === 11000) {
          attempt = await this.attempts.findOne({ user: userId, exam: examOid, status: "in_progress" }).exec();
        }
        if (!attempt) throw err;
      }
    }

    // The sitting's questions are the SNAPSHOTTED order — editing the exam
    // afterwards must not move questions under a learner mid-sitting.
    const core = toCore(attempt);
    const bank = await this.bankFor(core);
    if (bank.length === 0) {
      // The bank rows were deleted after the attempt began: nothing to serve.
      throw new BadRequestException("Đề không còn câu hỏi nào hợp lệ");
    }
    if (finishStatus(core.deadlineMs, Date.now()) === "timed_out") {
      // The sitting lapsed while it sat open — grade it now.
      return await this.finalize(caller, String(attempt._id), "timed_out");
    }
    return buildSitPayload(core, bank, Date.now(), await this.sitOpts(core, bank));
  }

  /** List my sittings, newest first. */
  async listAttempts(caller: AuthUser) {
    const rows = await this.attempts
      .find({ user: new Types.ObjectId(caller.sub) })
      .sort({ startedAtMs: -1 })
      .limit(200)
      .select("exam examTitle examType level status percent score total startedAtMs deadlineMs submittedAtMs")
      .lean()
      .exec();
    return rows.map((r) => ({
      attemptId: String(r._id),
      exam: String(r.exam),
      examTitle: r.examTitle,
      examType: r.examType || undefined,
      level: r.level || undefined,
      status: r.status,
      percent: r.percent ?? null,
      score: r.score ?? null,
      total: r.total ?? null,
      startedAtMs: r.startedAtMs,
      deadlineMs: r.deadlineMs ?? null,
      submittedAtMs: r.submittedAtMs ?? null,
    }));
  }

  /**
   * One attempt, owner-only (T-P4-07: anyone else's attempt is a 404).
   * In progress → sit payload (a refresh restores the draft — T-P4-10);
   * finished → result payload with explanations.
   */
  async getAttempt(caller: AuthUser, attemptId: string): Promise<SitPayload | ResultPayload> {
    const attempt = await this.loadOwnedAttempt(caller, attemptId);
    const core = toCore(attempt);
    if (core.status !== "in_progress") {
      const bank = await this.bankFor(core);
      const grade = gradeAttempt(bank, core);
      return buildResultPayload(core, bank, grade, await this.sitOpts(core, bank));
    }
    if (finishStatus(core.deadlineMs, Date.now()) === "timed_out") {
      return await this.finalize(caller, attemptId, "timed_out");
    }
    const bank = await this.bankFor(core);
    return buildSitPayload(core, bank, Date.now(), await this.sitOpts(core, bank));
  }

  /**
   * Save a draft (answers / flags) — the autosave behind P4-UI-01. If the
   * deadline passed first, the sitting is graded as `timed_out` and the
   * result is returned so the UI can switch to the review screen.
   */
  async saveDraft(
    caller: AuthUser,
    attemptId: string,
    patch: { answers?: Record<string, number | null>; flagged?: string[] },
  ): Promise<{ status: "in_progress" } | ResultPayload> {
    const attempt = await this.loadOwnedAttempt(caller, attemptId);
    const core = toCore(attempt);
    if (core.status !== "in_progress") {
      const bank = await this.bankFor(core);
      return buildResultPayload(core, bank, gradeAttempt(bank, core), await this.sitOpts(core, bank));
    }
    if (finishStatus(core.deadlineMs, Date.now()) === "timed_out") {
      return await this.finalize(caller, attemptId, "timed_out");
    }

    const set: Record<string, unknown> = {};
    if (patch.answers) {
      const bank = await this.bankFor(core);
      const map = new Map<string, number | null>();
      const known = new Set(core.questionOrder);
      const capOf = new Map(bank.map((q) => [q._id, q.options.length - 1]));
      for (const [qid, v] of Object.entries(patch.answers)) {
        if (!known.has(qid)) continue;
        const cap = capOf.get(qid) ?? 3;
        map.set(qid, v === null ? null : Number.isInteger(v) ? Math.max(0, Math.min(cap, v)) : null);
      }
      set.answers = Object.fromEntries(map);
    }
    if (patch.flagged) {
      set.flagged = patch.flagged.filter((f) => core.questionOrder.includes(f)).slice(0, 200);
    }
    await this.attempts.updateOne({ _id: attempt._id, status: "in_progress" }, { $set: set }).exec();
    return { status: "in_progress" };
  }

  /** Submit: merge the answers, grade on the server, finish. */
  async submit(
    caller: AuthUser,
    attemptId: string,
    answers: Record<string, number | null> | undefined,
  ): Promise<ResultPayload> {
    const attempt = await this.loadOwnedAttempt(caller, attemptId);
    const core = toCore(attempt);
    if (core.status !== "in_progress") {
      const bank = await this.bankFor(core);
      const grade = gradeAttempt(bank, core);
      return buildResultPayload(core, bank, grade, await this.sitOpts(core, bank));
    }
    if (answers) {
      const bank = await this.bankFor(core);
      const known = new Set(core.questionOrder);
      const capOf = new Map(bank.map((q) => [q._id, q.options.length - 1]));
      const merged: Record<string, number | null> = { ...core.answers };
      for (const [qid, v] of Object.entries(answers)) {
        if (!known.has(qid)) continue;
        const cap = capOf.get(qid) ?? 3;
        merged[qid] = v === null ? null : Number.isInteger(v) ? Math.max(0, Math.min(cap, v)) : null;
      }
      await this.attempts
        .updateOne({ _id: attempt._id, status: "in_progress" }, { $set: { answers: merged } })
        .exec();
      core.answers = merged;
    }
    const timedOut = finishStatus(core.deadlineMs, Date.now()) === "timed_out";
    return await this.finalize(caller, attemptId, timedOut ? "timed_out" : "submitted");
  }

  /** P4-EXAM-08 — my progress: totals, by level / family / exam, 30-day series. */
  async stats(caller: AuthUser) {
    const [rows, tz] = await Promise.all([
      this.attempts
        .find({ user: new Types.ObjectId(caller.sub), status: { $in: ["submitted", "timed_out"] } })
        .sort({ submittedAtMs: -1 })
        .limit(1000)
        .select("exam examTitle examType level status percent score total submittedAtMs")
        .lean()
        .exec(),
      this.userTimezone(caller),
    ]);
    const finished: FinishedRow[] = rows.map((r) => ({
      attemptId: String(r._id),
      exam: String(r.exam),
      examTitle: r.examTitle,
      examType: r.examType,
      level: r.level,
      status: r.status as "submitted" | "timed_out",
      percent: r.percent ?? 0,
      score: r.score ?? 0,
      total: r.total ?? 0,
      submittedAtMs: r.submittedAtMs ?? 0,
    }));
    const [ty, tm, td] = todayParts(tz);
    const today = `${ty}-${pad2(tm)}-${pad2(td)}`;
    return {
      ...summarizeAttempts(finished),
      series: examSeries(finished, 30, (ms) => dayKeyInZone(ms, tz), today),
    };
  }

  // ── Admin surface (P4-EXAM-09) ───────────────────────────────────

  /**
   * Author a standalone bank question (deck / card = null). Same invariants
   * as the learner-generated rows: four distinct options, the answer among
   * them, text ≤ 400. Idempotent — same content upserts by `dedupeKey`.
   */
  async adminAuthorQuestion(caller: AuthUser, input: AuthorQuestionInput): Promise<{ saved: boolean; id: string }> {
    const kind = input.kind;
    if (!(EXERCISE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Unknown question kind: ${kind}`);
    }
    const options = (input.options ?? []).map((o) => String(o).trim());
    const answer = String(input.answer ?? "").trim();
    const prompt = String(input.prompt ?? "").trim();
    // Option count is per-type (NP-406): 4 for the printed forms, 3 or 4 for
    // listening; legacy / untyped questions keep exactly 4.
    const allowed = optionCountsOf(input.mondai);
    if (
      !prompt ||
      prompt.length > MAX_BANK_QUESTION ||
      !allowed.includes(options.length) ||
      new Set(options).size !== options.length ||
      options.some((o) => !o || o.length > MAX_BANK_QUESTION) ||
      !options.includes(answer)
    ) {
      throw new BadRequestException(
        `Câu hỏi không hợp lệ: cần tiêu đề, ${allowed.length === 1 ? "4" : allowed.join("/")} lựa chọn khác nhau và đáp án nằm trong các lựa chọn`,
      );
    }
    const key = questionKey("", "", kind, answer, options);
    const hash = contentHashOf(prompt, options);
    const res = await this.bank
      .updateOne(
        { dedupeKey: key },
        {
          $setOnInsert: {
            deck: null,
            card: null,
            kind,
            prompt,
            sub: String(input.sub ?? "").slice(0, MAX_BANK_QUESTION),
            options,
            answer,
            explain: String(input.explain ?? "").slice(0, MAX_BANK_QUESTION),
            source: "local",
            verified: true, // authored by the admin — the author is the source of truth
            level: String(input.level ?? "").slice(0, 8),
            mondai: input.mondai || undefined,
            section: input.section || undefined,
            stimulus: input.stimulus ? new Types.ObjectId(input.stimulus) : null,
            groupOrder: input.groupOrder ?? undefined,
            points: input.points ?? 1,
            rights: input.rights ?? "own",
            contentHash: hash,
            createdBy: caller.sub,
            dedupeKey: key,
          },
        },
        { upsert: true },
      )
      .exec();
    const doc = await this.bank.findOne({ dedupeKey: key }).select("_id").exec();
    return { saved: (res.upsertedCount ?? 0) > 0, id: String(doc?._id ?? "") };
  }

  /** The bank, filterable (admin listing + the exam composer's picker). */
  async adminListQuestions(query: { kind?: string; level?: string; q?: string; standalone?: boolean; limit?: number }) {
    const filter: Record<string, unknown> = {};
    if (query.kind && (EXERCISE_KINDS as readonly string[]).includes(query.kind)) filter.kind = query.kind;
    if (query.level) filter.level = query.level;
    if (query.standalone !== undefined) filter.card = query.standalone ? null : { $ne: null };
    if (query.q) filter.prompt = { $regex: escapeRegex(query.q), $options: "i" };
    const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
    const rows = await this.bank.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec();
    return rows.map((r) => ({
      _id: String(r._id),
      kind: r.kind,
      prompt: r.prompt,
      sub: r.sub || undefined,
      options: r.options,
      answer: r.answer,
      explain: r.explain || undefined,
      level: r.level || undefined,
      source: r.source,
      standalone: r.card === null || r.card === undefined,
      createdAt: r.createdAt,
    }));
  }

  /** All exams (any status), with their live question ids + counts. */
  async adminListExams() {
    const rows = await this.exams.find({}).sort({ createdAt: -1 }).lean().exec();
    return rows.map((e) => ({
      _id: String(e._id),
      title: e.title,
      description: e.description || undefined,
      examType: e.examType || undefined,
      year: e.year,
      level: e.level || undefined,
      timeLimitMin: e.timeLimitMin ?? null,
      shuffle: e.shuffle,
      status: e.status,
      questionIds: (e.questions ?? []).map((id) => String(id)),
      questionCount: e.questions?.length ?? 0,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  async adminCreateExam(caller: AuthUser, body: {
    title?: string;
    description?: string;
    examType?: string;
    year?: number;
    level?: string;
    timeLimitMin?: number;
    shuffle?: { questions?: boolean; options?: boolean };
    questionIds?: string[];
  }): Promise<{ id: string }> {
    const title = String(body.title ?? "").trim();
    if (title.length === 0) throw new BadRequestException("Đề thi thiếu tên");
    const questionIds = await this.resolveBankIds(body.questionIds ?? []);
    const doc = await this.exams.create({
      title: title.slice(0, 200),
      description: String(body.description ?? "").trim().slice(0, 500) || undefined,
      examType: String(body.examType ?? "").trim().slice(0, 100) || undefined,
      year: body.year ?? undefined,
      level: String(body.level ?? "").trim().slice(0, 8) || undefined,
      timeLimitMin: body.timeLimitMin ?? undefined,
      shuffle: { questions: body.shuffle?.questions !== false, options: body.shuffle?.options !== false },
      status: "DRAFT",
      questions: questionIds,
      createdBy: caller.sub,
    });
    return { id: String(doc._id) };
  }

  async adminUpdateExam(caller: AuthUser, examId: string, body: {
    title?: string;
    description?: string;
    examType?: string;
    year?: number;
    level?: string;
    timeLimitMin?: number;
    /** `true` → explicitly remove the time limit (untimed exam). */
    clearTimeLimit?: boolean;
    shuffle?: { questions?: boolean; options?: boolean };
    questionIds?: string[];
    status?: "DRAFT" | "PUBLISHED";
  }) {
    const exam = await this.exams.findById(examId).exec();
    if (!exam) throw new NotFoundException("Exam not found");
    // Rebuild from the lean doc: one plain `updateOne` so an unset field is
    // never leaked back as a stray `null`.
    const lean = exam.toObject() as typeof exam & {
      timeLimitMin?: number;
      shuffle: { questions: boolean; options: boolean };
      questions: Types.ObjectId[];
    };
    const next: Record<string, unknown> = {
      title: body.title !== undefined ? String(body.title).trim().slice(0, 200) : lean.title,
      description: body.description !== undefined ? String(body.description).trim().slice(0, 500) : (lean.description ?? undefined),
      examType: body.examType !== undefined ? String(body.examType).trim().slice(0, 100) : lean.examType,
      year: body.year !== undefined ? body.year : lean.year,
      level: body.level !== undefined ? String(body.level).trim().slice(0, 8) : lean.level,
      timeLimitMin: body.clearTimeLimit ? undefined : (body.timeLimitMin !== undefined ? body.timeLimitMin : (lean.timeLimitMin ?? undefined)),
      shuffle:
        body.shuffle !== undefined
          ? { questions: body.shuffle.questions !== false, options: body.shuffle.options !== false }
          : {
              questions: lean.shuffle?.questions !== false,
              options: lean.shuffle?.options !== false,
            },
      questions:
        body.questionIds !== undefined ? await this.resolveBankIds(body.questionIds) : lean.questions,
      status: body.status !== undefined ? body.status : lean.status,
    };
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) if (v !== undefined) set[k] = v;
    await this.exams.updateOne({ _id: exam._id }, { $set: set }).exec();
    return { id: examId };
  }

  async adminDeleteExam(examId: string) {
    const res = await this.exams.deleteOne({ _id: examId }).exec();
    if (res.deletedCount === 0) throw new NotFoundException("Exam not found");
    // Attempts keep their snapshots (examTitle etc.) — history is self-contained.
  }

  // ── Internals ─────────────────────────────────────────────────────

  /** Load the attempt, owner-only (T-P4-07). */
  private async loadOwnedAttempt(caller: AuthUser, attemptId: string): Promise<ExamAttemptDocument> {
    if (!Types.ObjectId.isValid(attemptId)) throw new NotFoundException("Attempt not found");
    const attempt = await this.attempts
      .findOne({ _id: new Types.ObjectId(attemptId), user: new Types.ObjectId(caller.sub) })
      .exec();
    if (!attempt) throw new NotFoundException("Attempt not found");
    return attempt;
  }

  /** Bank rows for the ids an attempt actually serves (missing ones drop out). */
  private async loadBank(ids: Types.ObjectId[]): Promise<BankQuestion[]> {
    const rows = await this.bank
      .find({ _id: { $in: ids } })
      .select("kind prompt sub options answer explain mondai section stimulus groupOrder points audio image")
      .lean()
      .exec();
    return rows.map((r) => ({
      _id: String(r._id),
      kind: r.kind,
      prompt: r.prompt,
      sub: r.sub,
      options: r.options,
      answer: r.answer,
      explain: r.explain,
      mondai: r.mondai,
      section: r.section,
      stimulusId: r.stimulus ? String(r.stimulus) : undefined,
      groupOrder: r.groupOrder,
      points: r.points,
      audio: r.audio ?? undefined,
      image: r.image || undefined,
    }));
  }

  /** The questions an attempt serves, in its stored order. */
  private async bankFor(core: AttemptCore): Promise<BankQuestion[]> {
    const found = await this.loadBank(core.questionOrder.map((id) => new Types.ObjectId(id)));
    return bankByOrder(found, core.questionOrder);
  }

  /**
   * The JLPT sectional layer (NP-406) for the sit/result payloads: the part
   * descriptors (cumulative deadlines from the attempt's snapshot) and the
   * answer-free shared passages the sitting serves. Flat exams → `{}` (the
   * legacy payload shape is untouched).
   */
  private async sitOpts(core: AttemptCore, bank: BankQuestion[]): Promise<BuildSitOptions> {
    if (!core.questionSections || Object.keys(core.questionSections).length === 0) return {};
    // Part descriptors from the stored snapshot (sectionKeys + sectionDeadlinesMs).
    const keys: string[] = core.sectionKeys ?? Object.keys(core.questionSections ?? {});
    const deadlines = core.sectionDeadlinesMs ?? {};
    const sections = keys.map((k) => ({ key: k, deadlineMs: deadlines[k] ?? null }));
    // Shared passages whose questions are in the sitting.
    const stimulusIds = [...new Set(bank.map((q) => q.stimulusId).filter((s): s is string => !!s))];
    let stimuli: StimulusView[] = [];
    if (stimulusIds.length > 0) {
      const rows = await this.stimuli
        .find({ _id: { $in: stimulusIds } })
        .select("kind title body bodyB notes imageUrl audio")
        .lean()
        .exec();
      const byId = new Map(rows.map((s) => [String(s._id), s]));
      stimuli = stimulusIds.flatMap((id) => {
        const s = byId.get(id);
        if (!s) return [];
        const view: StimulusView = {
          id,
          kind: s.kind,
          title: s.title || undefined,
          body: s.body,
          bodyB: s.bodyB || undefined,
          notes: s.notes || undefined,
          imageUrl: s.imageUrl || undefined,
          audio: s.audio ?? undefined,
        };
        return [view];
      });
    }
    const maxPoints = bank.reduce((a, q) => a + (q.points ?? 1), 0);
    return { sections, stimuli, maxPoints };
  }

  /**
   * Grade + finish a sitting exactly once. Deterministic: a late draft save
   * and a submit racing it both produce the same numbers.
   */
  private async finalize(caller: AuthUser, attemptId: string, status: "submitted" | "timed_out"): Promise<ResultPayload> {
    const attempt = await this.loadOwnedAttempt(caller, attemptId);
    const core = toCore(attempt);
    if (core.status !== "in_progress") {
      const bank = await this.bankFor(core);
      const grade = gradeAttempt(bank, core);
      return buildResultPayload(core, bank, grade, await this.sitOpts(core, bank));
    }
    const bank = await this.bankFor(core);
    const grade = gradeAttempt(bank, core);
    const now = Date.now();
    const submittedAtMs = status === "timed_out" && core.deadlineMs ? core.deadlineMs : now;
    const durationSec = Math.max(0, Math.round((submittedAtMs - core.startedAtMs) / 1000));
    const set: Record<string, unknown> = {
      status,
      submittedAtMs,
      durationSec,
      score: grade.score,
      total: grade.total,
      percent: grade.percent,
      correct: grade.correct,
    };
    if (grade.sectionScores) {
      set.sectionScores = grade.sectionScores;
      set.points = grade.points;
      set.maxPoints = grade.maxPoints;
    }
    await this.attempts
      .updateOne({ _id: attempt._id, status: "in_progress" }, { $set: set })
      .exec();
    core.status = status;
    core.submittedAtMs = submittedAtMs;
    core.durationSec = durationSec;
    core.score = grade.score;
    core.total = grade.total;
    core.percent = grade.percent;
    core.sectionScores = grade.sectionScores;
    core.points = grade.points;
    core.maxPoints = grade.maxPoints;
    return buildResultPayload(core, bank, grade, await this.sitOpts(core, bank));
  }

  /** Validate a question list against the bank; 400 when ids are unknown. */
  private async resolveBankIds(ids: string[]): Promise<Types.ObjectId[]> {
    const unique = [...new Set(ids)];
    const valid = unique.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length !== unique.length) {
      throw new BadRequestException("Có id câu hỏi không hợp lệ");
    }
    if (valid.length === 0) return [];
    const found = await this.bank
      .find({ _id: { $in: valid } }, { _id: 1 })
      .lean()
      .exec();
    const foundIds = new Set(found.map((f) => String(f._id)));
    const missing = valid.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Câu hỏi không còn tồn tại trong ngân hàng: ${missing.slice(0, 3).join(", ")}`);
    }
    return valid.map((id) => new Types.ObjectId(id));
  }

  private async userTimezone(caller: AuthUser): Promise<string> {
    const doc = await this.user.findById(caller.sub, { timezone: 1 }).exec();
    return doc?.timezone ?? "Asia/Ho_Chi_Minh";
  }
}

/** Mix helper kept local so the service file is the single place that composes seeds. */
function bankByOrder(found: BankQuestion[], order: string[]): BankQuestion[] {
  const byId = new Map(found.map((q) => [q._id, q]));
  return order.map((id) => byId.get(id)).filter((q): q is BankQuestion => q !== undefined);
}

/** Convert a mongoose attempt doc into the plain core the helpers take. */
function toCore(doc: ExamAttemptDocument): AttemptCore {
  const optionOrder: Record<string, number[]> = { ...(doc.optionOrder ?? {}) };
  const answers: Record<string, number | null> = { ...(doc.answers ?? {}) };
  return {
    _id: String(doc._id),
    exam: String(doc.exam),
    examTitle: doc.examTitle,
    examType: doc.examType,
    level: doc.level,
    seed: doc.seed,
    questionOrder: [...(doc.questionOrder ?? [])],
    optionOrder,
    startedAtMs: doc.startedAtMs,
    deadlineMs: doc.deadlineMs ?? null,
    status: doc.status,
    answers,
    flagged: [...(doc.flagged ?? [])],
    submittedAtMs: doc.submittedAtMs,
    durationSec: doc.durationSec,
    score: doc.score,
    total: doc.total,
    percent: doc.percent,
    sectionDeadlinesMs: doc.sectionDeadlinesMs,
    sectionScores: doc.sectionScores,
    points: doc.points,
    maxPoints: doc.maxPoints,
    sectionKeys: doc.sectionKeys,
    questionSections: doc.questionSections,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Today's `[y, m, d]` in a zone (same `Intl` primitive the SRS module uses). */
function todayParts(tz: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "1";
  return [Number(get("year")), Number(get("month")), Number(get("day"))];
}

/** `YYYY-MM-DD` of an instant in a zone. */
function dayKeyInZone(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
