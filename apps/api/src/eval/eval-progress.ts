import { resultKey, type ProgressCounts, type ResultRow, type RunCurrent, type RunDoc, type RunProgress } from "./eval-store.js";
import type { LoadedCase } from "./eval-types.js";

const empty = (total: number): ProgressCounts => ({ total, done: 0, errors: 0, scored: 0, scoreSum: 0, needsReview: 0 });

function add(c: ProgressCounts, r: Pick<ResultRow, "status" | "total" | "humanTotal" | "needsReview">): void {
  c.done++;
  if (r.status === "error") c.errors++;
  const v = typeof r.humanTotal === "number" ? r.humanTotal : r.total;
  if (typeof v === "number") {
    c.scored = (c.scored ?? 0) + 1;
    c.scoreSum = (c.scoreSum ?? 0) + v;
  }
  if (r.needsReview) c.needsReview = (c.needsReview ?? 0) + 1;
}

/**
 * Live progress of one run: totals for the whole run, each candidate and each
 * task, the step in progress, and the session start (for speed / ETA). Built
 * from the results already stored, so a resumed run shows its true position.
 */
export class ProgressTracker {
  readonly p: RunProgress;
  /** `resultKey`s already stored (skipped on resume). */
  readonly done = new Set<string>();

  constructor(run: Pick<RunDoc, "candidates" | "repeats">, cases: readonly LoadedCase[]) {
    const perTask = new Map<string, number>();
    for (const c of cases) perTask.set(c.task, (perTask.get(c.task) ?? 0) + 1);
    const total = cases.length * run.candidates.length * run.repeats;
    this.p = {
      ...empty(total),
      byCandidate: Object.fromEntries(run.candidates.map((_, i) => [String(i), empty(cases.length * run.repeats)])),
      byTask: Object.fromEntries([...perTask].map(([t, n]) => [t, empty(n * run.candidates.length * run.repeats)])),
      calls: { candidate: 0, judge: 0, failed: 0 },
      current: null,
    };
  }

  /** Count results stored before this session (a resumed run). */
  async load(results: AsyncIterable<ResultRow>): Promise<void> {
    for await (const r of results) this.record([r]);
  }

  record(rows: readonly ResultRow[]): void {
    for (const r of rows) {
      const k = resultKey(r);
      if (this.done.has(k)) continue;
      this.done.add(k);
      add(this.p, r);
      const c = this.p.byCandidate?.[String(r.candidate)];
      if (c) add(c, r);
      const t = this.p.byTask?.[r.task];
      if (t) add(t, r);
    }
  }

  call(role: "candidate" | "judge", ok: boolean): void {
    const c = (this.p.calls ??= { candidate: 0, judge: 0, failed: 0 });
    c[role]++;
    if (!ok) c.failed++;
  }

  startSession(now = new Date()): void {
    this.p.sessionStartedAt = now.toISOString();
    this.p.sessionStartDone = this.p.done;
  }

  setCurrent(c: Omit<RunCurrent, "since"> | null, now = new Date()): void {
    this.p.current = c ? { ...c, since: now.toISOString() } : null;
  }

  snapshot(now = new Date()): RunProgress {
    return { ...this.p, updatedAt: now.toISOString() };
  }
}

/** Results per minute in the current session and the estimated time left (ms), when it can be told. */
export function speedAndEta(p: RunProgress, now = Date.now()): { perMinute: number | null; etaMs: number | null } {
  if (!p.sessionStartedAt) return { perMinute: null, etaMs: null };
  const elapsed = now - new Date(p.sessionStartedAt).getTime();
  const doneNow = p.done - (p.sessionStartDone ?? 0);
  if (elapsed < 5_000 || doneNow <= 0) return { perMinute: null, etaMs: null };
  const perMs = doneNow / elapsed;
  return { perMinute: Math.round(perMs * 60_000 * 10) / 10, etaMs: Math.round(Math.max(0, p.total - p.done) / perMs) };
}
