import { describe, expect, it } from "vitest";
import { isHiraganaWord, isKatakanaWord, normalizeWord, stripNa, stripNaReading, toHiragana, toKatakana } from "./normalize-word.js";

describe("normalizeWord", () => {
  it("removes spaces between Japanese characters", () => {
    expect(normalizeWord("人 見 知 り")).toBe("人見知り");
    expect(normalizeWord("会う　（ 人 ）")).toBe("会う（人）");
    expect(normalizeWord("会う (人)")).toBe("会う(人)");
    expect(normalizeWord(" 食べ 物 ")).toBe("食べ物");
  });
  it("keeps spaces between Latin words", () => {
    expect(normalizeWord("a  lot")).toBe("a lot");
    expect(normalizeWord("T シャツ")).toBe("T シャツ");
  });
});

describe("stripNa", () => {
  it("drops the な of a な-adjective", () => {
    expect(stripNa("静かな")).toBe("静か");
    expect(stripNa("静か（な）")).toBe("静か");
    expect(stripNa("静か")).toBe("静か");
    expect(stripNa("な")).toBe("な");
  });
});

describe("stripNaReading", () => {
  it("drops the な of a reading", () => {
    expect(stripNaReading("フレッシュな")).toBe("フレッシュ");
    expect(stripNaReading("しずかな/しづかな")).toBe("しずか/しづか");
    expect(stripNaReading("な")).toBe("な");
  });
});

describe("katakana", () => {
  it("detects katakana words and converts hiragana", () => {
    expect(isKatakanaWord("ラッキー")).toBe(true);
    expect(isKatakanaWord("静か")).toBe(false);
    expect(toKatakana("らっきー")).toBe("ラッキー");
  });
});

describe("hiragana", () => {
  it("detects hiragana words and converts katakana", () => {
    expect(isHiraganaWord("きれい")).toBe(true);
    expect(isHiraganaWord("ラッキー")).toBe(false);
    expect(isHiraganaWord("綺麗")).toBe(false);
    expect(toHiragana("キレイ")).toBe("きれい");
  });
});
