import { describe, expect, it } from "vitest";
import {
  type BankQuestion,
  buildResultPayload,
  buildSitPayload,
  gradeAttempt,
  type AttemptCore,
  positionsOf,
} from "./exams.service.js";

/**
 * The two invariants that make the exam safe:
 * - T-P4-03: the sit payload (everything the learner sees mid-exam) never
 *   carries a question's `answer`, `explain` or `correct` — the only place
 *   those appear is the finished result payload (T-P4-05).
 * - T-P4-04: grading matches the answer by VALUE through the served option
 *   order, for every question kind — never by trusting the client's index
 *   against the un-shuffled bank.
 */

const BANK: BankQuestion[] = [
  {
    _id: "q1",
    kind: "reading-pick",
    prompt: "猫",
    sub: "con mèo",
    options: ["ねこ", "くま", "さけ", "わか"],
    answer: "ねこ",
    explain: "猫 (ねこ): con mèo.",
  },
  {
    _id: "q2",
    kind: "meaning-pick",
    prompt: "雨",
    sub: "vũ",
    options: ["mưa", "nắng", "gió", "snow"],
    answer: "mưa",
    explain: "雨 (あめ): mưa.",
  },
];

/**
 * An attempt that shuffles both questions: option order `q1` puts the
 * correct bank index 0 ("ねこ") at served position 2; `q2` puts the
 * correct bank index 0 ("mưa") at served position 1.
 */
const ATTEMPT: AttemptCore = {
  _id: "att-1",
  exam: "ex-1",
  examTitle: "Đề thử",
  examType: "JLPT N5 — Từ vựng",
  level: "N5",
  seed: 1234,
  questionOrder: ["q2", "q1"], // served question order
  optionOrder: {
    q1: [1, 3, 0, 2], // served position p shows bank option [1]=くま, [3]=わか, [0]=ねこ, [2]=さけ
    q2: [0, 1, 2, 3], // q2 unshuffled
  },
  startedAtMs: 1_000_000,
  deadlineMs: null,
  status: "in_progress",
  answers: { q1: 2, q2: 0 }, // q1 picked served pos 2 → bank 0 (correct); q2 picked served pos 0 → bank 0 (correct)
  flagged: [],
};

describe("buildSitPayload (P4-SEC-01 / T-P4-03)", () => {
  const payload = buildSitPayload(ATTEMPT, BANK, 1_000_500);

  it("serves options in the SHUFFLED order, not the bank order", () => {
    const q1 = payload.questions.find((q) => q.qid === "q1")!;
    expect(q1.options).toEqual(["くま", "わか", "ねこ", "さけ"]); // optionOrder q1
    const q2 = payload.questions.find((q) => q.qid === "q2")!;
    expect(q2.options).toEqual(["mưa", "nắng", "gió", "snow"]); // identity
    // Question order is the attempt's served order, not the bank's.
    expect(payload.questions.map((q) => q.qid)).toEqual(["q2", "q1"]);
  });

  it("carries NO answer / explain / correct of any question (P4-SEC-01)", () => {
    for (const q of payload.questions) {
      expect(Object.keys(q)).not.toContain("answer");
      expect(Object.keys(q)).not.toContain("explain");
      expect(Object.keys(q)).not.toContain("correct");
      expect(Object.keys(q)).not.toContain("correctIndex");
      // The correct option's VALUE is one of the four shown — the invariant
      // is that NO field in the payload tells the learner which one.
      const json = JSON.stringify(q);
      expect(json).not.toContain("\"answer\"");
      expect(json).not.toContain("\"explain\"");
      expect(json).not.toContain("\"correct\"");
    }
    // No top-level field leaks an answer map either.
    const top = JSON.stringify(payload);
    expect(top).not.toContain("\"answer\":");
    expect(top).not.toContain("\"correct\":");
    expect(top).not.toContain("correctIndex");
  });

  it("reflects the draft answers and flags", () => {
    expect(payload.answers).toEqual({ q1: 2, q2: 0 });
    expect(payload.flagged).toEqual([]);
  });

  it("reports a null deadline as untimed (remainingMs 0)", () => {
    expect(payload.deadlineMs).toBeNull();
    expect(payload.remainingMs).toBe(0);
  });

  it("reports remaining time for a timed attempt", () => {
    const timed = { ...ATTEMPT, deadlineMs: 2_000_000 };
    const p = buildSitPayload(timed, BANK, 1_900_000);
    expect(p.remainingMs).toBe(100_000);
  });
});

