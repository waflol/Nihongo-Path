import { describe, expect, it } from "vitest";
import { ExamImportService } from "./exam-import.service.js";
import type { AnswerKeyBlock } from "./import/answer-key.js";

type Draft = { status: string; issues: string[]; parsedBy?: string; parsed?: { questions: unknown[] } };

/** structureBlock with in-memory drafts and an AI that always answers `aiValue`. */
function harness(aiValue: unknown) {
  const svc = Object.create(ExamImportService.prototype) as Record<string, unknown>;
  let draft: Draft | null = null;
  svc.drafts = { create: async (o: Record<string, unknown>) => (draft = { ...o, save: async () => undefined } as unknown as Draft) };
  svc.ai = { completeAny: async () => ({ answered: true, value: aiValue }) };
  svc.retryDelaysMs = [];
  svc.aiDown = new Set<string>();
  svc.isCancelled = async () => false;
  svc.logger = { warn: () => undefined };
  const run = async (block: Record<string, unknown>, key: AnswerKeyBlock | null, unread: number[]) => {
    await (svc as unknown as { structureBlock(...a: unknown[]): Promise<unknown> }).structureBlock("j", "f.pdf", "u", "N2", "reference", 0, block, key, [], unread);
    return draft!;
  };
  return { run };
}

const key = (n: number): AnswerKeyBlock => ({ heading: "問題1", questionCount: n, pointsPerQuestion: 1, totalPoints: null, answers: Array(n).fill(1) });
const kanji = {
  instruction: "問題1 ___の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。",
  rawText: ["[1] 花を見る。", "1 はな 2 は 3 ひ 4 み", "[2] 山に登る。", "1 やま 2 さん 3 か 4 き"].join("\n"),
  mondai: "kanji-reading",
  sectionHint: "vocab",
  sitting: "2010-07",
  pageFrom: 5,
  pageTo: 5,
};

describe("ExamImportService.structureBlock — checks against the printed key and unread pages", () => {
  it("trusts a rules read whose count the key confirms, even next to an unread page", async () => {
    const d = await harness(null).run(kanji, key(2), [6]);
    expect(d).toMatchObject({ status: "needs_review", parsedBy: "rules", issues: [] });
  });

  it("says a page next to the block was not read when the block comes up short", async () => {
    const d = await harness(null).run(kanji, key(3), [6]);
    expect(d.status).toBe("error");
    expect(d.issues).toEqual(
      expect.arrayContaining([expect.stringMatching(/số câu đọc được \(2\) khác bảng đáp án \(3\)/), expect.stringMatching(/^trang 6: AI chưa đọc được/)]),
    );
  });

  it("does not accept an AI read that has fewer questions than the key", async () => {
    const reading = {
      ...kanji,
      instruction: "問題10 次の(1)から(5)の文章を読んで、後の問いに対する答えとして最もよいものを、1・2・3・4から一つ選びなさい。",
      rawText: ["(1)", "本文です。とても大切な話です。", "55 筆者の考えはどれか。", "1 あ 2 い 3 う 4 え"].join("\n"),
      mondai: "reading-short",
    };
    const ai = {
      stimuli: [{ key: "s1", kind: "passage", body: "本文です。とても大切な話です。" }],
      questions: [{ no: 55, prompt: "筆者の考えはどれか。", options: ["あ", "い", "う", "え"], stimulusKey: "s1" }],
    };
    const d = await harness(ai).run(reading, key(2), []);
    expect(d.status).toBe("error");
    expect(d.issues).toEqual([expect.stringMatching(/số câu đọc được \(1\) khác bảng đáp án \(2\)/)]);
  });
});
