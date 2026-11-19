/**
 * FSRS-6 scheduling shared by the API and the UI (plan-fsrs-6 D2).
 *
 * A thin adapter over `ts-fsrs` (pinned): pure — no clock, no I/O — so the
 * same review sequence always yields the same state. The server composes due
 * dates (timezone-anchored, `srs.days.ts`); this module only advances the
 * memory state and says how many days / hours until the next review.
 *
 * UX contract (unchanged from FSRS-4.5): four grades; AGAIN relearns in 10
 * minutes (interval kept); other grades give a whole number of days ≥ 1.
 * `enable_short_term` is off so ts-fsrs applies no learning steps — the
 * 10-minute relearn is ours.
 *
 * Legacy fields `ease`, `repetitions`, `intervalDays`, `lapses` are still
 * maintained for queue classification. v1 (SM-2) and v2 (FSRS-4.5) rows are
 * upgraded lazily on their next review: S and D carry over unchanged (same
 * meaning: S = days for R to fall to 90%).
 */
import {
  createEmptyCard,
  default_w,
  fsrs,
  generatorParameters,
  State,
  type Card,
  type FSRS,
  type Grade as LibGrade,
} from "ts-fsrs";

export const REVIEW_GRADES = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

export interface SrsState {
  /** 1 = SM-2 (legacy), 2 = FSRS-4.5, 3 = FSRS-6. */
  schemaVersion: 1 | 2 | 3;
  algorithm: "sm2" | "fsrs" | "fsrs6";
  /** Derived from difficulty (2.5 ≈ average) — kept for legacy consumers. */
  ease: number;
  repetitions: number;
  /** Last scheduled interval in days (0 = card not yet graduated). */
  intervalDays: number;
  /** Times answered AGAIN — the "khó nhớ" signal. */
  lapses: number;
  stability?: number;
  difficulty?: number;
  /** Epoch ms of the last review. */
  lastReviewAt?: number;
}

export const SRS_DEFAULT_STATE: SrsState = Object.freeze({
  schemaVersion: 3,
  algorithm: "fsrs6",
  ease: 2.5,
  repetitions: 0,
  intervalDays: 0,
  lapses: 0,
});

export interface Review {
  grade: ReviewGrade;
  /** Epoch ms of the review. */
  now: number;
}

export interface SrsOutcome {
  state: SrsState;
  /** Days until due (≥ 1) for a successful review. */
  intervalDays: number;
  /** Set for a lapse (10-minute relearn), in hours; 0 otherwise. */
  relearnHours: number;
  grade: ReviewGrade;
}

export interface SrsParams {
  /** 21 FSRS-6 weights. */
  w: number[];
  requestRetention: number;
}

export const DEFAULT_SRS_PARAMS: SrsParams = Object.freeze({
  w: [...default_w],
  requestRetention: 0.9,
}) as SrsParams;

export const MAX_INTERVAL_DAYS = 36500;
export const MIN_INTERVAL_DAYS = 1;
export const RELEARN_MINUTES = 10;
const DAY_MS = 86_400_000;

const RATING: Record<ReviewGrade, LibGrade> = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

const schedulers = new WeakMap<SrsParams, FSRS>();
function scheduler(params: SrsParams): FSRS {
  let f = schedulers.get(params);
  if (!f) {
    f = fsrs(
      generatorParameters({
        w: params.w,
        request_retention: params.requestRetention,
        maximum_interval: MAX_INTERVAL_DAYS,
        enable_fuzz: false,
        enable_short_term: false,
      }),
    );
    schedulers.set(params, f);
  }
  return f;
}

/** Difficulty after a first GOOD review (maps to ease 2.5). */
const D0_GOOD = (() => {
  const t = new Date(0);
  return scheduler(DEFAULT_SRS_PARAMS).repeat(createEmptyCard(t), t)[3].card.difficulty;
})();

function difficultyToEase(d: number): number {
  return round3(clamp(2.5 + (D0_GOOD - d) * 0.2, 1.3, 3.5));
}
function easeToDifficulty(ease: number): number {
  return clamp(D0_GOOD + (2.5 - ease) / 0.2, 1, 10);
}

/** The ts-fsrs card for a stored state, or a new card (never reviewed). */
function toCard(prev: SrsState, now: number): Card {
  let stability = prev.stability;
  let difficulty = prev.difficulty;
  if (stability === undefined || difficulty === undefined) {
    if (prev.intervalDays <= 0) return createEmptyCard(new Date(now));
    // v1 (SM-2) row: interval ≈ stability, difficulty from ease.
    stability = Math.max(prev.intervalDays, 0.1);
    difficulty = easeToDifficulty(prev.ease);
  }
  // Legacy rows without a review time: assume it was reviewed on schedule.
  const last = prev.lastReviewAt ?? now - prev.intervalDays * DAY_MS;
  return {
    due: new Date(last + prev.intervalDays * DAY_MS),
    stability,
    difficulty,
    scheduled_days: prev.intervalDays,
    learning_steps: 0,
    reps: prev.repetitions,
    lapses: prev.lapses,
    state: State.Review,
    last_review: new Date(last),
  };
}

const clampInterval = (days: number) =>
  clamp(Math.round(days), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);

export function advanceSrs(
  prev: SrsState,
  review: Review,
  params: SrsParams = DEFAULT_SRS_PARAMS,
): SrsOutcome {
  const now = new Date(review.now);
  const card = scheduler(params).repeat(toCard(prev, review.now), now)[RATING[review.grade]]
    .card;
  const lapse = review.grade === "AGAIN";
  const intervalDays = lapse ? prev.intervalDays : clampInterval(card.scheduled_days);

  const state: SrsState = {
    schemaVersion: 3,
    algorithm: "fsrs6",
    ease: difficultyToEase(card.difficulty),
    repetitions: lapse ? 0 : prev.repetitions + 1,
    intervalDays,
    lapses: prev.lapses + (lapse ? 1 : 0),
    stability: round3(card.stability),
    difficulty: round3(card.difficulty),
    lastReviewAt: review.now,
  };
  return {
    state,
    intervalDays,
    relearnHours: lapse ? RELEARN_MINUTES / 60 : 0,
    grade: review.grade,
  };
}

/** Next interval for each of the four buttons (for the button labels). */
export function previewIntervals(
  prev: SrsState,
  now: number,
  params: SrsParams = DEFAULT_SRS_PARAMS,
): Record<ReviewGrade, { days: number; relearnMinutes: number }> {
  const out = {} as Record<ReviewGrade, { days: number; relearnMinutes: number }>;
  for (const grade of REVIEW_GRADES) {
    const o = advanceSrs(prev, { grade, now }, params);
    out[grade] = { days: o.intervalDays, relearnMinutes: o.relearnHours * 60 };
  }
  return out;
}
