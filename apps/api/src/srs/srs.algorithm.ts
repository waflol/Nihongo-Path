/**
 * FSRS-4.5 spaced-repetition schedule (replaces SM-2; ADR-srs, Q-03 "dự phòng FSRS").
 *
 * Pure — no clock, no I/O, no timezone — so the same feedback sequence always
 * yields the same state transitions (T-P3-04); day-boundary handling lives in
 * `srs.days.ts`, persistence / due-date composition in `srs.service.ts`.
 *
 * Grading (the UI's four review buttons):
 * 0 = AGAIN (forgot) · 1 = HARD · 2 = GOOD · 3 = EASY
 *
 * Memory model (DSR): each card has a **stability** S (days for retrievability
 * to fall from 100% to 90%) and a **difficulty** D (1–10). Retrievability after
 * t days is R = (1 + FACTOR·t/S)^DECAY. The next interval is the t at which R
 * equals the target retention (90% → interval ≈ S).
 *
 * Backward compatibility: the legacy fields `ease`, `repetitions`,
 * `intervalDays`, `lapses` are still maintained (ease is derived from
 * difficulty) so existing queue classification / aggregations keep working.
 * Legacy SM-2 rows (no `stability`) are upgraded lazily on their next review.
 */

/** Review grades the learner picks (spec §4.4: new / due / hard / mastered). */
export const REVIEW_GRADES = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

export interface SrsState {
  /** Discriminator for algorithm upgrades. 1 = SM-2 (legacy), 2 = FSRS. */
  schemaVersion: 1 | 2;
  /** Which algorithm produced this state. */
  algorithm: "sm2" | "fsrs";
  /** Derived from difficulty (2.5 ≈ average) — kept for legacy consumers. */
  ease: number;
  /** Consecutive successful reviews (lapse resets to 0). */
  repetitions: number;
  /** Last scheduled interval in days (0 = card not yet graduated). */
  intervalDays: number;
  /** Count of times the card was answered AGAIN — the "khó nhớ" signal. */
  lapses: number;
  /** FSRS stability in days. Absent on legacy SM-2 rows. */
  stability?: number;
  /** FSRS difficulty 1–10. Absent on legacy SM-2 rows. */
  difficulty?: number;
  /** Epoch ms of the last review (to measure elapsed days). */
  lastReviewAt?: number;
}

export const SRS_DEFAULT_STATE: SrsState = Object.freeze({
  schemaVersion: 2,
  algorithm: "fsrs",
  ease: 2.5,
  repetitions: 0,
  intervalDays: 0,
  lapses: 0,
});

/** A review to apply: the grade and the moment it happened (epoch ms). */
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

// FSRS-4.5 default parameters.
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81;
/** Target probability of recall at review time. */
const REQUEST_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 36500;
const MIN_INTERVAL_DAYS = 1;
const RELEARN_MINUTES = 10;
const DAY_MS = 86_400_000;

const GRADE_NUM: Record<ReviewGrade, 1 | 2 | 3 | 4> = {
  AGAIN: 1,
  HARD: 2,
  GOOD: 3,
  EASY: 4,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round3 = (v: number) => Math.round(v * 1000) / 1000;

const initStability = (g: number) => Math.max(0.1, W[g - 1]);
const initDifficulty = (g: number) => clamp(W[4] - W[5] * (g - 3), 1, 10);

function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

function nextInterval(stability: number): number {
  const days = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(days), MIN_INTERVAL_DAYS, MAX_INTERVAL_DAYS);
}

function nextDifficulty(d: number, g: number): number {
  const next = d - W[6] * (g - 3);
  // Mean reversion toward the "easy" initial difficulty.
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * next, 1, 10);
}

function nextRecallStability(d: number, s: number, r: number, g: number): number {
  const hardPenalty = g === 2 ? W[15] : 1;
  const easyBonus = g === 4 ? W[16] : 1;
  return (
    s *
    (1 +
      Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp((1 - r) * W[10]) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function nextForgetStability(d: number, s: number, r: number): number {
  return Math.min(
    s,
    W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]),
  );
}

/** difficulty 4.93 (a GOOD first review) ↔ ease 2.5; ±1 difficulty ≈ ∓0.2 ease. */
function difficultyToEase(d: number): number {
  return round3(clamp(2.5 + (initDifficulty(3) - d) * 0.2, 1.3, 3.5));
}
function easeToDifficulty(ease: number): number {
  return clamp(initDifficulty(3) + (2.5 - ease) / 0.2, 1, 10);
}

export function advanceSrs(prev: SrsState, review: Review): SrsOutcome {
  const g = GRADE_NUM[review.grade];

  // Resolve the FSRS memory state (lazy upgrade of legacy SM-2 rows).
  let stability = prev.stability;
  let difficulty = prev.difficulty;
  if (stability === undefined || difficulty === undefined) {
    if (prev.intervalDays > 0) {
      stability = Math.max(prev.intervalDays, 0.1);
      difficulty = easeToDifficulty(prev.ease);
    }
  }

  let nextS: number;
  let nextD: number;
  if (stability === undefined || difficulty === undefined) {
    // First ever review.
    nextS = initStability(g);
    nextD = initDifficulty(g);
  } else {
    const elapsed =
      prev.lastReviewAt !== undefined
        ? Math.max(0, (review.now - prev.lastReviewAt) / DAY_MS)
        : prev.intervalDays; // legacy rows: assume reviewed on schedule
    const r = retrievability(elapsed, stability);
    nextD = nextDifficulty(difficulty, g);
    nextS =
      g === 1
        ? nextForgetStability(difficulty, stability, r)
        : nextRecallStability(difficulty, stability, r, g);
  }
  nextS = Math.max(0.1, nextS);

  const lapse = g === 1;
  const intervalDays = lapse ? prev.intervalDays : nextInterval(nextS);

  const next: SrsState = {
    schemaVersion: 2,
    algorithm: "fsrs",
    ease: difficultyToEase(nextD),
    repetitions: lapse ? 0 : prev.repetitions + 1,
    intervalDays,
    lapses: prev.lapses + (lapse ? 1 : 0),
    stability: round3(nextS),
    difficulty: round3(nextD),
    lastReviewAt: review.now,
  };

  return {
    state: next,
    intervalDays,
    relearnHours: lapse ? RELEARN_MINUTES / 60 : 0,
    grade: review.grade,
  };
}
