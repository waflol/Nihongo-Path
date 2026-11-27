import { describe, expect, it } from "vitest";
import { ExamImportService } from "./exam-import.service.js";

const opts = ["a", "b", "c", "d"];
const rows = [
  { _id: "x", blockIndex: 0, sitting: "2010-07", instruction: "問題1 読み方", status: "needs_review", answers: [0, 2], parsed: { questions: [{ no: 1, options: opts }, { no: 2, options: opts }] } },
  { _id: "y", blockIndex: 1, sitting: "2010-07", instruction: "問題2 文脈", status: "published", answers: [1], parsed: { questions: [{ no: 1, options: opts }] } },
];

/** importAnswerFile over in-memory drafts, recording the writes. */
function harness() {
  const svc = Object.create(ExamImportService.prototype) as ExamImportService;
  const fake = svc as unknown as Record<string, unknown>;
  const writes: { filter: unknown; update: unknown }[] = [];
  fake.drafts = {
    find: () => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) }),
    updateOne: (filter: unknown, update: unknown) => ({ exec: async () => void writes.push({ filter, update }) }),
  };
  fake.jobs = { findById: () => ({ select: () => ({ lean: () => ({ exec: async () => ({ fileName: "De N2 (2010).pdf" }) }) }) }) };
  return { svc, writes };
}
const caller = { sub: "u" } as never;

describe("ExamImportService answer file", () => {
  it("previews without writing", async () => {
    const { svc, writes } = harness();
    const r = await svc.importAnswerFile(caller, "j", { text: "問題1: 3 4\n問題2: 2" });
    expect(r).toEqual({
      matched: 2,
      problems: ["khối 2 đã xuất bản hoặc đã loại — bỏ qua đáp án của các khối này"],
      given: [{ draftId: "x", answers: [3, 4] }],
      saved: 0,
    });
    expect(writes).toEqual([]);
  });

  it("saves: blanks take the file's answer, a stored one only with overwrite, and never on a closed draft", async () => {
    const { svc, writes } = harness();
    await svc.importAnswerFile(caller, "j", { text: "問題1: 3 4", save: true });
    await svc.importAnswerFile(caller, "j", { text: "問題1: 3 4", save: true, overwrite: true });
    expect(writes).toEqual([
      { filter: { _id: "x", status: { $in: ["needs_review", "error"] } }, update: { $set: { answers: [3, 2] } } },
      { filter: { _id: "x", status: { $in: ["needs_review", "error"] } }, update: { $set: { answers: [3, 4] } } },
    ]);
  });

  it("refuses an empty file", async () => {
    await expect(harness().svc.importAnswerFile(caller, "j", { text: "  " })).rejects.toThrow(/trống/);
  });

  it("builds the template from the drafts, named after the PDF", async () => {
    const t = await harness().svc.answerFileTemplate("j");
    expect(t.fileName).toBe("dap-an_De_N2_2010_.csv");
    expect(t.csv).toBe("﻿de,khoi,dang,cau,dap_an\r\n2010-07,1,問題1,1,\r\n2010-07,1,問題1,2,2\r\n2010-07,2,問題2,3,1\r\n");
  });
});
