import { describe, it, expect, vi } from "vitest";
import { Types } from "mongoose";
import { SystemDecksService } from "./system-decks.service.js";

const q = (value: unknown) => {
  const chain = { sort: () => chain, lean: () => Promise.resolve(value) };
  return chain;
};

type Op = { updateOne: { filter: Record<string, unknown>; update: { $setOnInsert: Record<string, unknown> } } };

describe("SystemDecksService kanji sync", () => {
  it("updates the oldest card of a kanji even after its dedupeKey was rewritten, and inserts only new ones", async () => {
    const deckId = new Types.ObjectId();
    const known = new Types.ObjectId();
    const fresh = new Types.ObjectId();
    const oldest = new Types.ObjectId();
    const bulkWrite = vi.fn((_ops: Op[]) => Promise.resolve());
    const service = new SystemDecksService(
      { findOneAndUpdate: () => q({ _id: deckId }) } as never,
      {
        find: () => q([{ _id: oldest, kanji: known }, { _id: new Types.ObjectId(), kanji: known }]),
        bulkWrite,
      } as never,
      {} as never,
      {
        find: (filter: { level: string }) =>
          q(filter.level === "N5" ? [{ _id: known, char: "一" }, { _id: fresh, char: "二" }] : []),
      } as never,
    );

    await service.syncKanjiDecks();

    const [first, second] = bulkWrite.mock.calls[0][0];
    expect(first.updateOne.filter).toEqual({ _id: oldest });
    expect(second.updateOne.filter).toEqual({ deck: deckId, dedupeKey: `kanji:${fresh}` });
    expect(second.updateOne.update.$setOnInsert).toMatchObject({ dedupeKey: `kanji:${fresh}` });
  });
});
