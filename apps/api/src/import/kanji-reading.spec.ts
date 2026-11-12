import { beforeAll, describe, expect, it } from "vitest";
import { readingFitsKanji, setKanjiReadings } from "./kanji-reading.js";

beforeAll(() =>
  setKanjiReadings([
    { char: "学", onyomi: ["ガク"], kunyomi: ["まな.ぶ"] },
    { char: "校", onyomi: ["コウ"], kunyomi: [] },
    { char: "食", onyomi: ["ショク"], kunyomi: ["く.う", "た.べる"] },
    { char: "人", onyomi: ["ジン", "ニン"], kunyomi: ["ひと"] },
    { char: "日", onyomi: ["ニチ", "ジツ"], kunyomi: ["ひ", "か"] },
    { char: "本", onyomi: ["ホン"], kunyomi: ["もと"] },
    { char: "出", onyomi: ["シュツ"], kunyomi: ["で.る", "だ.す"] },
    { char: "発", onyomi: ["ハツ", "ホツ"], kunyomi: [] },
    { char: "着", onyomi: ["チャク", "ジャク"], kunyomi: ["き.る", "つ.く"] },
    { char: "近", onyomi: ["キン"], kunyomi: ["ちか.い"] },
  ]),
);

describe("readingFitsKanji", () => {
  it("accepts on/kun combinations and okurigana", () => {
    expect(readingFitsKanji("学校", "がっこう")).toBe(true);
    expect(readingFitsKanji("食べる", "たべる")).toBe(true);
    expect(readingFitsKanji("学ぶ", "まなぶ")).toBe(true);
  });
  it("allows rendaku and gemination", () => {
    expect(readingFitsKanji("日本", "にほん")).toBe(true);
    expect(readingFitsKanji("日本人", "にほんじん")).toBe(true);
    expect(readingFitsKanji("出発", "しゅっぱつ")).toBe(true);
  });
  it("rejects what the table cannot build", () => {
    expect(readingFitsKanji("学校", "がくせい")).toBe(false);
    expect(readingFitsKanji("学校", "")).toBe(false);
    expect(readingFitsKanji("未知", "みち")).toBe(false); // kanji absent from the table
    expect(readingFitsKanji("がくせい", "がくせい")).toBe(false); // no kanji: nothing to check
  });

  it("reads 々 as a repeat of the kanji before it", () => {
    expect(readingFitsKanji("着々", "ちゃくちゃく")).toBe(true);
    expect(readingFitsKanji("人々", "ひとびと")).toBe(true); // rendaku on the repeat
    expect(readingFitsKanji("近々", "ちかぢか")).toBe(true);
    // 々 may not take ANOTHER reading of the kanji before it
    expect(readingFitsKanji("着々", "きちゃく")).toBe(false);
    expect(readingFitsKanji("着々", "ちゃくつ")).toBe(false);
  });

  it("ignores a ［と］ note after the word", () => {
    expect(readingFitsKanji("着々［と］", "ちゃくちゃく")).toBe(true);
  });
});
