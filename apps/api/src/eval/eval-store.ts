import type { PriceTable } from "./eval-cost.js";
import { filterCases } from "./eval-dataset.js";
import type { CaseFilter, DeterministicResult, ErrorTag, EvalTask, JlptLevel, JudgeVerdict, LoadedCase } from "./eval-types.js";

/** A service a run asks (candidate) or uses as a judge, frozen at creation. */
export interface ServiceRef {
  serviceId: string;
  label: string;
  provider: string;
  model: string;
  /** Candidate run on another model than the service's own: its score is not written back to the service ranking. */
  modelOverride?: boolean;
}

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export interface RunConfig {
  label: string;
  datasetKey: string;
  filter: CaseFilter;
  candidates: ServiceRef[];
  judges: ServiceRef[];
  promptVersion: string;
  judgePromptVersion: string;
  temperature: number;
  /** Cases sent in ONE candidate call. */
  batchSize: number;
  /** Answers sent in ONE judge call. */
  judgeBatchSize: number;
  repeats: number;
  /** A result at or above this total counts as a pass. */
  passThreshold: number;
  allowSelfJudge: boolean;
  /** When done: write each candidate's task scores to its service and re-sort the service order. */
  updateRanking: boolean;
}

/** Counts of one slice of a run (whole run, one candidate, one task). */
export interface ProgressCounts {
  total: number;
  done: number;
  errors: number;
  /** Results with a score, and the sum of those scores (running mean = scoreSum / scored). */
  scored?: number;
  scoreSum?: number;
  needsReview?: number;
}

/** What the run is doing right now. */
export interface RunCurrent {
  candidate: number;
  task: EvalTask;
  repeat: number;
  /** Batch number within this candidate × repeat × task, and how many batches it has. */
  batchNo: number;
  batches: number;
  caseIds: string[];
  phase: "calling" | "judging" | "waiting" | "retrying";
  /** Who is being waited on (service label / judge labels). */
  who: string;
  since: string;
  /** Rate-limit wait: when the next try happens. */
  waitUntil?: string;
}

export interface RunProgress extends ProgressCounts {
  byCandidate?: Record<string, ProgressCounts>;
  byTask?: Record<string, ProgressCounts>;
  calls?: { candidate: number; judge: number; failed: number };
  current?: RunCurrent | null;
  /** Start of the current session (a resumed run restarts it) and how many results were done then — for speed / ETA. */
  sessionStartedAt?: string;
  sessionStartDone?: number;
  updatedAt?: string;
}

/** One line of the run's activity log (newest kept, capped). */
export interface RunEvent {
  at: string;
  level: "info" | "warn" | "error";
  text: string;
}
export const EVENTS_LIMIT = 80;

export interface RunDoc extends RunConfig {
  id: string;
  status: RunStatus;
  caseCount: number;
  progress: RunProgress;
  events?: RunEvent[];
  candidateErrors?: Record<string, string>;
  modelVersions?: Record<string, string>;
  summary?: unknown;
  error?: string;
  createdBy?: string;
  startedAt?: Date | string;
  finishedAt?: Date | string;
  createdAt?: Date | string;
}

export interface CallRow {
  runId: string;
  role: "candidate" | "judge";
  /** Candidate index this call was for (judges too). */
  candidate: number;
  judge?: number;
  serviceId: string;
  provider: string;
  model: string;
  modelVersion?: string | null;
  task: EvalTask;
  caseIds: string[];
  repeat: number;
  prompt?: string;
  raw?: string;
  ok: boolean;
  error?: string;
  errorKind?: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  tokensEstimated: boolean;
  costUsd: number | null;
}

export type ResultStatus = "scored" | "error" | "judge_failed";

