import { describe, expect, it } from "vitest";
import { examSeries, type FinishedRow, finishStatus, summarizeAttempts } from "./exams.service.js";

/**
 * T-P4-02: a submission that lands after the deadline is marked `timed_out`
 * and scored by the same grading rules (unanswered = 0). The CLIENT's clock
 * is never trusted — the server compares now vs. `deadlineMs`.
 */
describe("finishStatus (P4-EXAM-04 / T-P4-02)", () => {
  it("is `submitted` before the deadline", () => {
    expect(finishStatus(1000, 500)).toBe("submitted");
    expect(finishStatus(1000, 1000)).toBe("timed_out"); // exactly at the deadline = past
  });

  it("is `timed_out` at or after the deadline", () => {
    expect(finishStatus(1000, 1000)).toBe("timed_out");
    expect(finishStatus(1000, 9999)).toBe("timed_out");
  });

  it("an untimed sitting (no deadline) is always `submitted`", () => {
    expect(finishStatus(null, 1_000_000)).toBe("submitted");
    expect(finishStatus(undefined, 1_000_000)).toBe("submitted");
  });
});

/** T-P4-08: stats are pure functions of the finished rows — no hidden state. */
const row = (over: Partial<FinishedRow>): FinishedRow => ({
  attemptId: "a1",
  exam: "e1",
  examTitle: "Đề A",
  status: "submitted",
  percent: 80,
  score: 4,
  total: 5,
  submittedAtMs: Date.UTC(2026, 10, 18),
  ...over,
});

describe("summarizeAttempts (P4-EXAM-08 / T-P4-08)", () => {
  it("returns nulls / empty structures when there is nothing", () => {
    const s = summarizeAttempts([]);
    expect(s.attempts).toBe(0);
    expect(s.avgPercent).toBeNull();
    expect(s.byLevel).toEqual([]);
    expect(s.byExam).toEqual([]);
  });

  it("averages percents and groups by level / family / exam", () => {
    const rows = [
      row({ level: "N5", examType: "JLPT", percent: 80 }),
      row({ attemptId: "a2", level: "N5", examType: "JLPT", percent: 60 }),
      row({ attemptId: "a3", exam: "e2", examTitle: "Đề B", level: "N4", examType: "NAT", percent: 100 }),
    ];
    const s = summarizeAttempts(rows);
    expect(s.attempts).toBe(3);
    expect(s.avgPercent).toBe(80); // (80+60+100)/3 = 80
    const n5 = s.byLevel.find((l) => l.level === "N5")!;
    expect(n5.attempts).toBe(2);
    expect(n5.avgPercent).toBe(70);
    const e1 = s.byExam.find((x) => x.exam === "e1")!;
    expect(e1.attempts).toBe(2);
    expect(e1.bestPercent).toBe(80);
    expect(e1.lastPercent).toBe(80); // same instant → stable order (insertion)
    // A level-less row lands in the "Khác" bucket.
    const rowsNoLevel = [row({ level: undefined })];
    expect(summarizeAttempts(rowsNoLevel).byLevel[0].level).toBe("Khác");
  });

  it("recent lists the newest finished rows, capped at 10", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row({ attemptId: `a${i}`, exam: `e${i % 3}`, submittedAtMs: 1000 + i }),
    );
    const s = summarizeAttempts(rows);
    expect(s.recent).toHaveLength(10);
    expect(s.recent[0].attemptId).toBe("a14");
    expect(s.recent[9].attemptId).toBe("a5");
  });

  it("bestPercent is the max, lastPercent the newest one", () => {
    const rows = [
      row({ percent: 40, submittedAtMs: 100 }),
      row({ attemptId: "a2", percent: 90, submittedAtMs: 300 }),
      row({ attemptId: "a3", percent: 70, submittedAtMs: 200 }),
    ];
    const e = summarizeAttempts(rows).byExam[0];
    expect(e.bestPercent).toBe(90);
    expect(e.lastPercent).toBe(90); // the a2 row is the newest
  });
});

/** T-P4-08 (series): per-day buckets come out of the same rows, zone-anchored. */
describe("examSeries (P4-EXAM-08)", () => {
  it("buckets rows by the zone day of `submittedAtMs`", () => {
    const dayKeyOf = (ms: number): string => {
      // A fixed zone for the test: UTC.
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    };
    const rows = [
      row({ submittedAtMs: Date.UTC(2026, 10, 18) }),
      row({ attemptId: "a2", submittedAtMs: Date.UTC(2026, 10, 18), percent: 50 }),
      row({ attemptId: "a3", submittedAtMs: Date.UTC(2026, 10, 15), percent: 100 }),
    ];
    // Today (zone) = 2026-11-18, window = 3 days → 16, 17, 18.
    const series = examSeries(rows, 3, dayKeyOf, "2026-11-18");
    expect(series).toHaveLength(3);
    expect(series.map((s) => s.key)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(series[2].attempts).toBe(2);
    expect(series[2].avgPercent).toBe(65); // (80+50)/2
    expect(series[0].attempts).toBe(0);
    expect(series[0].avgPercent).toBeNull();
  });

  it("steps back across month boundaries correctly", () => {
    const dayKeyOf = (ms: number): string => {
      const d = new Date(ms);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    };
    // Today = 2026-11-01, 3 days → 2026-10-30, 10-31, 11-01.
    const series = examSeries([], 3, dayKeyOf, "2026-11-01");
    expect(series.map((s) => s.key)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});
