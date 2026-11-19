import { describe, expect, it } from "vitest";
import {
  type AttemptCore,
  type BankQuestion,
  buildResultPayload,
  buildSitPayload,
  estimateJlptScaled,
  gradeAttempt,
} from "./exams.service.js";

/**
 * NP-406 (P4-SEC-01 / T-P4-03, plan §6 GĐ1): a sectional sit payload carries
 * the shared passages (bài đọc) and star questions — but, like the flat
 * payload, it must NEVER leak a question's `answer`, `explain`, `correct` or
 * `isCorrect`. This walks the WHOLE payload recursively to assert that.
 *
 * Content is self-authored (plan §8.1) — the repo is public.
 *
 * The "correct" served index per question, from its `optionOrder` (all answers
 * sit at bank index 0):
 *   v1 [0,1,2,3] → p0 · g1 [1,0,3,2] → p1 · r1 [0,1,2,3] → p0 · r2 [2,3,0,1] → p2
 */

/** The forbidden keys: any of these anywhere in the payload = a leak. */
const FORBIDDEN = ["answer", "explain", "correct", "isCorrect"] as const;

/** Recursively collect every object key in a JSON-serialisable value. */
function allKeys(node: unknown, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const x of node) allKeys(x, acc);
    return acc;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      acc.push(k);
      allKeys(v, acc);
    }
  }
  return acc;
}

function forbiddenKey(keys: string[]): string | null {
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  for (const f of FORBIDDEN) if (lower.has(f)) return f;
  return null;
}

/** A sectional exam: 1 vocab + 2 grammar (one a ★ bound to a passage) + 1 reading. */
const BANK: BankQuestion[] = [
  {
    _id: "v1",
    kind: "kanji-pick",
    prompt: "猫",
    options: ["ねこ", "くま", "さけ", "わか"],
    answer: "ねこ",
    explain: "猫 = neko.",
    mondai: "kanji-reading",
    section: "vocab",
    points: 1,
  },
  {
    _id: "g1",
    kind: "grammar-form",
    prompt: "毎朝、公園を散歩します。",
    options: ["します", "する", "した", "す"],
    answer: "します",
    explain: "Habitual present form.",
    mondai: "grammar-form",
    section: "grammar",
    points: 1,
  },
  {
    _id: "r1",
    kind: "star-order",
    prompt: "この本は＿＿面白いです。",
    options: ["とても", "ほんの", "とて", "も"],
    answer: "とても",
    explain: "Adverb before the i-adjjective.",
    mondai: "star-order",
    section: "grammar",
    stimulusId: "passage-A",
    groupOrder: 1,
    points: 2,
  },
  {
    _id: "r2",
    kind: "passage-question",
    prompt: "筆者はどの意見を支持していますか。",
    options: ["支持する", "中立", "反対する", "不明"],
    answer: "支持する",
    explain: "The author supports the first opinion.",
    mondai: "reading-long",
    section: "reading",
    stimulusId: "passage-A",
    groupOrder: 2,
    points: 2,
  },
];

const ATTEMPT: AttemptCore = {
  _id: "att-sec",
  exam: "ex-sec",
  examTitle: "JLPT N3 — Đề theo phần",
  level: "N3",
  seed: 4242,
  questionOrder: ["v1", "g1", "r1", "r2"],
  optionOrder: {
    v1: [0, 1, 2, 3],
    g1: [1, 0, 3, 2],
    r1: [0, 1, 2, 3],
    r2: [2, 3, 0, 1],
  },
  startedAtMs: 1_000_000,
  deadlineMs: 3_000_000,
  status: "in_progress",
  answers: { v1: 0, g1: 1, r1: 0, r2: 2 }, // all correct
  flagged: [],
  questionSections: { v1: "vocab", g1: "grammar", r1: "grammar", r2: "reading" },
  sectionDeadlinesMs: { vocab: 1_300_000, grammar: 1_900_000, reading: 3_000_000 },
  sectionKeys: ["vocab", "grammar", "reading"],
};

const STIMULI = [
  {
    id: "passage-A",
    kind: "passage",
    title: "読解 問題①",
    body: "ある本屋の話。店主は新しい読書を支持している。",
    notes: "注：「支持」＝ approve.",
  },
];

const SECTIONS = [
  { key: "vocab", title: "文字・語彙", deadlineMs: ATTEMPT.sectionDeadlinesMs!.vocab },
  { key: "grammar", title: "文法・読解", deadlineMs: ATTEMPT.sectionDeadlinesMs!.grammar },
  { key: "reading", title: "読解", deadlineMs: ATTEMPT.sectionDeadlinesMs!.reading },
];

