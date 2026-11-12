/**
 * Types of the Japanese AI evaluation benchmark (`japanese_ai_eval_dataset_*`).
 * A dataset is immutable once imported: a changed reference answer is a new
 * dataset version, never an edit of the old one.
 */

export const EVAL_TASKS = ["translation", "sentence_generation", "vocabulary_check", "grammar_analysis"] as const;
export type EvalTask = (typeof EVAL_TASKS)[number];

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type JlptLevel = (typeof JLPT_LEVELS)[number];

export const EVAL_SPLITS = ["dev", "val", "test"] as const;
export type EvalSplit = (typeof EVAL_SPLITS)[number];

interface CaseBase {
  id: string;
  task: EvalTask;
  level: JlptLevel;
  evaluation_focus: string[];
  checks: string[];
  case_variant: number;
  gold_status: string;
}

export interface TranslationCase extends CaseBase {
  task: "translation";
  direction: "ja_to_vi" | "vi_to_ja";
  input: string;
  reference: string;
}

export interface SentenceGenerationCase extends CaseBase {
  task: "sentence_generation";
  target_pattern: string;
  instruction: string;
  reference_example: string;
  reference_translation: string;
}

export interface VocabularyCase extends CaseBase {
  task: "vocabulary_check";
  word: string;
  context: string;
  expected: { reading: string; meaning_vi: string; part_of_speech: string; example_context?: string };
}

export interface GrammarCase extends CaseBase {
  task: "grammar_analysis";
  sentence: string;
  target_pattern: string;
  instruction: string;
  expected: { meaning_vi: string; formation: string; function: string; sentence_translation: string };
}

export type EvalCase = TranslationCase | SentenceGenerationCase | VocabularyCase | GrammarCase;

/** A case as stored, with what the loader derived from it. */
export interface LoadedCase {
  caseId: string;
  task: EvalTask;
  level: JlptLevel;
  /** The underlying seed (sentence / pattern / word): variants of one seed share it, so they land in the same split. */
  seedKey: string;
  split: EvalSplit;
  /** Hash of the case content without its id — equal hashes are exact duplicates. */
  contentHash: string;
  goldStatus: string;
  payload: EvalCase;
}

export interface DatasetMeta {
  name: string;
  version: string;
  languagePair: string[];
  status: string;
  qualityNotice: string;
  evaluationPolicy: string[];
  caseCount: number;
  /** SHA-256 of the source file bytes. */
  checksum: string;
}

export interface LoadedDataset {
  meta: DatasetMeta;
  cases: LoadedCase[];
  /** Non-fatal findings (exact duplicate content, …). */
  warnings: string[];
}

export interface CaseFilter {
  tasks?: EvalTask[];
  levels?: JlptLevel[];
  splits?: EvalSplit[];
  goldStatus?: string[];
  caseIds?: string[];
  /** Keep only the first case of each exact-duplicate group (default true in runs). */
  dedupe?: boolean;
  /** At most this many cases per task × level (in id order). */
  perTaskLevel?: number;
}

/** Error categories reported by the deterministic checks and the judges. */
export const ERROR_TAGS = [
  "empty",
  "parse_error",
  "call_error",
  "wrong_language",
  "meaning_error",
  "omission",
  "addition",
  "grammar_error",
  "unnatural",
  "register_mismatch",
  "pattern_missing",
  "pattern_misused",
  "copied_reference",
  "instruction_ignored",
  "level_mismatch",
  "too_long",
  "wrong_reading",
  "wrong_meaning",
  "wrong_pos",
  "missing_nuance",
  "wrong_formation",
  "wrong_translation",
  "breakdown_error",
  "no_confusion_note",
  "hallucinated_rule",
] as const;
export type ErrorTag = (typeof ERROR_TAGS)[number];

/** One rubric line: who scores it and how many points it is worth. */
export interface Criterion {
  key: string;
  label: string;
  max: number;
  /**
   * `judge` = the judges' points; `code` = the deterministic check alone;
   * `code_or_judge` = full points when the code check passes, else the judges' points
   * (the code cannot prove an alternative answer wrong — e.g. another valid reading).
   */
  source: "judge" | "code" | "code_or_judge";
  /** What the judges are told this criterion means. */
  guide: string;
}

/** What the deterministic checks found for one answer. */
export interface DeterministicResult {
  /** Named measurements (chrF, pattern found, …) — stored for the report. */
  checks: Record<string, number | boolean | string>;
  /** Code-scored criteria: key → points (code_or_judge: present only when the check passed). */
  points: Record<string, number>;
  /** Upper bounds the code imposes whatever the judges say (copied reference → instruction 0). */
  caps?: Record<string, number>;
  flags: ErrorTag[];
  /** Stop here: the answer scores 0 without asking the judges (empty, wrong language). */
  fatal?: boolean;
  /** The code disagrees with what a judge is likely to say — ask a human to look. */
  review?: string;
}

/** One judge's verdict on one answer. */
export interface JudgeVerdict {
  judge: string;
  scores: Record<string, number>;
  errorTags: ErrorTag[];
  /** 0–1. */
  confidence: number;
  note: string;
  /** The answer could not be read. */
  error?: string;
}

export interface ScoreBreakdown {
  /** criterion key → points. */
  parts: Record<string, number>;
  total: number;
}
