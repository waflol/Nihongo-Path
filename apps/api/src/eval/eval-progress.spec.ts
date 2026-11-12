import { ProgressTracker, speedAndEta } from "./eval-progress.js";
import type { ResultRow } from "./eval-store.js";
import type { LoadedCase } from "./eval-types.js";

const cases = [
  { caseId: "A", task: "translation" },
  { caseId: "B", task: "translation" },
  { caseId: "C", task: "grammar_analysis" },
] as LoadedCase[];
const row = (candidate: number, caseId: string, task: string, extra: Partial<ResultRow> = {}) =>
  ({ candidate, caseId, task, repeat: 1, status: "scored", total: 80, needsReview: false, ...extra }) as ResultRow;

describe("ProgressTracker", () => {
  it("sets totals per run, candidate and task, and counts each result once", () => {
    const t = new ProgressTracker({ candidates: [{}, {}] as never, repeats: 2 }, cases);
    expect(t.p.total).toBe(12);
    expect(t.p.byCandidate!["1"].total).toBe(6);
    expect(t.p.byTask!.translation.total).toBe(8);
    t.record([row(0, "A", "translation"), row(0, "A", "translation"), row(1, "C", "grammar_analysis", { status: "error", total: null, needsReview: true })]);
    expect(t.p).toMatchObject({ done: 2, errors: 1, scored: 1, scoreSum: 80, needsReview: 1 });
    expect(t.p.byCandidate!["0"]).toMatchObject({ done: 1, scored: 1 });
    expect(t.p.byTask!.grammar_analysis).toMatchObject({ done: 1, errors: 1 });
  });

  it("counts results stored before a resume and starts the session there", async () => {
    const t = new ProgressTracker({ candidates: [{}] as never, repeats: 1 }, cases);
    await t.load((async function* () {
      yield row(0, "A", "translation");
    })());
    t.startSession(new Date("2026-01-01T00:00:00Z"));
    expect(t.p).toMatchObject({ done: 1, sessionStartDone: 1 });
    expect(t.done.has("0|A|1")).toBe(true);
  });
});

describe("speedAndEta", () => {
  it("uses only the current session's results", () => {
    const p = { total: 100, done: 40, errors: 0, sessionStartedAt: "2026-01-01T00:00:00Z", sessionStartDone: 10 };
    // 30 results in 60 s → 30/min, 60 left → 2 min.
    expect(speedAndEta(p, Date.parse("2026-01-01T00:01:00Z"))).toEqual({ perMinute: 30, etaMs: 120_000 });
  });
  it("is unknown before any result of the session", () => {
    expect(speedAndEta({ total: 10, done: 3, errors: 0, sessionStartedAt: "2026-01-01T00:00:00Z", sessionStartDone: 3 }, Date.parse("2026-01-01T00:01:00Z"))).toEqual({
      perMinute: null,
      etaMs: null,
    });
  });
});
