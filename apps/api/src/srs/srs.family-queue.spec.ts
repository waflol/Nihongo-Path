import { describe, it, expect, vi } from "vitest";
import { Types } from "mongoose";
import { SrsService } from "./srs.service.js";

const q = (value: unknown) => {
  const chain = { select: () => chain, sort: () => chain, lean: () => chain, exec: () => Promise.resolve(value) };
  return chain;
};

function setup() {
  // The cards come back in database order, not family order.
  const rows = [..."魂会伝雲"].map((front) => ({ _id: new Types.ObjectId(), front, back: front, kind: "KANJI" }));
  const card = { find: vi.fn(() => q(rows)) };
  const deck = { find: vi.fn(() => q([{ _id: new Types.ObjectId() }])) };
  const progress = { find: vi.fn(() => q([])), countDocuments: vi.fn(() => Promise.resolve(0)) };
  const user = { findById: vi.fn(() => q({ newCardsPerDayByPillar: { kanji: 3 } })) };
  const service = Object.assign(Object.create(SrsService.prototype) as SrsService, {
    card,
    deck,
    progress,
    user,
    grammar: {},
  });
  const caller = { sub: new Types.ObjectId().toString() } as never;
  return { service, caller };
}

describe("family study queue", () => {
  it("serves new kanji in family order, up to the kanji daily limit", async () => {
    const { service, caller } = setup();
    const queue = await service.getQueue(caller, "families", "UTC", 20, "learn", "KANJI", undefined, undefined, "云");
    expect(queue.newCards.map((c) => c.front)).toEqual(["会", "雲", "伝"]);
    expect(queue.newPerDay).toBe(3);
    expect(queue.total).toBe(4);
  });

  it("rejects an unknown family", async () => {
    const { service, caller } = setup();
    await expect(
      service.getQueue(caller, "families", "UTC", 20, "learn", "KANJI", undefined, undefined, "x"),
    ).rejects.toThrow("Family not found");
  });
});