describe("gradeAttempt (P4-EXAM-06 / T-P4-04)", () => {
  it("grades by value through the served option order", () => {
    const grade = gradeAttempt(BANK, ATTEMPT);
    // q1: served pos 2 → bank idx 0 = "ねこ" = answer → correct.
    // q2: served pos 0 → bank idx 0 = "mưa" = answer → correct.
    expect(grade.correct).toEqual({ q1: true, q2: true });
    expect(grade.score).toBe(2);
    expect(grade.total).toBe(2);
    expect(grade.percent).toBe(100);
  });

  it("marks a wrong pick as wrong even though the index is valid", () => {
    const wrong: AttemptCore = { ...ATTEMPT, answers: { q1: 0, q2: 0 } };
    // q1 served pos 0 → bank idx 1 = "くま" ≠ answer → wrong.
    const grade = gradeAttempt(BANK, wrong);
    expect(grade.correct).toEqual({ q1: false, q2: true });
    expect(grade.score).toBe(1);
    expect(grade.percent).toBe(50);
  });

  it("treats an unanswered question as wrong (score per the timed-out rule, T-P4-02)", () => {
    const unanswered: AttemptCore = { ...ATTEMPT, answers: { q1: null, q2: 0 } };
    const grade = gradeAttempt(BANK, unanswered);
    expect(grade.correct).toEqual({ q1: false, q2: true });
    expect(grade.score).toBe(1);
  });

  it("treats an out-of-range pick as wrong", () => {
    const outOfRange: AttemptCore = { ...ATTEMPT, answers: { q1: 99, q2: -1 } };
    const grade = gradeAttempt(BANK, outOfRange);
    expect(grade.correct).toEqual({ q1: false, q2: false });
    expect(grade.score).toBe(0);
  });

  it("scores 0 on an empty question set", () => {
    const grade = gradeAttempt([], ATTEMPT);
    expect(grade).toEqual({ correct: {}, score: 0, total: 0, percent: 0 });
  });
});

describe("buildResultPayload (P4-EXAM-07/08 / T-P4-05)", () => {
  it("reveals the answer + explanation ONLY in the result payload", () => {
    const grade = gradeAttempt(BANK, ATTEMPT);
    const result = buildResultPayload(
      { ...ATTEMPT, status: "submitted", submittedAtMs: 1_500_000, durationSec: 500, ...grade },
      BANK,
      grade,
    );
    const q1 = result.results.find((r) => r.qid === "q1")!;
    expect(q1.explain).toBe("猫 (ねこ): con mèo.");
    // `correctIndex` is the served position of the right option (q1 → 2).
    expect(q1.correctIndex).toBe(2);
    expect(q1.given).toBe(2);
    expect(q1.correct).toBe(true);
    expect(result.percent).toBe(100);
    expect(result.submittedAtMs).toBe(1_500_000);
  });

  it("computes correctIndex from the attempt's own option order", () => {
    // For q2 the order is the identity, so the correct option "mưa" sits at served position 0.
    const grade = gradeAttempt(BANK, ATTEMPT);
    const result = buildResultPayload({ ...ATTEMPT, status: "timed_out", ...grade }, BANK, grade);
    const q2 = result.results.find((r) => r.qid === "q2")!;
    expect(q2.correctIndex).toBe(0);
    expect(q2.correct).toBe(true);
  });

  it("positionsOf falls back to identity when no optionOrder is stored", () => {
    const bare: AttemptCore = { ...ATTEMPT, optionOrder: {} };
    expect(positionsOf(bare, "q1", 4)).toEqual([0, 1, 2, 3]);
  });
});
