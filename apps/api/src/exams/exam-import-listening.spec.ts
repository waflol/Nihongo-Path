import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ExamImportService, keyForBlock } from "./exam-import.service.js";
import { keepsOptionOrder } from "./exams.service.js";
import type { AnswerKeyBlock } from "./import/answer-key.js";

const key = (heading: string, n: number, a = 1): AnswerKeyBlock => ({ heading, questionCount: n, pointsPerQuestion: 1, totalPoints: null, answers: Array(n).fill(a) });
const chain = <T>(v: T) => ({ select: () => chain(v), lean: () => chain(v), sort: () => chain(v), limit: () => chain(v), exec: async () => v });

describe("keyForBlock — 聴解 restarts at 問題 1", () => {
  const written = [key("問題1", 5, 1), key("問題2", 5, 2)];
  const withListening = [...written, key("問題1", 5, 3), key("問題2", 6, 4)];

  it("gives a listening block the key after the written part's", () => {
    expect(keyForBlock({ instruction: "問題 1 では…", mondai: "listening-task" }, withListening, [], "N2")?.answers[0]).toBe(3);
    expect(keyForBlock({ instruction: "問題 1 …", mondai: "kanji-reading" }, withListening, [], "N2")?.answers[0]).toBe(1);
  });

  it("never lends a listening block the 文字・語彙 answers of the same number", () => {
    expect(keyForBlock({ instruction: "問題 1 では…", mondai: "listening-task" }, written, [], "N2")).toBeNull();
    // N3–N5: two written sheets both start at 問題 1, so a third 問題 1 is the listening one.
    expect(keyForBlock({ instruction: "問題 1 では…", mondai: "listening-task" }, [written[0], written[0]], [], "N3")).toBeNull();
    expect(keyForBlock({ instruction: "問題 1 では…", mondai: "listening-task" }, [written[0], written[0], key("問題1", 6, 3)], [], "N3")?.answers[0]).toBe(3);
  });
});

/** A service over in-memory models: one draft, what gets created, what gets updated. */
function harness(draft: Record<string, unknown>, assets = 1) {
  const svc = Object.create(ExamImportService.prototype) as ExamImportService;
  const fake = svc as unknown as Record<string, unknown>;
  const created: { stimuli: Record<string, unknown>[]; bank: Record<string, unknown>[] } = { stimuli: [], bank: [] };
  const updates: unknown[] = [];
  const doc = { _id: "d1", ...draft, save: async () => doc, markModified: () => undefined, toObject: () => doc } as Record<string, unknown>;
  fake.drafts = {
    findById: () => ({ exec: async () => doc }),
    find: () => chain([doc]),
    create: async (o: Record<string, unknown>) => Object.assign(doc, o),
    updateMany: (filter: unknown, update: unknown) => {
      updates.push({ filter, update });
      return { exec: async () => ({ modifiedCount: 2 }) };
    },
  };
  fake.stimuli = {
    updateOne: (filter: object, u: { $set: Record<string, unknown> }) => ({ exec: async () => created.stimuli.push({ ...filter, ...u.$set }) }),
    findOne: () => chain({ _id: `st${created.stimuli.length}` }),
  };
  fake.bank = {
    updateOne: (filter: object, u: { $set: Record<string, unknown> }) => ({ exec: async () => created.bank.push({ ...filter, ...u.$set }) }),
    findOne: () => chain({ _id: `q${created.bank.length}` }),
  };
  fake.jobs = { findById: () => ({ exec: async () => ({ fileName: "f.pdf", setName: "set", createdAt: new Date(0) }) }) };
  fake.examSync = { sync: async () => ({ examId: "e", questions: 0, warnings: [] }) };
  fake.audioAssets = { countDocuments: () => ({ exec: async () => assets }) };
  // Pictures: no kept PDF here; a crop is recorded and stored under a made-up id.
  const crops: unknown[] = [];
  fake.dir = "/nonexistent-exam-import";
  fake.logger = { warn: () => undefined, log: () => undefined };
  fake.pageImage = async (jobId: string, page: number) => Buffer.from(`${jobId}:${page}`);
  fake.images = {
    crop: async (png: Buffer, rect: unknown) => (crops.push({ png: png.toString(), rect }), Buffer.from("cut")),
    save: async () => "f".repeat(64),
  };
  return { svc, doc, created, updates, crops };
}