describe("buildSitPayload — sectional (NP-406)", () => {
  const payload = buildSitPayload(ATTEMPT, BANK, 1_500_000, {
    sections: SECTIONS,
    stimuli: STIMULI,
    maxPoints: 6,
  });

  it("serves the shared passage body but no answer of its questions", () => {
    expect(payload.stimuli?.length).toBe(1);
    expect(payload.stimuli?.[0]).toMatchObject({
      id: "passage-A",
      kind: "passage",
      body: expect.stringContaining("本屋"),
    });
    // The passage itself has no forbidden keys either.
    expect(forbiddenKey(allKeys(payload.stimuli))).toBeNull();
  });

  it("tags each question with its mondai / section / passage + groupOrder", () => {
    const r1 = payload.questions.find((q) => q.qid === "r1")!;
    expect(r1.mondai).toBe("star-order");
    expect(r1.section).toBe("grammar");
    expect(r1.stimulusId).toBe("passage-A");
    expect(r1.groupOrder).toBe(1);
    expect(r1.sectionKey).toBe("grammar");
  });

  it("describes the parts with cumulative deadlines + the point total", () => {
    expect(payload.sections?.map((s) => s.key)).toEqual(["vocab", "grammar", "reading"]);
    expect(payload.sections?.[0].deadlineMs).toBe(ATTEMPT.sectionDeadlinesMs!.vocab);
    expect(payload.deadlineMs).toBe(ATTEMPT.deadlineMs);
    expect(payload.maxPoints).toBe(6);
  });

  it("carries NO answer / explain / correct anywhere (recursive)", () => {
    const keys = allKeys(payload);
    expect(forbiddenKey(keys)).toBeNull();
    const json = JSON.stringify(payload);
    expect(json.includes('"answer"')).toBe(false);
    expect(json.includes('"explain"')).toBe(false);
    expect(json.includes('"correct"')).toBe(false);
  });

  it("the RESULT payload does expose verdicts + explain, but the sit does not", () => {
    const grade = gradeAttempt(BANK, ATTEMPT);
    const result = buildResultPayload(
      { ...ATTEMPT, status: "submitted", submittedAtMs: 1_800_000, durationSec: 400 },
      BANK,
      grade,
      { sections: SECTIONS, stimuli: STIMULI, maxPoints: 6 },
    );
    const r1 = result.results.find((r) => r.qid === "r1")!;
    expect(r1.correctIndex).toBe(0);
    expect(r1.explain).toBe("Adverb before the i-adjjective.");
    // But the mid-exam sit (what a refresh re-serves) never carried them:
    const sit = buildSitPayload(ATTEMPT, BANK, 1_500_000, { sections: SECTIONS, stimuli: STIMULI, maxPoints: 6 });
    expect(forbiddenKey(allKeys(sit))).toBeNull();
  });
});

describe("gradeAttempt — sectional points + sectionScores (NP-406)", () => {
  it("computes points / maxPoints / sectionScores, keeping the legacy counts", () => {
    const grade = gradeAttempt(BANK, ATTEMPT);
    expect(grade.maxPoints).toBe(6);
    expect(grade.points).toBe(6);
    expect(grade.score).toBe(4); // legacy question-count
    expect(grade.total).toBe(4);
    expect(grade.percent).toBe(100);
    expect(grade.sectionScores).toEqual({
      vocab: { score: 1, total: 1, points: 1, maxPoints: 1 },
      grammar: { score: 2, total: 2, points: 3, maxPoints: 3 },
      reading: { score: 1, total: 1, points: 2, maxPoints: 2 },
    });
  });

  it("a wrong high-point question drags its section's points down", () => {
    // r2 picks served 0 → bank "反対する" ≠ "支持する" → wrong.
    const attempt = { ...ATTEMPT, answers: { v1: 0, g1: 1, r1: 0, r2: 0 } };
    const grade = gradeAttempt(BANK, attempt);
    expect(grade.points).toBe(4); // 1(v1)+1(g1)+2(r1), missing r2's 2
    expect(grade.maxPoints).toBe(6);
    expect(grade.score).toBe(3);
    expect(grade.percent).toBe(75);
    expect(grade.sectionScores!.reading).toEqual({ score: 0, total: 1, points: 0, maxPoints: 2 });
  });

  it("estimateJlptScaled maps each part to 0–60, linear in its point share", () => {
    const full = gradeAttempt(BANK, ATTEMPT);
    expect(estimateJlptScaled(full.sectionScores!)).toEqual({ vocab: 60, grammar: 60, reading: 60 });

    // g1 correct (1pt), r1 wrong (0/2) → grammar 1/3 → 20; reading 0/2 → 0.
    const partial = gradeAttempt(BANK, { ...ATTEMPT, answers: { v1: 0, g1: 1, r1: 3, r2: 0 } });
    expect(estimateJlptScaled(partial.sectionScores!)).toEqual({ vocab: 60, grammar: 20, reading: 0 });
  });

  it("a flat exam (no questionSections) keeps the legacy grade shape", () => {
    const flatBank = BANK.filter((q) => !q.stimulusId);
    const flat: AttemptCore = {
      ...ATTEMPT,
      questionOrder: ["v1", "g1"],
      answers: { v1: 0, g1: 1 },
      questionSections: undefined,
      sectionScores: undefined,
      points: undefined,
      maxPoints: undefined,
    };
    const grade = gradeAttempt(flatBank, flat);
    expect(grade).toEqual({
      correct: { v1: true, g1: true },
      score: 2,
      total: 2,
      percent: 100,
    });
    expect(grade).not.toHaveProperty("points");
    expect(grade).not.toHaveProperty("sectionScores");
  });
});
