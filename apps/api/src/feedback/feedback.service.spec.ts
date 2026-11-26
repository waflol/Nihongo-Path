import { describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { FeedbackService } from "./feedback.service.js";

const caller = { sub: new Types.ObjectId().toString(), role: "USER", lang: "vi" };
const admin = { sub: new Types.ObjectId().toString(), role: "SUPER_ADMIN", lang: "vi" };

/** In-memory model so the service's reads see its own writes. */
function model(count = 0) {
  const docs = new Map<string, Record<string, unknown> & { _id: unknown; history: unknown[] }>();
  const create = vi.fn(async (d: Record<string, unknown>) => {
    const doc: Record<string, unknown> & { _id: unknown; history: unknown[] } = {
      _id: new Types.ObjectId(),
      status: "OPEN",
      history: [],
      ...d,
    };
    docs.set(String(doc._id), doc);
    return doc;
  });
  const findById = vi.fn((id: string) => ({
    exec: async () => {
      const doc = docs.get(id);
      return doc ? ({ ...doc, save: async () => {} } as never) : null;
    },
  }));
  return { docs, create, findById, count: vi.fn(async () => count) };
}

function build(count = 0) {
  const m = model(count);
  const svc = new FeedbackService({
    create: m.create,
    countDocuments: m.count,
    findById: m.findById,
  } as never);
  return { svc, m };
}

describe("FeedbackService (P5-FEEDBACK-01/02)", () => {
  it("creates a feedback row (status OPEN) and returns its id", async () => {
    const { svc, m } = build();
    const res = await svc.create(caller, { source: "transcript", message: "Phiên âm bị sai ở câu 3" });
    expect(res.id).toHaveLength(24);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: "transcript", message: "Phiên âm bị sai ở câu 3" }),
    );
    const doc = m.docs.get(res.id);
    expect(doc?.status).toBe("OPEN");
    expect(Array.isArray(doc?.history)).toBe(true);
  });

  it("rejects an unknown source and an empty message", async () => {
    const { svc } = build();
    await expect(svc.create(caller, { source: "nope", message: "x" })).rejects.toThrow(/không hợp lệ/);
    await expect(svc.create(caller, { source: "general", message: "   " })).rejects.toThrow(/nội dung/);
  });

  it("enforces the daily anti-spam limit", async () => {
    const { svc } = build(30);
    await expect(svc.create(caller, { message: "lần nữa" })).rejects.toThrow(/quá nhiều/);
  });

  it("admin status change appends a history entry (from → to, by, when)", async () => {
    const { svc, m } = build();
    const { id } = await svc.create(caller, { source: "vocabulary", message: "từ này thiếu cách đọc" });
    const out = await svc.adminSetStatus(admin, id, "IN_PROGRESS", "Đang kiểm tra");
    expect(out.status).toBe("IN_PROGRESS");
    expect(out.history).toBe(1);
    const h = m.docs.get(id)?.history?.[0] as { to: string; from?: string; by: unknown; note?: string; at: unknown } | undefined;
    expect(h).toMatchObject({ to: "IN_PROGRESS", from: "OPEN", note: "Đang kiểm tra" });
    expect(String(h?.by)).toBe(admin.sub);
    expect(h?.at instanceof Date).toBe(true);
  });

  it("a no-op transition (same status) records with no `from`", async () => {
    const { svc, m } = build();
    const { id } = await svc.create(caller, { source: "general", message: "gợi ý tính năng" });
    await svc.adminSetStatus(admin, id, "OPEN");
    const h = m.docs.get(id)?.history?.[0] as Record<string, unknown> | undefined;
    expect(h?.to).toBe("OPEN");
    expect(h?.from).toBeUndefined();
  });

  it("refuses an invalid status and a missing document", async () => {
    const { svc } = build();
    const { id } = await svc.create(caller, { message: "abc" });
    await expect(svc.adminSetStatus(admin, id, "BANANAS")).rejects.toThrow(/Trạng thái/);
    await expect(svc.adminSetStatus(admin, new Types.ObjectId().toString(), "RESOLVED")).rejects.toThrow(
      /không tồn tại/,
    );
  });
});

describe("FeedbackService.adminList counts", () => {
  it("returns a per-status count under the source filter, zero-filled", async () => {
    const chain = { sort: () => chain, skip: () => chain, limit: () => chain, populate: () => chain, lean: async () => [] };
    const aggregate = vi.fn(async () => [
      { _id: "OPEN", n: 3 },
      { _id: "RESOLVED", n: 1 },
    ]);
    const svc = new FeedbackService({ find: () => chain, countDocuments: async () => 3, aggregate } as never);
    const res = await svc.adminList({ status: "OPEN", source: "exam" });
    expect(res.counts).toEqual({ OPEN: 3, IN_PROGRESS: 0, RESOLVED: 1, REJECTED: 0 });
    // Counts ignore the status filter (all tabs), keep the source filter.
    expect(aggregate).toHaveBeenCalledWith([{ $match: { source: "exam" } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  });
});

describe("FeedbackService.shapeMine (learner thread view)", () => {
  it("returns the processing timeline with notes but without the admin's identity", () => {
    const at = new Date("2026-11-26T10:00:00Z");
    const out = FeedbackService.shapeMine({
      _id: new Types.ObjectId(),
      source: "vocabulary",
      targetId: "card-1",
      context: "Thẻ: 猫 — con mèo",
      message: "[Cách đọc sai] ねご",
      status: "RESOLVED",
      user: new Types.ObjectId(),
      history: [
        { to: "IN_PROGRESS", from: "OPEN", by: new Types.ObjectId(), at },
        { to: "RESOLVED", from: "IN_PROGRESS", by: new Types.ObjectId(), note: "Đã sửa thành ねこ", at },
      ],
    });
    expect(out.history).toEqual([
      { from: "OPEN", to: "IN_PROGRESS", note: null, at },
      { from: "IN_PROGRESS", to: "RESOLVED", note: "Đã sửa thành ねこ", at },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/"by"|"user"|reporter/);
    expect(out).toMatchObject({ targetId: "card-1", context: "Thẻ: 猫 — con mèo", status: "RESOLVED" });
  });
});

describe("FeedbackService.resolveTargets (inbox deep link)", () => {
  const q = (rows: unknown[]) => ({ select: () => ({ lean: () => ({ exec: async () => rows }) }) });

  it("maps a card id to its card + deck, skipping unknown and non-ObjectId targets", async () => {
    const cardId = new Types.ObjectId();
    const deckId = new Types.ObjectId();
    const cards = { find: vi.fn(() => q([{ _id: cardId, deck: deckId, front: "猫" }])) };
    const decks = { find: vi.fn(() => q([{ _id: deckId, title: "JLPT N5", shared: true }])) };
    const svc = new FeedbackService({} as never, cards as never, decks as never);
    const out = await svc.resolveTargets([String(cardId), "not-an-id", null, String(new Types.ObjectId())]);
    expect(out.size).toBe(1);
    expect(out.get(String(cardId))).toEqual({
      kind: "card",
      cardId: String(cardId),
      front: "猫",
      deckId: String(deckId),
      deckTitle: "JLPT N5",
      shared: true,
    });
  });

  it("makes no query when there is nothing resolvable", async () => {
    const cards = { find: vi.fn() };
    const svc = new FeedbackService({} as never, cards as never, { find: vi.fn() } as never);
    expect((await svc.resolveTargets([null, "x"])).size).toBe(0);
    expect(cards.find).not.toHaveBeenCalled();
  });
});
