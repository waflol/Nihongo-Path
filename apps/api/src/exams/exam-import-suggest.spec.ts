import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ExamImportService } from "./exam-import.service.js";

const parsed = {
  stimuli: [],
  questions: [
    { no: 1, prompt: "<u>花</u>を見る。", options: ["はな", "は", "ひ", "み"] },
    { no: 2, prompt: "<u>山</u>に登る。", options: ["やま", "さん", "か", "き"] },
  ],
};

/** suggestAnswers with one in-memory draft and an AI that answers `reply` (null = no service answered). */
function harness(draft: Record<string, unknown> | null, reply: string | null) {
  const svc = Object.create(ExamImportService.prototype) as ExamImportService;
  const fake = svc as unknown as Record<string, unknown>;
  const prompts: string[] = [];
  fake.drafts = { findById: () => ({ select: () => ({ lean: () => ({ exec: async () => draft }) }) }) };
  fake.ai = {
    completeAny: async (prompt: string, _opts: unknown, read: (t: string) => { value: unknown; ok: boolean }) => {
      prompts.push(prompt);
      return reply === null ? { answered: false, error: "rate limited" } : { answered: true, value: read(reply).value };
    },
  };
  return { svc, prompts };
}

const caller = { sub: "u" } as never;
const open = { status: "needs_review", level: "N2", mondai: "kanji-reading", instruction: "問題1", parsed, blockIndex: 0 };

describe("ExamImportService.suggestAnswers", () => {
  it("returns the AI's answers keyed by question number, storing nothing", async () => {
    const { svc, prompts } = harness(open, '{"answers":[{"q":1,"answer":1,"why":"花 đọc là はな"},{"q":2,"answer":1,"why":"山 = やま"}]}');
    await expect(svc.suggestAnswers(caller, "d")).resolves.toEqual({
      suggestions: [
        { answer: 1, why: "花 đọc là はな" },
        { answer: 1, why: "山 = やま" },
      ],
    });
    expect(prompts[0]).toContain("Q2: <u>山</u>に登る。");
  });

  it("refuses a block that is already published", async () => {
    const { svc, prompts } = harness({ ...open, status: "published" }, "{}");
    await expect(svc.suggestAnswers(caller, "d")).rejects.toBeInstanceOf(BadRequestException);
    expect(prompts).toEqual([]);
  });

  it("says so when no AI service answered", async () => {
    const { svc } = harness(open, null);
    await expect(svc.suggestAnswers(caller, "d")).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("fails when the AI gave no usable answer at all", async () => {
    const { svc } = harness(open, "Tôi không chắc.");
    await expect(svc.suggestAnswers(caller, "d")).rejects.toThrow(/không đưa ra được đáp án/);
  });
});
