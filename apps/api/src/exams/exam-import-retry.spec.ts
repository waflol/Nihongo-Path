import { describe, expect, it, vi } from "vitest";
import { ExamImportService } from "./exam-import.service.js";
import { OcrFailedError, type ProsePdf } from "./import/prose.js";
import { retryRounds } from "./import/retry.js";

describe("retryRounds", () => {
  it("waits and tries again until there is an answer", async () => {
    const attempt = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue("ok");
    await expect(retryRounds(attempt, [0, 0, 0])).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up after the last wait, or as soon as it is told to stop", async () => {
    const never = vi.fn().mockResolvedValue(null);
    await expect(retryRounds(never, [0, 0])).resolves.toBeNull();
    expect(never).toHaveBeenCalledTimes(3);
    never.mockClear();
    await expect(retryRounds(never, [0, 0], async () => true)).resolves.toBeNull();
    expect(never).toHaveBeenCalledTimes(1);
  });

  it("accepts an empty string as an answer (a blank page)", async () => {
    await expect(retryRounds(async () => "", [0])).resolves.toBe("");
  });
});

function harness() {
  const saved: number[] = [];
  const logs: string[] = [];
  const svc = Object.create(ExamImportService.prototype) as Record<string, unknown>;
  svc.isCancelled = async () => false;
  svc.pageExists = async () => false;
  svc.log = async (_id: string, _level: string, msg: string) => void logs.push(msg);
  svc.jobs = { updateOne: () => ({ exec: async () => ({}) }) };
  svc.pages = { updateOne: (f: { n: number }) => ({ exec: async () => void saved.push(f.n) }) };
  const run = (pdf: ProsePdf) => (svc as unknown as { readPages(id: string, p: ProsePdf): Promise<boolean> }).readPages("j", pdf);
  return { run, saved, logs };
}

/** A PDF whose page `n` fails `failures[n]` times before it can be read. */
function pdfWith(numPages: number, failures: Record<number, number>): ProsePdf {
  return {
    numPages,
    totalPages: numPages,
    close: async () => undefined,
    pageText: async (n) => {
      if ((failures[n] ?? 0) > 0) {
        failures[n] -= 1;
        throw new OcrFailedError(n);
      }
      return `page ${n}`;
    },
  };
}

describe("ExamImportService.readPages", () => {
  it("never saves an unread page, reads it again afterwards and reports the ones still missing", async () => {
    const h = harness();
    await expect(h.run(pdfWith(4, { 2: 1, 3: 9 }))).resolves.toBe(true);
    expect(h.saved).toEqual([1, 4, 2]);
    expect(h.logs.at(-1)).toMatch(/1 trang AI không đọc được.*: 3$/);
  });

  it("stops the job when the AI reads nothing for several pages in a row", async () => {
    const h = harness();
    await expect(h.run(pdfWith(8, { 2: 9, 3: 9, 4: 9, 5: 9, 6: 9 }))).rejects.toThrow(/5 trang liên tiếp/);
    expect(h.saved).toEqual([1]);
  });
});

describe("ExamImportService — pages the AI refuses to copy", () => {
  /** A PDF whose pages in `refused` are refused on every read. */
  const refusingPdf = (numPages: number, refused: number[]): ProsePdf => ({
    numPages,
    totalPages: numPages,
    close: async () => undefined,
    pageText: async (n) => {
      if (refused.includes(n)) throw new OcrFailedError(n, "I cannot transcribe this page verbatim (copyright)");
      return `page ${n}`;
    },
  });

  it("never stores a refused page, keeps reading past several in a row, and names them in the log", async () => {
    const h = harness();
    await expect(h.run(refusingPdf(8, [2, 3, 4, 5, 6]))).resolves.toBe(true);
    expect(h.saved).toEqual([1, 7, 8]);
    expect(h.logs.some((l) => /Trang 2\/8: AI từ chối chép/.test(l))).toBe(true);
    expect(h.logs.at(-1)).toMatch(/5 trang AI không đọc được.*2, 3, 4, 5, 6 \(AI từ chối chép vì bản quyền: 2, 3, 4, 5, 6/);
  });

  it("turns an OCR refusal into an unread page for the reader, without waiting between rounds", async () => {
    const svc = Object.create(ExamImportService.prototype) as Record<string, unknown>;
    const ocrExamPageText = vi.fn().mockResolvedValue({ refused: "I cannot transcribe this page" });
    svc.ai = { ocrExamPageText };
    svc.retryDelaysMs = [60_000];
    const ocr = (svc as unknown as { ocrPage(): (png: Buffer, n: number) => Promise<string | null> }).ocrPage();
    const err = await ocr(Buffer.from(""), 3).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OcrFailedError);
    expect(err).toMatchObject({ page: 3, refused: "I cannot transcribe this page" });
    expect(ocrExamPageText).toHaveBeenCalledTimes(1);
  });
});
