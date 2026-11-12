import { Schema } from "mongoose";

/**
 * Collections of the evaluation benchmark. All `eval_*`: nothing here is
 * learner data, and nothing in the learning collections is touched by it.
 * No TTL: the history is what lets model / prompt versions be compared.
 */

const loose = { strict: false, minimize: false } as const;

/** One imported dataset version (immutable). */
export const EvalDatasetSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    version: { type: String, required: true },
    checksum: { type: String, required: true },
    languagePair: [String],
    status: String,
    qualityNotice: String,
    evaluationPolicy: [String],
    caseCount: Number,
    counts: Object,
    warnings: [String],
    duplicateCount: Number,
    source: String,
    importedBy: String,
  },
  { collection: "eval_datasets", timestamps: { createdAt: "importedAt", updatedAt: false }, ...loose },
);

/** One case of one dataset version (never updated after import). */
export const EvalCaseSchema = new Schema(
  {
    datasetKey: { type: String, required: true },
    caseId: { type: String, required: true },
    task: { type: String, required: true },
    level: { type: String, required: true },
    seedKey: String,
    split: String,
    contentHash: String,
    goldStatus: String,
    payload: { type: Object, required: true },
  },
  { collection: "eval_cases", ...loose },
);
EvalCaseSchema.index({ datasetKey: 1, caseId: 1 }, { unique: true });
EvalCaseSchema.index({ datasetKey: 1, task: 1, level: 1 });

/** A benchmark run: its configuration, progress and (when done) a summary. */
export const EvalRunSchema = new Schema(
  {
    label: String,
    datasetKey: { type: String, required: true, index: true },
    filter: Object,
    candidates: [Object],
    judges: [Object],
    promptVersion: String,
    judgePromptVersion: String,
    temperature: Number,
    batchSize: Number,
    judgeBatchSize: Number,
    repeats: Number,
    passThreshold: Number,
    allowSelfJudge: Boolean,
    updateRanking: Boolean,
    status: { type: String, index: true },
    caseCount: Number,
    progress: Object,
    events: [Object],
    candidateErrors: Object,
    modelVersions: Object,
    summary: Object,
    error: String,
    createdBy: String,
    startedAt: Date,
    finishedAt: Date,
  },
  { collection: "eval_runs", timestamps: true, ...loose },
);
EvalRunSchema.index({ createdAt: -1 });

/** One API call (candidate or judge) with its raw text and usage. */
export const EvalCallSchema = new Schema(
  {
    runId: { type: String, required: true },
    role: String,
    candidate: Number,
    judge: Number,
    serviceId: String,
    provider: String,
    model: String,
    modelVersion: String,
    task: String,
    caseIds: [String],
    repeat: Number,
    prompt: String,
    raw: String,
    ok: Boolean,
    error: String,
    errorKind: String,
    ms: Number,
    inputTokens: Number,
    outputTokens: Number,
    tokensEstimated: Boolean,
    costUsd: Number,
  },
  { collection: "eval_calls", timestamps: { createdAt: true, updatedAt: false }, ...loose },
);
EvalCallSchema.index({ runId: 1, role: 1, candidate: 1 });

/** One scored answer: (run, candidate, case, repeat). Raw output is in `eval_calls`; parsed output is here. */
export const EvalResultSchema = new Schema(
  {
    runId: { type: String, required: true },
    candidate: { type: Number, required: true },
    caseId: { type: String, required: true },
    task: String,
    level: String,
    split: String,
    focus: [String],
    pattern: String,
    repeat: Number,
    callId: String,
    status: String,
    parsed: Object,
    outputText: String,
    deterministic: Object,
    verdicts: [Object],
    parts: Object,
    total: Number,
    humanTotal: Number,
    reviewed: Boolean,
    errorTags: [String],
    needsReview: Boolean,
    reviewReason: String,
    error: String,
    callMs: Number,
    itemMs: Number,
    inputTokens: Number,
    outputTokens: Number,
    costUsd: Number,
    judgeCostUsd: Number,
  },
  { collection: "eval_results", timestamps: { createdAt: true, updatedAt: false }, ...loose },
);
EvalResultSchema.index({ runId: 1, candidate: 1, caseId: 1, repeat: 1 }, { unique: true });
EvalResultSchema.index({ runId: 1, task: 1, level: 1 });
EvalResultSchema.index({ runId: 1, needsReview: 1 });

/** Human adjudication of a result (audit history: never edited). */
export const EvalReviewSchema = new Schema(
  {
    resultId: { type: String, required: true, index: true },
    runId: String,
    reviewer: String,
    verdict: String,
    previousTotal: Number,
    correctedTotal: Number,
    notes: String,
  },
  { collection: "eval_reviews", timestamps: { createdAt: true, updatedAt: false }, ...loose },
);

/** Judge verdicts by (judge model, judge prompt version, case, answer) — repeats with the same answer are judged once. */
export const EvalJudgeCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    verdict: Object,
  },
  { collection: "eval_judge_cache", timestamps: { createdAt: true, updatedAt: false }, ...loose },
);

/** Singleton settings (prices). */
export const EvalSettingsSchema = new Schema(
  {
    _id: { type: String },
    prices: Object,
  },
  { collection: "eval_settings", ...loose },
);
