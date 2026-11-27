import { describe, it, expect } from "vitest";
import { cardKindToPillar, pillarToCardKinds } from "../flashcards/schemas/card.schema.js";

describe("Pillar mapping", () => {
  it("maps card kinds to their respective pillars", () => {
    expect(cardKindToPillar("VOCABULARY")).toBe("vocab");
    expect(cardKindToPillar("CUSTOM")).toBe("vocab");
    expect(cardKindToPillar("GRAMMAR")).toBe("grammar");
    expect(cardKindToPillar("KANJI")).toBe("kanji");
    expect(cardKindToPillar(undefined)).toBe("vocab");
  });

  it("maps pillars to card kinds for isolated quota queries", () => {
    expect(pillarToCardKinds("vocab")).toEqual(["VOCABULARY", "CUSTOM"]);
    expect(pillarToCardKinds("grammar")).toEqual(["GRAMMAR"]);
    expect(pillarToCardKinds("kanji")).toEqual(["KANJI"]);
  });
});