export interface ResultRow {
  id?: string;
  runId: string;
  candidate: number;
  caseId: string;
  task: EvalTask;
  level: JlptLevel;
  split?: string;
  focus: string[];
  pattern?: string;
  repeat: number;
  callId?: string;
  status: ResultStatus;
  parsed?: Record<string, unknown> | null;
  outputText?: string;
  deterministic?: DeterministicResult;
  verdicts?: JudgeVerdict[];
  parts?: Record<string, number>;
  total: number | null;
  humanTotal?: number | null;
  reviewed?: boolean;
  errorTags: ErrorTag[];
  needsReview: boolean;
  reviewReason?: string;
  error?: string;
  callMs: number;
  itemMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  judgeCostUsd: number | null;
}

export const resultKey = (r: Pick<ResultRow, "candidate" | "caseId" | "repeat">) => `${r.candidate}|${r.caseId}|${r.repeat}`;

/** What the runner and the report need from storage (Mongo in the app, memory in tests). */
export interface EvalStore {
  getRun(id: string): Promise<RunDoc | null>;
  updateRun(id: string, patch: Partial<RunDoc>): Promise<void>;
  /** Append to the run's activity log, keeping the newest `EVENTS_LIMIT`. */
  pushEvent(id: string, event: RunEvent): Promise<void>;
  listCases(datasetKey: string, filter: CaseFilter): Promise<LoadedCase[]>;
  /** `resultKey`s already stored for the run (so an interrupted run resumes). */
  doneKeys(runId: string): Promise<Set<string>>;
  insertCall(row: CallRow): Promise<string>;
  /** Insert or replace by (run, candidate, case, repeat). */
  saveResults(rows: ResultRow[]): Promise<void>;
  judgeCacheGet(keys: string[]): Promise<Map<string, JudgeVerdict>>;
  judgeCacheSet(key: string, verdict: JudgeVerdict): Promise<void>;
  prices(): Promise<PriceTable>;
  /** Results of a run without the heavy fields (parsed / verdicts / deterministic). */
  results(runId: string): AsyncIterable<ResultRow>;
  /** Calls of a run without prompt / raw. */
  calls(runId: string): AsyncIterable<CallRow>;
}

/** In-memory store (tests, and a reference for what the Mongo one must do). */
export class MemoryEvalStore implements EvalStore {
  runs = new Map<string, RunDoc>();
  cases = new Map<string, LoadedCase[]>();
  callRows: (CallRow & { id: string })[] = [];
  resultRows = new Map<string, ResultRow>();
  cache = new Map<string, JudgeVerdict>();
  priceTable: PriceTable = {};

  async getRun(id: string) {
    const r = this.runs.get(id);
    return r ? { ...r } : null;
  }
  async updateRun(id: string, patch: Partial<RunDoc>) {
    const r = this.runs.get(id);
    if (r) this.runs.set(id, { ...r, ...patch });
  }
  async pushEvent(id: string, event: RunEvent) {
    const r = this.runs.get(id);
    if (r) r.events = [...(r.events ?? []), event].slice(-EVENTS_LIMIT);
  }
  async listCases(datasetKey: string, filter: CaseFilter) {
    return filterCases(this.cases.get(datasetKey) ?? [], filter);
  }
  async doneKeys(runId: string) {
    return new Set([...this.resultRows.values()].filter((r) => r.runId === runId).map(resultKey));
  }
  async insertCall(row: CallRow) {
    const id = `call${this.callRows.length + 1}`;
    this.callRows.push({ ...row, id });
    return id;
  }
  async saveResults(rows: ResultRow[]) {
    for (const r of rows) this.resultRows.set(`${r.runId}|${resultKey(r)}`, { ...r, id: `${r.runId}|${resultKey(r)}` });
  }
  async judgeCacheGet(keys: string[]) {
    return new Map(keys.flatMap((k) => (this.cache.has(k) ? [[k, this.cache.get(k)!] as const] : [])));
  }
  async judgeCacheSet(key: string, verdict: JudgeVerdict) {
    this.cache.set(key, verdict);
  }
  async prices() {
    return this.priceTable;
  }
  async *results(runId: string) {
    for (const r of this.resultRows.values()) if (r.runId === runId) yield r;
  }
  async *calls(runId: string) {
    for (const c of this.callRows) if (c.runId === runId) yield c;
  }
}
