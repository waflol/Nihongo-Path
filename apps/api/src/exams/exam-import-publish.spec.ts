import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { ExamImportService } from "./exam-import.service.js";
import { ExamSyncService } from "./exam-sync.service.js";
import { segmentBlocks } from "./import/segment.js";

type Row = Record<string, any>;

const get = (row: Row, path: string) => path.split(".").reduce<any>((v, k) => v?.[k], row);
const put = (row: Row, path: string, value: unknown) => {
  const keys = path.split(".");
  const last = keys.pop()!;
  keys.reduce<Row>((v, k) => (v[k] ??= {}), row)[last] = value;
};
const matches = (row: Row, filter: Row) =>
  Object.entries(filter).every(([k, v]) => {
    const have = get(row, k);
    if (v && typeof v === "object" && "$in" in v) return v.$in.map(String).includes(String(have));
    if (v && typeof v === "object" && "$ne" in v) return have !== v.$ne;
    return String(have) === String(v);
  });
const query = <T>(value: () => T) => {
  const q = { select: () => q, lean: () => q, sort: () => q, exec: async () => value() };
  return q;
};

/** The few model calls publishing makes, over an array. */
function table(name: string) {
  const rows: Row[] = [];
  let ids = 0;
  const insert = (data: Row) => {
    const row: Row = { _id: (++ids).toString(16).padStart(24, name), ...data };
    row.save = async () => row;
    row.markModified = () => undefined;
    rows.push(row);
    return row;
  };
  const upsert = (filter: Row, update: Row, options?: Row) => {
    let row = rows.find((r) => matches(r, filter));
    const fresh = !row;
    if (!row) {
      if (!options?.upsert) return null;
      row = insert({});
      for (const [k, v] of Object.entries(filter)) put(row, k, v);
    }
    if (fresh) for (const [k, v] of Object.entries(update.$setOnInsert ?? {})) put(row, k, v);
    for (const [k, v] of Object.entries(update.$set ?? {})) put(row, k, v);
    return row;
  };
  return {
    rows,
    insert,
    find: (f: Row = {}) => query(() => rows.filter((r) => matches(r, f)).sort((a, b) => (a.blockIndex ?? 0) - (b.blockIndex ?? 0))),
    findOne: (f: Row) => query(() => rows.find((r) => matches(r, f)) ?? null),
    findById: (id: string) => query(() => rows.find((r) => r._id === id) ?? null),
    exists: (f: Row) => query(() => rows.find((r) => matches(r, f)) ?? null),
    updateOne: (f: Row, u: Row, o?: Row) => query(() => upsert(f, u, o)),
    updateMany: (f: Row, u: Row) => query(() => rows.filter((r) => matches(r, f)).forEach((r) => upsert({ _id: r._id }, u))),
    findOneAndUpdate: (f: Row, u: Row, o: Row) => query(() => upsert(f, u, o)),
    deleteMany: (f: Row) =>
      query(() => {
        const gone = rows.filter((r) => matches(r, f));
        gone.forEach((r) => rows.splice(rows.indexOf(r), 1));
        return { deletedCount: gone.length };
      }),
    deleteOne: (f: Row) => query(() => rows.splice(rows.findIndex((r) => matches(r, f)), 1)),
  };
}

function world() {
  const t = { jobs: table("a"), pages: table("b"), drafts: table("c"), stimuli: table("d"), bank: table("e"), exams: table("f") };
  const svc = Object.create(ExamImportService.prototype) as ExamImportService;
  Object.assign(svc as unknown as Row, t, {
    dir: "/nonexistent-exam-import",
    examSync: new ExamSyncService(t.drafts as never, t.exams as never),
  });
  const job = (over: Row = {}) => t.jobs.insert({ user: "u", fileName: "bo-de.pdf", setName: "Bộ A", status: "done", createdAt: new Date(1000), ...over });
  const draft = (jobId: string, over: Row = {}) =>
    t.drafts.insert({
      jobId,
      file: "bo-de.pdf",
      level: "N3",
      sitting: "2022-07",
      blockIndex: 0,
      mondai: "kanji-reading",
      section: "vocab",
      status: "needs_review",
      rights: "own",
      answers: [1, 2],
      parsed: {
        stimuli: [],
        questions: [1, 2].map((no) => ({ no, prompt: `問${no}`, options: ["あ", "い", "う", "え"] })),
      },
      ...over,
    });
  return { svc, t, job, draft };
}

