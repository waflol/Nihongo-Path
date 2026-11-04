/**
 * SM-2 spaced-repetition schedule (P3-SRS-01/03, ADR-srs).
 *
 * Chosen per Q-03 (2026-11-03): **SM-2 first**, with a versioned state blob so
 * a later FSRS migration does not lose progress. The algorithm is pure — no
 * clock, no I/O, no timezone — so the same feedback sequence always yields the
 * same state transitions (T-P3-04); day-boundary handling (P3-SRS-05) lives in
 * `srs.days.ts` and the persistence / due-date composition in `srs.service.ts`.
 *
 * Grading (the UI's four review buttons):
 * 0 = AGAIN (forgot) · 1 = HARD · 2 = GOOD · 3 = EASY
 *
 * SM-2 rules implemented (Anki-compatible, minimum intervals 1d/10d/60d):
 * - ease  starts at 2.5; after a grade `g` (0–5 scale here mapped from 0–3):
 *     EF' = EF + (0.1 − (5 − q)·(0.08 + (5 − q)·0.02))
 * - a lapse (g = AGAIN) resets repetitions to 0 and schedules a relearn
 *   10 minutes later.
 * - interval progression: rep0 → 1 day, rep1 → 6 days, then
 *   prev·EF floored; clamped to ≥ 1 day.
 */

/** Review grades the learner picks (spec §4.4: new / due / hard / mastered). */
export const REVIEW_GRADES = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

/**
 * The SRS state persisted per (user, card). `schemaVersion` + `algorithm`
 * stamp it so a future FSRS upgrade can discriminate legacy SM-2 rows without
 * migrating blindly (Q-03 "dự phòng FSRS").
 */
export interface SrsState {
  /** Discriminator for algorithm upgrades. 1 = SM-2. */
  schemaVersion: 1;
  /** Which algorithm produced this state. */
  algorithm: "sm2";
  /** Ease factor, SM-2 `EF`, starts at 2.5. */
  ease: number;
  /** Consecutive successful reviews (lapse resets to 0). */
  repetitions: number;
  /** Last scheduled interval in days (0 = card not yet graduated). */
  intervalDays: number;
  /** Count of times the card was answered AGAIN — the "khó nhớ" signal. */
  lapses: number;
}

export const SRS_DEFAULT_STATE: SrsState = Object.freeze({
  schemaVersion: 1,
  algorithm: "sm2",
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

/** The result of applying a review: the new state + a due offset in days. */
export interface SrsOutcome {
  state: SrsState;
  /**
   * How far past the anchor point the card is due, in days. A lapse
   * (AGAIN) returns a sub-day relearn interval in **hours** via
   * `relearnHours` instead — the caller composes the absolute due instant
   * (day-anchored, P3-SRS-05) from these two numbers.
   */
  intervalDays: number;
  /** Set for a lapse (10-minute relearn); 0 otherwise. */
  relearnHours: number;
  /** Human-readable label for the review just recorded. */
  grade: ReviewGrade;
}

/** Map the 4-button grade to the 0–5 quality SM-2 expects. */
const GRADE_QUALITY: Record<ReviewGrade, number> = {
  AGAIN: 0,
  HARD: 2,
  GOOD: 3,
  EASY: 5,
};

const MIN_INTERVAL_DAYS = 1;
/** Anki-style graduation intervals for the first two successful reps. */
const GRADUATE_INTERVAL_DAYS = [1, 6];
/** A lapsed card relearns inside the same sitting. */
/** A lapsed card relearns inside the same sitting. */
const RELEARN_MINUTES = 10;
export function advanceSm2(
  prev: SrsState,
  review: Review,
): SrsOutcome {
  const q = GRADE_QUALITY[review.grade];

  const ease =
    prev.ease +
    0.1 -
    (5 - q) * (0.08 + (5 - q) * 0.02);
  // SM-2 floors the ease at 1.3.
  const clampedEase = Math.max(1.3, ease);

  let repetitions: number;
  let intervalDays: number;
  let lapses = prev.lapses;

  if (q === 0) {
    // Lapse: the card goes back to a 10-minute relearn; reps restart.
    repetitions = 0;
    intervalDays = prev.intervalDays; // kept so a later pass rescales from here
    lapses = prev.lapses + 1;
  } else {
    repetitions = prev.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = GRADUATE_INTERVAL_DAYS[0];
    } else if (repetitions === 2) {
      intervalDays = GRADUATE_INTERVAL_DAYS[1];
    } else {
      intervalDays = Math.max(
        MIN_INTERVAL_DAYS,
        Math.round(prev.intervalDays * clampedEase),
      );
    }
  }

  const next: SrsState = {
    ...prev,
    ease: round3(clampedEase),
    repetitions,
    intervalDays,
    lapses,
  };

  return {
    state: next,
    intervalDays,
    relearnHours: q === 0 ? RELEARN_MINUTES / 60 : 0,
    grade: review.grade,
  };
}

/** Clamp ease rounding so the stored value stays stable across platforms. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
