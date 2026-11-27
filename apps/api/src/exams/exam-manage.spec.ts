import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ExamSyncService } from "./exam-sync.service.js";
import { ExamsService, type AuthorQuestionInput } from "./exams.service.js";

type Row = Record<string, any>;

const EXAM = "e".repeat(24);
const Q1 = "1".repeat(24);
const Q2 = "2".repeat(24);
const NEW = "3".repeat(24);
const admin = { sub: "a".repeat(24), role: "ADMIN", lang: "vi" } as never;
const learner = { sub: "b".repeat(24), role: "USER", lang: "vi" } as never;

const query = <T>(value: () => T) => {
  const q = { select: () => q, lean: () => q, sort: () => q, exec: async () => value() };
  return q;
};

/** The service over one exam and a few bank rows; records what is asked and written. */
function harness(exam: Row, bank: Row[] = [{ _id: Q1, rights: "own" }, { _id: Q2, rights: "own" }]) {
  const writes: Row[] = [];
  const listed: Row[] = [];
  const authored: Row[] = [];
  const doc = { _id: EXAM, ...exam, toObject: () => ({ _id: EXAM, ...exam }) };
  const exams = {
    find: (f: Row) => (listed.push(f), query(() => [doc])),
    findById: () => query(() => doc),
    updateOne: (_f: Row, u: Row) => query(() => writes.push(u)),
  };
  const svc = Object.create(ExamsService.prototype) as ExamsService;
  Object.assign(svc as unknown as Row, {
    exams,
    bank: {
      find: (f: Row) => query(() => bank.filter((q) => f._id.$in.map(String).includes(q._id))),
      updateOne: (f: Row, u: Row) => query(() => (authored.push({ ...f, ...u.$setOnInsert }), { upsertedCount: 1 })),
      findOne: () => query(() => (bank.push({ _id: NEW, rights: authored.at(-1)!.rights }), { _id: NEW })),
    },
    attempts: { findOne: () => query(() => null) },
    examSync: new ExamSyncService({} as never, {} as never),
  });
  return { svc, writes, listed, authored };
}

const flat = { title: "Đề tay", level: "N3", status: "DRAFT", questions: [Q1, Q2], shuffle: { questions: true, options: true } };
const imported = {
  ...flat,
  origin: { key: "N3|bộ|2022-07" },
  rights: "own",
  timeLimitMin: 100,
  sections: [
    { key: "language", title: "言語知識", timeLimitMin: 30, questions: [Q1] },
    { key: "grammar-reading", title: "読解", timeLimitMin: 70, questions: [Q2] },
  ],
};
const reference = [{ _id: Q1, rights: "own" }, { _id: Q2, rights: "reference" }];

describe("rights (Q-12)", () => {
  it("refuses to publish an exam holding a reference question", async () => {
    const { svc, writes } = harness(flat, reference);
    await expect(svc.adminUpdateExam(admin, EXAM, { status: "PUBLISHED" })).rejects.toThrow(/reference/);
    expect(writes).toEqual([]);
  });

  it("publishes an own exam and stores its rights", async () => {
    const { svc, writes } = harness(flat);
    await svc.adminUpdateExam(admin, EXAM, { status: "PUBLISHED" });
    expect(writes[0].$set).toMatchObject({ status: "PUBLISHED", rights: "own" });
  });

  it("leaves an exam that turned reference editable", async () => {
    const { svc, writes } = harness({ ...imported, status: "PUBLISHED", rights: "reference" }, reference);
    await svc.adminUpdateExam(admin, EXAM, { title: "Tên mới" });
    await svc.adminUpdateExam(admin, EXAM, { status: "DRAFT" });
    expect(writes).toHaveLength(2);
  });

  it("never lists reference exams for learners, and filters by kind", async () => {
    const { svc, listed } = harness(flat);
    await svc.listExams({ kind: "full" });
    expect(listed[0]).toEqual({ status: "PUBLISHED", rights: { $ne: "reference" }, kind: "full" });
  });

  it("will not start a reference or draft exam for a learner, but will for an admin", async () => {
    for (const over of [{ status: "PUBLISHED", rights: "reference" }, { status: "DRAFT" }]) {
      const { svc } = harness({ ...flat, ...over, questions: [] });
      await expect(svc.start(learner, EXAM)).rejects.toThrow(NotFoundException);
      // Past the gate: an empty exam is then refused for being empty.
      await expect(svc.start(admin, EXAM)).rejects.toThrow(BadRequestException);
    }
  });
});