const caller = { sub: "u" } as never;
const ids = (v: unknown[]) => v.map(String);

describe("publishing into an exam", () => {
  it("builds one draft exam from a sitting, in printed order and unshuffled", async () => {
    const { svc, t, job, draft } = world();
    const j = job();
    draft(j._id, { blockIndex: 1, mondai: "orthography" });
    draft(j._id, { blockIndex: 0 });
    const r = await svc.publishExam(caller, j._id, "2022-07");
    expect(r).toMatchObject({ published: 2, questions: 4, skipped: [] });
    expect(t.exams.rows).toHaveLength(1);
    const exam = t.exams.rows[0];
    expect(exam).toMatchObject({ kind: "section", status: "DRAFT", level: "N3", rights: "own", shuffle: { questions: false, options: false } });
    expect(exam.origin).toMatchObject({ key: "N3|bộ a|2022-07", setName: "Bộ A", sitting: "2022-07", jobIds: [j._id] });
    const kanji = t.drafts.rows.find((d) => d.mondai === "kanji-reading")!;
    const ortho = t.drafts.rows.find((d) => d.mondai === "orthography")!;
    expect(ids(exam.questions)).toEqual(ids([...kanji.questionIds, ...ortho.questionIds]));
  });

  it("gives two papers printing the same questions their own rows, both complete", async () => {
    const { svc, t, job, draft } = world();
    const j = job();
    draft(j._id);
    draft(j._id, { sitting: "2023-07", blockIndex: 1 });
    await svc.publishExam(caller, j._id, "2022-07");
    await svc.publishExam(caller, j._id, "2023-07");
    expect(t.exams.rows.map((e) => e.questions.length)).toEqual([2, 2]);
    expect(t.bank.rows).toHaveLength(4);
    expect(new Set(t.bank.rows.map((q) => q.contentHash)).size).toBe(4);
  });

  it("changes nothing when published again, and keeps the admin's title and status", async () => {
    const { svc, t, job, draft } = world();
    const j = job();
    const d = draft(j._id);
    await svc.publish(caller, d._id);
    Object.assign(t.exams.rows[0], { title: "Tên admin đặt", status: "PUBLISHED" });
    const before = ids(t.exams.rows[0].questions);
    await svc.publish(caller, d._id, { answers: [4, 4] });
    await svc.publishExam(caller, j._id, "2022-07");
    expect(t.bank.rows.map((q) => q.answer)).toEqual(["あ", "い"]);
    expect(t.bank.rows).toHaveLength(2);
    expect(t.exams.rows).toHaveLength(1);
    expect(t.exams.rows[0]).toMatchObject({ title: "Tên admin đặt", status: "PUBLISHED" });
    expect(ids(t.exams.rows[0].questions)).toEqual(before);
  });

  it("finishes the job on a second run after a failure half-way", async () => {
    const { svc, t, job, draft } = world();
    const j = job();
    const d = draft(j._id);
    const write = t.bank.updateOne;
    let calls = 0;
    t.bank.updateOne = (...args: Parameters<typeof write>) => {
      if (++calls === 2) throw new Error("connection lost");
      return write(...args);
    };
    await expect(svc.publish(caller, d._id)).rejects.toThrow("connection lost");
    expect(d.status).toBe("needs_review");
    await svc.publish(caller, d._id);
    expect(t.bank.rows).toHaveLength(2);
    expect(t.exams.rows[0].questions).toHaveLength(2);
  });

  it("repairs the exam when only the rebuild had failed", async () => {
    const { svc, t, job, draft } = world();
    const d = draft(job()._id);
    const rebuild = t.exams.findOneAndUpdate;
    t.exams.findOneAndUpdate = () => {
      throw new Error("down");
    };
    await expect(svc.publish(caller, d._id)).rejects.toThrow("down");
    t.exams.findOneAndUpdate = rebuild;
    await svc.publish(caller, d._id);
    expect(t.exams.rows[0].questions).toHaveLength(2);
  });

  it("merges a listening file of the same set and sitting into the written exam", async () => {
    const { svc, t, job, draft } = world();
    const written = job();
    const heard = job({ fileName: "nghe.pdf", createdAt: new Date(2000) });
    const a = draft(written._id);
    const b = draft(heard._id, { mondai: "listening-task", section: "listening" });
    await svc.publish(caller, b._id);
    await svc.publish(caller, a._id);
    expect(t.exams.rows).toHaveLength(1);
    expect(t.exams.rows[0].sections.map((s: Row) => s.key)).toEqual(["language", "listening"]);
  });

  it("keeps the published part of a deleted import in the exam", async () => {
    const { svc, t, job, draft } = world();
    const first = job();
    const second = job({ createdAt: new Date(2000) });
    const a = draft(first._id);
    draft(first._id, { blockIndex: 1, mondai: "context" });
    await svc.publish(caller, a._id);
    await expect(svc.deleteJob(caller, first._id)).resolves.toMatchObject({ drafts: 1 });
    const b = draft(second._id, { mondai: "orthography" });
    await svc.publish(caller, b._id);
    expect(t.exams.rows[0].questions).toHaveLength(4);
    // The published draft of the deleted job can still repair its exam.
    await expect(svc.publish(caller, a._id)).resolves.toMatchObject({ examId: t.exams.rows[0]._id });
  });

  it("skips and reports a block that is not ready", async () => {
    const { svc, t, job, draft } = world();
    const j = job();
    draft(j._id);
    const open = draft(j._id, { blockIndex: 1, mondai: "context", answers: [1, 0] });
    const r = await svc.publishExam(caller, j._id, "2022-07");
    expect(r.skipped).toEqual([expect.objectContaining({ draftId: open._id, blockIndex: 1 })]);
    expect(open.status).toBe("needs_review");
    expect(t.exams.rows[0].questions).toHaveLength(2);
  });

  it("writes nothing for a paper with no name, or a drill book", async () => {
    const { svc, t, job, draft } = world();
    const nameless = draft(job()._id, { sitting: "unknown" });
    await expect(svc.publish(caller, nameless._id)).rejects.toThrow(/tên kỳ thi/);
    const book = draft(job({ kind: "practice" })._id);
    await expect(svc.publish(caller, book._id)).rejects.toThrow(BadRequestException);
    expect(t.bank.rows).toEqual([]);
    expect(t.exams.rows).toEqual([]);
  });

  it("refuses to discard a published block", async () => {
    const { svc, job, draft } = world();
    const d = draft(job()._id);
    await svc.publish(caller, d._id);
    await expect(svc.discard(caller, d._id)).rejects.toThrow(ConflictException);
  });
});

