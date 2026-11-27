import { describe, it, expect, vi } from "vitest";
import { Types } from "mongoose";
import { SrsService } from "./srs.service.js";

const q = (value: unknown) => {
  const chain = { lean: () => chain, exec: () => Promise.resolve(value) };
  return chain;
};

function setup() {
  const learned = new Types.ObjectId();
  const kanjiDeck = new Types.ObjectId();
  const progress = {
    find: vi.fn(() => q([{ card: learned }])),
    aggregate: vi.fn((_pipeline: unknown[]) => q([])),
  };
  const card = {
    find: vi.fn(() => q([{ _id: learned }])),
    countDocuments: vi.fn(() => q(7)),
    distinct: vi.fn(() => q([kanjiDeck])),
  };
  const deck = { find: vi.fn(() => q([{ _id: kanjiDeck }])) };
  const session = { find: vi.fn(() => q([])), aggregate: vi.fn((_pipeline: unknown[]) => q([])) };
  const user = { findById: vi.fn(() => q({ newCardsPerDayByPillar: { vocab: 20, grammar: 5, kanji: 9 } })) };
  const service = Object.assign(Object.create(SrsService.prototype) as SrsService, {
    progress,
    card,
    deck,
    session,
    user,
    resolveTimezone: () => Promise.resolve("Asia/Ho_Chi_Minh"),
  });
  return { service, progress, card, session, learned, kanjiDeck };
}

const caller = { sub: new Types.ObjectId().toString() } as never;

describe("masteryStats by pillar", () => {
  it("narrows cards, progress, sessions and the daily limit to the pillar", async () => {
    const { service, progress, card, session, learned, kanjiDeck } = setup();
    const out = await service.masteryStats(caller, undefined, "all", 0, "kanji");

    expect(card.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ kind: { $in: ["KANJI"] } }));
    expect(progress.aggregate.mock.calls[0][0][0]).toMatchObject({ $match: { card: { $in: [learned] } } });
    expect(session.aggregate.mock.calls[0][0][0]).toMatchObject({ $match: { deck: { $in: [kanjiDeck] } } });
    expect(out.total).toBe(7);
    expect(out.newPerDay).toBe(9);
  });

  it("keeps every pillar together when none is given", async () => {
    const { service, progress, card, session } = setup();
    const out = await service.masteryStats(caller, undefined, "week");

    expect(card.distinct).not.toHaveBeenCalled();
    expect(progress.find).not.toHaveBeenCalled();
    expect(session.find).toHaveBeenCalledWith(expect.not.objectContaining({ deck: expect.anything() }));
    expect(out.newPerDay).toBe(20);
  });
});
