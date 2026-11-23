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