describe("editing an imported exam", () => {
  it("refuses another question list, level or whole-exam time", async () => {
    const { svc, writes } = harness(imported);
    for (const patch of [{ questionIds: [Q2, Q1] }, { questionIds: [Q1] }, { level: "N2" }, { timeLimitMin: 5 }, { clearTimeLimit: true }]) {
      await expect(svc.adminUpdateExam(admin, EXAM, patch)).rejects.toThrow(BadRequestException);
    }
    expect(writes).toEqual([]);
  });

  it("accepts a save that repeats what is there, without rewriting the list", async () => {
    const { svc, writes } = harness(imported);
    await svc.adminUpdateExam(admin, EXAM, { title: "T", questionIds: [Q1, Q2], level: "N3", timeLimitMin: 100 });
    expect(Object.keys(writes[0].$set)).not.toContain("questions");
    expect(Object.keys(writes[0].$set)).not.toContain("timeLimitMin");
  });

  it("locks a section time set by hand and totals the parts", async () => {
    const { svc, writes } = harness(imported);
    await svc.adminUpdateExam(admin, EXAM, { sectionTimes: { language: 45 } });
    expect(writes[0].$set.timeLimitMin).toBe(115);
    expect(writes[0].$set.sections.map((s: Row) => [s.timeLimitMin, !!s.timeLocked])).toEqual([[45, true], [70, false]]);
  });

  it("refuses an unknown part or a bad time", async () => {
    const { svc } = harness(imported);
    const bad: Record<string, number>[] = [{ nope: 10 }, { language: 0 }, { language: 1.5 }, { language: "30" as never }];
    for (const sectionTimes of bad) {
      await expect(svc.adminUpdateExam(admin, EXAM, { sectionTimes })).rejects.toThrow(BadRequestException);
    }
  });

  it("still lets a hand-composed exam drop its time limit", async () => {
    const { svc, writes } = harness({ ...flat, timeLimitMin: 20 });
    await svc.adminUpdateExam(admin, EXAM, { clearTimeLimit: true });
    expect(writes[0].$unset).toEqual({ timeLimitMin: 1 });
    expect(writes[0].$set).not.toHaveProperty("timeLimitMin");
  });
});

describe("writing a question inside an exam", () => {
  const input: AuthorQuestionInput = { kind: "grammar-form", prompt: "毎朝（　）散歩します。", options: ["に", "を", "で", "へ"], answer: "を", level: "N1" };

  it("gives each exam its own row at the exam's level, and appends it", async () => {
    const one = harness(flat);
    await one.svc.adminAddQuestion(admin, EXAM, input);
    expect(one.authored[0]).toMatchObject({ level: "N3", rights: "own" });
    expect(one.writes[0]).toMatchObject({ $set: { rights: "own" } });
    expect(String(one.writes[0].$addToSet.questions)).toBe(NEW);
    const two = harness(flat);
    await two.svc.adminAddQuestion(admin, "f".repeat(24), input);
    expect(two.authored[0].dedupeKey).not.toBe(one.authored[0].dedupeKey);
    expect(two.authored[0].contentHash).not.toBe(one.authored[0].contentHash);
  });

  it("refuses an imported exam, and a reference question on a published one", async () => {
    await expect(harness(imported).svc.adminAddQuestion(admin, EXAM, input)).rejects.toThrow(/bản nháp/);
    const live = harness({ ...flat, status: "PUBLISHED" });
    await expect(live.svc.adminAddQuestion(admin, EXAM, { ...input, rights: "reference" })).rejects.toThrow(/reference/);
    expect(live.authored).toEqual([]);
  });
});
