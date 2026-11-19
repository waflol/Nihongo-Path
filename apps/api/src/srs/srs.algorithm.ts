/**
 * SRS algorithm — FSRS-6, implemented once in `@nihongo/shared/srs` and shared
 * with the UI (plan-fsrs-6 D2). This file only re-exports it so existing
 * imports keep working. See ADR-srs "Cập nhật: FSRS-6".
 */
export {
  REVIEW_GRADES,
  SRS_DEFAULT_STATE,
  DEFAULT_SRS_PARAMS,
  MAX_INTERVAL_DAYS,
  advanceSrs,
  previewIntervals,
} from "@nihongo/shared/srs";
export type {
  ReviewGrade,
  SrsState,
  Review,
  SrsOutcome,
  SrsParams,
} from "@nihongo/shared/srs";