const A = "a".repeat(24);
const B = "b".repeat(24);
const caller = { sub: "u" } as never;
const heard = (n: number) => ({ no: n, printedNo: n, prompt: `${n}番`, options: ["1", "2", "3"] });
const quickDraft = () => ({
  jobId: "j",
  file: "f.pdf",
  level: "N2",
  sitting: "2025-12",
  mondai: "listening-quick",
  section: "listening",
  instruction: "問題4では、問題用紙に何も印刷されていません。",
  status: "needs_review",
  rights: "reference",
  answers: [2, 3],
  parsed: { stimuli: [], questions: [heard(1), heard(2)] },
});

describe("ExamImportService — listening drafts", () => {
  it("reads a listening block by rules when the import structures it", async () => {
    const { svc, doc } = harness({});
    const block = { instruction: "問題3では、全体としてどんな内容かを聞く問題です。", rawText: "―メモー", mondai: "listening-summary", sectionHint: "listening", sitting: "2025-12" };
    await (svc as unknown as { structureBlock(...a: unknown[]): Promise<unknown> }).structureBlock("j", "f.pdf", "u", "N2", "reference", 15, block, key("問題3", 5, 2), [], []);
    expect(doc).toMatchObject({ parsedBy: "rules", status: "needs_review", issues: [], answers: [2, 2, 2, 2, 2] });
    expect((doc.parsed as { questions: unknown[] }).questions).toHaveLength(5);
  });

  it("sets the block's file, one question's stretch, and shares a whole-part file with the paper's other listening blocks", async () => {
    const { svc, doc, updates } = harness(quickDraft());
    const r = await svc.setDraftAudio(caller, "d1", { audio: { assetId: A }, questions: [{ assetId: A, startSec: 12, endSec: "40.25" }, null], wholePart: true });
    expect(doc.audio).toEqual({ assetId: A });
    const qs = (doc.parsed as { questions: { audio?: unknown }[] }).questions;
    expect(qs[0].audio).toEqual({ assetId: A, startSec: 12, endSec: 40.3 });
    expect(qs[1].audio).toBeUndefined();
    expect(r.applied).toBe(2);
    expect(updates[0]).toMatchObject({ filter: { jobId: "j", sitting: "2025-12", section: "listening" }, update: { $set: { audio: { assetId: A } } } });
  });

  it("refuses a clip of a file that was never uploaded, a backwards stretch, or a non-listening block", async () => {
    await expect(harness(quickDraft(), 0).svc.setDraftAudio(caller, "d1", { audio: { assetId: A } })).rejects.toThrow(/Không tìm thấy file nghe/);
    await expect(harness(quickDraft()).svc.setDraftAudio(caller, "d1", { questions: [{ assetId: A, startSec: 30, endSec: 10 }] })).rejects.toThrow(/kết thúc phải sau/);
    await expect(harness({ ...quickDraft(), mondai: "kanji-reading" }).svc.setDraftAudio(caller, "d1", { audio: null })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("publishes the block's file as one listening passage above its questions, and a question's own clip with it", async () => {
    const { svc, created } = harness({ ...quickDraft(), audio: { assetId: A } });
    (svc as unknown as { drafts: { find: unknown } }).drafts.find = () => chain([]);
    const d = quickDraft();
    d.parsed.questions[1] = { ...heard(2), audio: { assetId: B } } as never;
    Object.assign(await (svc as unknown as { drafts: { findById(): { exec(): Promise<Record<string, unknown>> } } }).drafts.findById().exec(), { parsed: d.parsed });
    await svc.publish(caller, "d1");
    expect(created.stimuli).toEqual([expect.objectContaining({ kind: "listening", audio: { assetId: A }, questionCount: 2, mondai: "listening-quick" })]);
    expect(created.bank.map((q) => [q.prompt, q.answer, q.stimulus, q.audio])).toEqual([
      ["1番", "2", "st1", undefined],
      ["2番", "3", "st1", { assetId: B }],
    ]);
    // The same "1番" with options 1-2-3 recurs in every paper: each paper's is its own question.
    const other = harness({ ...quickDraft(), _id: "d2", sitting: "2024-07" });
    (other.svc as unknown as { drafts: { find: unknown } }).drafts.find = () => chain([]);
    await other.svc.publish(caller, "d1");
    expect(other.created.bank[0].contentHash).not.toBe(created.bank[0].contentHash);
  });

  it("keeps each question's clip through a hand edit", async () => {
    const d = quickDraft();
    d.parsed.questions[1] = { ...heard(2), audio: { assetId: B } } as never;
    const { svc, doc } = harness(d);
    await svc.updateDraft(caller, "d1", {
      instruction: d.instruction,
      stimuli: [],
      questions: [{ prompt: "2番", options: ["1", "2", "3"] }, { prompt: "1番", options: ["1", "2", "3"] }],
      answers: [3, 2],
    });
    const qs = (doc.parsed as { questions: { prompt: string; audio?: unknown }[] }).questions;
    expect(qs.map((q) => [q.prompt, q.audio])).toEqual([
      ["2番", { assetId: B }],
      ["1番", undefined],
    ]);
  });

  it("cuts a question's picture from a page, settles its 'options are pictures' check, and clears it", async () => {
    const d = {
      ...quickDraft(),
      mondai: "listening-task",
      status: "error",
      issues: ["2番: không đọc được phương án (có thể là hình) — cắt hình cho câu này từ ảnh trang, hoặc nhập trong Chỉnh sửa"],
      parsed: { stimuli: [], questions: [{ ...heard(1), options: ["あ", "い", "う", "え"] }, { ...heard(2), options: ["1", "2", "3", "4"] }] },
    };
    const { svc, doc, crops } = harness(d);
    await svc.setPicture(caller, "d1", { question: 1, page: 14, rect: { x: 0.3, y: 0.2, w: 0.4, h: 0.25 } });
    const qs = (doc.parsed as { questions: { image?: string }[] }).questions;
    expect(crops).toEqual([{ png: "j:14", rect: { x: 0.3, y: 0.2, w: 0.4, h: 0.25 } }]);
    expect(qs[1].image).toBe("f".repeat(64));
    expect(doc).toMatchObject({ issues: [], status: "needs_review" });
    await svc.setPicture(caller, "d1", { question: 1, clear: true });
    expect(qs[1].image).toBeUndefined();
    await expect(svc.setPicture(caller, "d1", { question: 5, clear: true })).rejects.toThrow(/Không có câu này/);
  });

  it("publishes a question's picture, and keeps a picture or listening question's options in printed order", async () => {
    const d = quickDraft();
    d.parsed.questions[0] = { ...heard(1), image: "c".repeat(64) } as never;
    const { svc, created } = harness(d);
    (svc as unknown as { drafts: { find: unknown } }).drafts.find = () => chain([]);
    await svc.publish(caller, "d1");
    expect(created.bank.map((q) => q.image)).toEqual(["c".repeat(64), undefined]);
    expect(keepsOptionOrder({ mondai: "listening-quick" })).toBe(true);
    expect(keepsOptionOrder({ mondai: "reading-short", image: "c".repeat(64) })).toBe(true);
    expect(keepsOptionOrder({ mondai: "kanji-reading" })).toBe(false);
  });
});
