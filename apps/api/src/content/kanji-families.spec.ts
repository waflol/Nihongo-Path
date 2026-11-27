import { describe, it, expect } from "vitest";
import { familyStudyOrder, kanjiFamilies } from "./kanji-families.js";

describe("kanji families", () => {
  it("has every family of the source list, with unique components", () => {
    const families = kanjiFamilies();
    expect(families).toHaveLength(382);
    expect(new Set(families.map((f) => f.head)).size).toBe(382);
    expect(families.every((f) => f.chars.length >= 3)).toBe(true);
    expect(new Set(families.flatMap((f) => f.chars)).size).toBe(1702);
  });

  it("returns one family's characters in order", () => {
    expect(familyStudyOrder("云")).toEqual([..."会雲伝芸転魂"]);
    expect(familyStudyOrder("không có")).toEqual([]);
  });

  it("walks all families without repeating a character", () => {
    const all = familyStudyOrder("all");
    expect(all).toHaveLength(1702);
    expect(all.slice(0, 3)).toEqual([..."匂渇掲"]);
  });
});
