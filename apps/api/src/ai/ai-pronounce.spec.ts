import { describe, expect, it } from "vitest";
import { hiraganaToRomaji, parsePronounce, PRONOUNCE_ITEMS, scorePronounce, type PronounceAnswer } from "./ai-benchmark.js";

const good = (i: number): PronounceAnswer => ({
  reading: PRONOUNCE_ITEMS[i].reading + "。",
  romaji: hiraganaToRomaji(PRONOUNCE_ITEMS[i].reading),
  viet: "a-b-c",
  words: Array.from({ length: PRONOUNCE_ITEMS[i].minWords }, (_, k) => ({ text: "語" + k, reading: "ご", romaji: "go", accent: "" })),
  tips: [],
});

describe("pronunciation benchmark", () => {
  it("turns hiragana into Hepburn romaji", () => {
    expect(hiraganaToRomaji("ひとりずまい")).toBe("hitorizumai");
    expect(hiraganaToRomaji("ほうっておく")).toBe("houtteoku");
    expect(hiraganaToRomaji("いっしょうけんめい")).toBe("isshoukenmei");
    expect(hiraganaToRomaji("ともだち")).toBe("tomodachi");
  });

  it("parses the batched answer by id", () => {
    const m = parsePronounce('{"items":[{"id":2,"reading":"きょう","romaji":"kyō","viet":"kyo:","words":[],"tips":["x"]}]}');
    expect(m.get(2)?.reading).toBe("きょう");
    expect(m.get(2)?.tips).toEqual(["x"]);
    expect(parsePronounce("not json").size).toBe(0);
  });

  it("scores a perfect answer 100 and an unanswered set 0", () => {
    const all = new Map(PRONOUNCE_ITEMS.map((_, i) => [i + 1, good(i)] as const));
    expect(scorePronounce(all, 1000).accuracy).toBe(100);
    expect(scorePronounce(new Map(), 1000).accuracy).toBe(0);
  });

  it("accepts macron and ou spellings alike, and penalises a wrong reading", () => {
    const a = good(1);
    a.romaji = "Hōtte oku";
    expect(scorePronounce(new Map([[2, a]]), 1).details![1].romajiScore).toBe(100);
    a.reading = "ほおっておく";
    expect(scorePronounce(new Map([[2, a]]), 1).details![1].readingScore!).toBeLessThan(100);
  });
});
