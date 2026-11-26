import { describe, expect, it } from "vitest";
import { ExamImportService } from "./exam-import.service.js";
import type { Mark } from "./import/marks.js";
import type { ProsePdf } from "./import/prose.js";
import { OcrFailedError } from "./import/prose.js";

const underline = (text: string, before: string, after: string): Mark => ({ kind: "u", text, before, after });

interface Draft {
  _id: string;
  pageFrom: number;
  pageTo: number;
  instruction: string;
  parsed: { questions: { prompt: string; options: string[] }[] };
  saved: number;
  markModified(): void;
  save(): Promise<void>;
}

const draft = (id: string, page: number, prompt: string): Draft => ({
  _id: id,
  pageFrom: page,
  pageTo: page,
  instruction: "",
  parsed: { questions: [{ prompt, options: [] }] },
  saved: 0,
  markModified: () => undefined,
  async save() {
    this.saved += 1;
  },
});

function harness(drafts: Draft[], stored: Record<number, Mark[]> = {}) {
  const logs: string[] = [];
  const pageWrites: number[] = [];
  const svc = Object.create(ExamImportService.prototype) as Record<string, unknown>;
  svc.log = async (_id: string, _level: string, msg: string) => void logs.push(msg);
  svc.jobs = { exists: async () => true };
  svc.pages = {
    findOne: (f: { n: number }) => ({ lean: () => ({ exec: async () => ({ marks: stored[f.n] ?? [] }) }) }),
    updateOne: (f: { n: number }) => ({ exec: async () => void pageWrites.push(f.n) }),
  };
  svc.drafts = { findOne: (f: { _id: string }) => ({ exec: async () => drafts.find((d) => d._id === f._id) ?? null }) };
  const run = (pdf: ProsePdf) =>
    (svc as unknown as { markScans(id: string, p: ProsePdf, d: Draft[]): Promise<void> }).markScans("j", pdf, drafts);
  return { run, logs, pageWrites };
}

/** A scanned PDF: page `n` yields `marks[n]` once read; a missing entry cannot be read. */
function scan(marks: Record<number, Mark[]>, asked: number[]): ProsePdf {
  return {
    numPages: 20,
    totalPages: 20,
    close: async () => undefined,
    pageText: async (n) => {
      asked.push(n);
      if (!marks[n]) throw new OcrFailedError(n);
      return "text";
    },
    pageMarks: (n) => marks[n] ?? [],
  };
}

describe("ExamImportService.markScans", () => {
  it("reads each scanned page once, reuses stored marks and underlines the drafts", async () => {
    const drafts = [draft("a", 1, "彼の態度はよくない。"), draft("b", 1, "空は青い。"), draft("c", 2, "海は広い。")];
    const h = harness(drafts, { 2: [underline("海", "", "は広い。")] });
    const asked: number[] = [];
    await h.run(scan({ 1: [underline("態度", "彼の", "はよくない。"), underline("空", "", "は青い。")] }, asked));
    expect(asked).toEqual([1]);
    expect(h.pageWrites).toEqual([1]);
    expect(drafts.map((d) => d.parsed.questions[0].prompt)).toEqual(["彼の<u>態度</u>はよくない。", "<u>空</u>は青い。", "<u>海</u>は広い。"]);
    expect(h.logs.at(-1)).toMatch(/3\/3 bản nháp/);
  });

  it("stops when nothing can be read several pages in a row", async () => {
    const drafts = [1, 2, 3, 4, 5, 6, 7].map((n) => draft(`d${n}`, n, "文"));
    const h = harness(drafts);
    const asked: number[] = [];
    await expect(h.run(scan({}, asked))).rejects.toThrow(/5 trang liên tiếp/);
    expect(asked).toEqual([1, 2, 3, 4, 5]);
  });
});