describe("renaming an import", () => {
  it("renames the set and swaps sitting names in one go", async () => {
    const { svc, t, job, draft } = world();
    const j = job();
    const a = draft(j._id, { sitting: "A" });
    const b = draft(j._id, { sitting: "B" });
    const r = await svc.renameJob(j._id, { setName: " Bộ mới ", sittings: [{ from: "A", to: "B" }, { from: "B", to: "A" }] });
    expect(r).toEqual({ setName: "Bộ mới", renamed: 2 });
    expect([a.sitting, b.sitting]).toEqual(["B", "A"]);
    expect(t.jobs.rows[0].setName).toBe("Bộ mới");
  });

  it("refuses bad names without writing, and any rename once something is published", async () => {
    const { svc, job, draft } = world();
    const j = job();
    const d = draft(j._id, { sitting: "unknown" });
    await expect(svc.renameJob(j._id, { sittings: [{ from: "unknown", to: "2022-07" }, { from: "x", to: "unknown" }] })).rejects.toThrow(BadRequestException);
    expect(d.sitting).toBe("unknown");
    await svc.renameJob(j._id, { sittings: [{ from: "unknown", to: "2022-07" }] });
    await svc.publish(caller, d._id);
    await expect(svc.renameJob(j._id, { setName: "khác" })).rejects.toThrow(ConflictException);
  });
});

describe("segmenting by the declared kind", () => {
  const book = [["第1回", "漢字読み", "___の言葉の読み方として最もよいものを選びなさい。", "【1】本を読む。", "1 ほん 2 もと 3 ぼん 4 ぽん", "【2】山に登る。", "1 やま 2 かわ 3 うみ 4 そら", "【3】水を飲む。", "1 みず 2 ひ 3 き 4 つち"].join("\n")];

  it("reads a drill layout as a drill book only when the file is not declared an exam", () => {
    const drill = segmentBlocks(book, "N3").blocks;
    expect(segmentBlocks(book, "N3", "practice").blocks).toEqual(drill);
    expect(segmentBlocks(book, "N3", "full").blocks).not.toEqual(drill);
    expect(segmentBlocks(book, "N3", "section").blocks).not.toEqual(drill);
  });
});
