import { describe, expect, it } from "vitest";
import { kanjiElements, lookalikeKanji, lookalikeMap, lookalikeWords } from "./kanji-lookalikes.js";

const LEVEL = [..."意億憶臆音暗図回国地図向気見味識的合大切食飲"];
const kanji = (w: string) => [...w].filter((c) => /\p{Script=Han}/u.test(c)).length;

describe("kanji look-alikes from KRADFILE", () => {
  it("reads the elements of a kanji", () => {
    expect(kanjiElements("意")).toEqual(["音", "心", "日", "立"]);
    expect(kanjiElements("x")).toEqual([]);
  });

  it("puts kanji built on the same elements first: 意 → 億 憶 臆", () => {
    expect(lookalikeKanji("意", LEVEL, 3).sort()).toEqual(["億", "憶", "臆"]);
  });

  it("only offers kanji from the candidate list, never the kanji itself", () => {
    const alts = lookalikeKanji("意", [..."意億"], 5);
    expect(alts).toEqual(["億"]);
  });

  it("skips kanji that share a single stray element", () => {
    expect(lookalikeKanji("大", [..."食飲"], 3)).toEqual([]);
  });

  it("builds wrong spellings with the same kanji count", () => {
    const word = "意図";
    const wrong = lookalikeWords(word, lookalikeMap(word, LEVEL), 3);
    expect(wrong).toHaveLength(3);
    expect(wrong.some((w) => w.startsWith("億") || w.startsWith("憶") || w.startsWith("臆"))).toBe(true);
    for (const w of wrong) {
      expect(w).not.toBe(word);
      expect(kanji(w)).toBe(kanji(word));
    }
  });

  it("keeps okurigana when swapping kanji", () => {
    const wrong = lookalikeWords("食べる", { 食: ["飲"] }, 3);
    expect(wrong).toEqual(["飲べる"]);
  });
});
