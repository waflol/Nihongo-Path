import { describe, expect, it } from "vitest";
import { assembleExam, examKeyOf, partOf, type AssembleDraft } from "./assemble.js";
import { JLPT_STRUCTURE } from "./jlpt-structure.js";
import { SECTION_OF, type MondaiType } from "./mondai.js";

const draft = (mondai: MondaiType, count: number, over: Partial<AssembleDraft> = {}): AssembleDraft => {
  const jobId = over.jobId ?? "job1";
  const blockIndex = over.blockIndex ?? 0;
  return {
    jobId,
    jobCreatedAt: 1,
    blockIndex,
    mondai,
    section: SECTION_OF[mondai],
    questionIds: Array.from({ length: count }, (_, i) => `${jobId}:${mondai}:${blockIndex}:${i + 1}`),
    rights: "own",
    ...over,
  };
};

/** Every 問題 of a level at its usual count, in the given part(s). */
const paper = (level: string, keys?: string[]): AssembleDraft[] =>
  JLPT_STRUCTURE.find((s) => s.level === level)!
    .parts.filter((p) => !keys || keys.includes(p.key))
    .flatMap((p) => p.mondai)
    .map((m, i) => draft(m.mondai, m.count, { blockIndex: i }));

describe("examKeyOf", () => {
  it("ignores width, case and spacing", () => {
    expect(examKeyOf("n3", "  Bộ  Đề Ａ ", "2022-07")).toBe(examKeyOf("N3", "bộ đề a", "2022-07"));
  });

  it("keeps the same sitting label of two collections apart", () => {
    expect(examKeyOf("N3", "sách A", "N3-1")).not.toBe(examKeyOf("N3", "sách B", "N3-1"));
  });

  it("cannot name a paper without a set name or a sitting", () => {
    expect(examKeyOf("N3", "bộ A", "unknown")).toBeNull();
    expect(examKeyOf("N3", " ", "2022-07")).toBeNull();
  });

  it("does not let a separator in a name forge another key", () => {
    expect(examKeyOf("N3", "a|b", "c")).not.toBe(examKeyOf("N3", "a", "b|c"));
  });
});

describe("partOf", () => {
  it("follows the level's timed parts", () => {
    expect(partOf("N2", "kanji-reading", "vocab")).toBe("language-reading");
    expect(partOf("N3", "kanji-reading", "vocab")).toBe("language");
    expect(partOf("N3", "reading-mid", "reading")).toBe("grammar-reading");
    expect(partOf("N1", "listening-quick", "listening")).toBe("listening");
  });

  it("places a form the level does not list by its paper section", () => {
    expect(partOf("N3", "reading-thematic", "reading")).toBe("grammar-reading");
    expect(partOf("N3", "listening", "listening")).toBe("listening");
    expect(partOf("N4", null, "vocab")).toBe("language");
  });
});

