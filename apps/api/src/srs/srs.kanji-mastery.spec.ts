import { describe, it, expect, vi } from "vitest";
import { Types } from "mongoose";
import { SrsService } from "./srs.service.js";

const q = (value: unknown) => {
  const chain = { lean: () => chain, exec: () => Promise.resolve(value) };
  return chain;
};

describe("kanjiMastery", () => {
  it("keys the caller's kanji cards by character, the latest review winning", async () => {
    const [older, newer, vocab] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    const sub = new Types.ObjectId();
    // Rows arrive oldest review first (the pipeline sorts them).
    const progress = {
      aggregate: vi.fn((_pipeline: unknown[]) =>
        q([
          { card: older, level: "hard" },
          { card: vocab, level: "known" },
          { card: newer, level: "young" },
        ]),
      ),
    };
    // The card query keeps KANJI cards only, so the vocabulary card is absent.
    const card = { find: vi.fn(() => q([{ _id: newer, front: "一" }, { _id: older, front: "一" }])) };
    const service = Object.assign(Object.create(SrsService.prototype) as SrsService, { progress, card });

    expect(await service.kanjiMastery({ sub: sub.toString() } as never)).toEqual({ 一: "young" });
    expect(progress.aggregate.mock.calls[0][0].slice(0, 2)).toEqual([
      { $match: { user: sub } },
      { $sort: { lastReviewedAtMs: 1 } },
    ]);
    expect(card.find).toHaveBeenCalledWith(expect.objectContaining({ kind: "KANJI" }), { front: 1 });
  });
});
