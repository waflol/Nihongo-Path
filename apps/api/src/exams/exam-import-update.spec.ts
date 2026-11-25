import { describe, expect, it } from "vitest";
import { ExamImportService } from "./exam-import.service.js";
import { contentHashOf } from "./mondai.js";

/** A draft document stand-in: `save`/`markModified` are no-ops, fields are plain. */
function fakeDraft(over: Record<string, unknown> = {}) {
  const doc: Record<string, unknown> = {
    status: "needs_review",
    mondai: "reading-mid",
    answers: [],
    issues: ["x"],
    save: async () => doc,
    markModified: () => undefined,
    toObject: () => doc,
    ...over,
  };
  return doc;
}

function serviceWith(doc: Record<string, unknown> | null): ExamImportService {
  const svc = Object.create(ExamImportService.prototype) as unknown as { drafts: unknown };
  svc.drafts = { findById: () => ({ exec: async () => doc }) };
  return svc as unknown as ExamImportService;
}
const caller = { sub: "u1" } as never;

describe("ExamImportService.updateDraft", () => {
  const body = {
    stimuli: [{ key: "s1", kind: "passage", body: " 本文です。 ", notes: "(注) x" }],
    questions: [
      { prompt: "この文章の内容は？", options: ["あ", "い", "う", "え"], stimulusKey: "s1", printedNo: 55 },
      { prompt: "二つ目", options: ["a", "b", "c", "d"], stimulusKey: "s1" },
    ],
    answers: [2, 9],
  };

  it("stores the edited shape, renumbers, keeps valid answers and marks it manual", async () => {
    const doc = fakeDraft();
    await serviceWith(doc).updateDraft(caller, "d1", body);
    const parsed = doc.parsed as { stimuli: { body: string }[]; questions: { no: number; groupOrder?: number }[] };
    expect(parsed.stimuli[0].body).toBe("本文です。");
    expect(parsed.questions.map((q) => [q.no, q.groupOrder])).toEqual([[1, 1], [2, 2]]);
    expect((doc.parsed as { questions: { printedNo?: number }[] }).questions.map((q) => q.printedNo)).toEqual([55, undefined]);
    expect(doc.answers).toEqual([2, 0]); // 9 is not a valid option → unknown
    expect(doc.parsedBy).toBe("manual");
    expect(doc.status).toBe("needs_review");
    expect(doc.issues).toEqual([]);
  });

  it("refuses published drafts, wrong option counts and dangling passage links", async () => {
    await expect(serviceWith(fakeDraft({ status: "published" })).updateDraft(caller, "d1", body)).rejects.toThrow();
    const short = { ...body, questions: [{ prompt: "q", options: ["a", "b"], stimulusKey: "s1" }] };
    await expect(serviceWith(fakeDraft()).updateDraft(caller, "d1", short)).rejects.toThrow(/phương án/);
    const dangling = { ...body, questions: [{ prompt: "q", options: ["a", "b", "c", "d"], stimulusKey: "s9" }] };
    await expect(serviceWith(fakeDraft()).updateDraft(caller, "d1", dangling)).rejects.toThrow(/không tồn tại/);
  });

  it("lets an error draft with no parsed result be filled in by hand", async () => {
    const doc = fakeDraft({ status: "error", parsed: undefined });
    await serviceWith(doc).updateDraft(caller, "d1", body);
    expect(doc.status).toBe("needs_review");
  });
});

import { fillPrintedNos } from "./exam-import.service.js";
describe("fillPrintedNos — numbers continue within one paper", () => {
  it("continues from the previous block when a printed number was not read", () => {
    const m = fillPrintedNos([
      { _id: "b", blockIndex: 2, sitting: "N2-1", parsed: { questions: [{}, {}] } },
      { _id: "a", blockIndex: 1, sitting: "N2-1", parsed: { questions: [{ printedNo: 1 }, { printedNo: 2 }, {}] } },
      { _id: "c", blockIndex: 1, sitting: "N2-2", parsed: { questions: [{}, {}] } },
    ]);
    expect(m.get("a")).toEqual([1, 2, 3]);
    expect(m.get("b")).toEqual([4, 5]);
    expect(m.get("c")).toEqual([1, 2]);
  });
});

describe("ExamImportService.updateDraft — instruction and formatting", () => {
  const q = { prompt: "<u>本文</u>はどれ", options: ["<b>あ</b>", "い", "う", "え"] };

  it("saves the edited instruction and keeps bold / italic / underline", async () => {
    const doc = fakeDraft({ instruction: "old" });
    await serviceWith(doc).updateDraft(caller, "d1", { instruction: " 問題9 <b>次の文章</b>を読んで ", questions: [q] });
    expect(doc.instruction).toBe("問題9 <b>次の文章</b>を読んで");
    expect((doc.parsed as { questions: { prompt: string }[] }).questions[0].prompt).toBe("<u>本文</u>はどれ");
  });

  it("treats a field holding only formatting tags as empty", async () => {
    const empty = { ...q, prompt: "<b> </b>" };
    await expect(serviceWith(fakeDraft()).updateDraft(caller, "d1", { questions: [empty] })).rejects.toThrow(/thiếu đề/);
  });

  it("furigana does not change the dedup hash", () => {
    expect(contentHashOf("<size=125><u><ruby=ほんぶん>本文</ruby></u></size>はどれ", q.options)).toBe(contentHashOf("本文はどれ", q.options));
  });

  it("formatting does not change the dedup hash", () => {
    expect(contentHashOf(q.prompt, q.options)).toBe(contentHashOf("本文はどれ", ["あ", "い", "う", "え"]));
  });
});