describe("assembleExam", () => {
  it("builds a full N3 paper with the official times and no warnings", () => {
    const exam = assembleExam("N3", paper("N3"));
    expect(exam.kind).toBe("full");
    expect(exam.sections.map((s) => [s.key, s.timeLimitMin])).toEqual([
      ["language", 30],
      ["grammar-reading", 70],
      ["listening", 40],
    ]);
    expect(exam.questions).toEqual(exam.sections.flatMap((s) => s.questions));
    expect(exam.warnings).toEqual([]);
  });

  it("is a section paper when a timed part is missing", () => {
    const exam = assembleExam("N3", paper("N3", ["language", "grammar-reading"]));
    expect(exam.kind).toBe("section");
    expect(exam.warnings).toEqual(["Chưa có phần 聴解"]);
  });

  it("is not full when the combined N2 part holds only the vocabulary", () => {
    const drafts = paper("N2").filter((d) => d.section === "vocab" || d.section === "listening");
    expect(assembleExam("N2", drafts).kind).toBe("section");
  });

  it("merges the written and the listening file of one sitting", () => {
    const listening = paper("N3", ["listening"]).map((d) => ({ ...d, jobId: "job2", jobCreatedAt: 2 }));
    const exam = assembleExam("N3", [...listening, ...paper("N3", ["language", "grammar-reading"])]);
    expect(exam.kind).toBe("full");
    expect(exam.sections.map((s) => s.key)).toEqual(["language", "grammar-reading", "listening"]);
  });

  it("keeps the printed order whatever order the drafts arrive in", () => {
    const drafts = paper("N3");
    expect(assembleExam("N3", [...drafts].reverse())).toEqual(assembleExam("N3", drafts));
  });

  it("concatenates one job's blocks of a 問題 by block index", () => {
    const exam = assembleExam("N3", [draft("reading-mid", 2, { blockIndex: 8 }), draft("reading-mid", 2, { blockIndex: 7 })]);
    expect(exam.questions).toEqual(["job1:reading-mid:7:1", "job1:reading-mid:7:2", "job1:reading-mid:8:1", "job1:reading-mid:8:2"]);
  });

  it("lets the newest import of a 問題 replace the older one, and only that 問題", () => {
    const exam = assembleExam("N3", [
      draft("kanji-reading", 2),
      draft("orthography", 1, { blockIndex: 1 }),
      draft("kanji-reading", 1, { jobId: "job2", jobCreatedAt: 2 }),
    ]);
    expect(exam.questions).toEqual(["job2:kanji-reading:0:1", "job1:orthography:1:1"]);
  });

  it("keeps a block of unknown type after its own section", () => {
    const exam = assembleExam("N2", [
      draft("grammar-form", 1, { blockIndex: 2 }),
      draft("kanji-reading", 1),
      { ...draft("context", 1, { blockIndex: 1 }), mondai: null, questionIds: ["unknown-vocab"] },
    ]);
    expect(exam.questions).toEqual(["job1:kanji-reading:0:1", "unknown-vocab", "job1:grammar-form:2:1"]);
  });

  it("gives a part with missing 問題 its share of the time", () => {
    // 15 of N3's 35 vocabulary questions → ceil(30 × 15 / 35) = 13 minutes.
    expect(assembleExam("N3", [draft("context", 15)]).sections[0].timeLimitMin).toBe(13);
    expect(assembleExam("N3", [draft("context", 1)]).sections[0].timeLimitMin).toBe(5);
    expect(assembleExam("N3", [draft("context", 90)]).sections[0].timeLimitMin).toBe(30);
  });

  it("keeps the full time when every 問題 is there but some questions are not", () => {
    const drafts = paper("N3").map((d) => ({ ...d, questionIds: d.questionIds.slice(0, 1) }));
    const exam = assembleExam("N3", drafts);
    expect(exam.sections[0].timeLimitMin).toBe(30);
    expect(exam.warnings.length).toBeGreaterThan(0);
  });

  it("keeps a time the admin set, and recomputes the others", () => {
    const exam = assembleExam("N3", paper("N3"), [
      { key: "language", timeLimitMin: 45, timeLocked: true },
      { key: "listening", timeLimitMin: 12 },
    ]);
    expect(exam.sections[0]).toMatchObject({ timeLimitMin: 45, timeLocked: true });
    expect(exam.sections[2].timeLimitMin).toBe(40);
  });

  it("takes the most restrictive rights of the questions used", () => {
    expect(assembleExam("N3", paper("N3")).rights).toBe("own");
    expect(assembleExam("N3", [draft("context", 1), draft("usage", 1, { rights: "licensed" })]).rights).toBe("licensed");
    expect(assembleExam("N3", [draft("context", 1, { rights: "reference" }), draft("usage", 1)]).rights).toBe("reference");
    expect(assembleExam("N3", []).rights).toBe("reference");
  });

  it("serves a question once even if two drafts name it", () => {
    const first = draft("context", 2);
    const exam = assembleExam("N3", [first, { ...first, blockIndex: 1 }]);
    expect(exam.questions).toEqual(first.questionIds);
  });
});
