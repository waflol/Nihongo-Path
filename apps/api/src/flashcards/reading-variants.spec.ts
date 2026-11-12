import { describe, expect, it } from "vitest";
import { readingVariants, splitStrayReading } from "./reading.service.js";

describe("readingVariants", () => {
  it("strips the brackets a book puts around a reading", () => {
    expect(readingVariants("【かくべつ】")).toEqual(["かくべつ"]);
    expect(readingVariants("（かくべつ）")).toEqual(["かくべつ"]);
    expect(readingVariants("[かくべつ]")).toEqual(["かくべつ"]);
  });

  it("splits several readings on / ／ 、 and whitespace", () => {
    expect(readingVariants("げんぞん/げんそん")).toEqual(["げんぞん", "げんそん"]);
    expect(readingVariants("しんちゅう／しんじゅう")).toEqual(["しんちゅう", "しんじゅう"]);
    expect(readingVariants("【しんちゅう】、【しんじゅう】")).toEqual(["しんちゅう", "しんじゅう"]);
  });

  it("splits on a hyphen between readings", () => {
    expect(readingVariants("そくせき-あしあと")).toEqual(["そくせき", "あしあと"]);
  });

  it("folds katakana into hiragana and removes duplicates", () => {
    expect(readingVariants("カクベツ")).toEqual(["かくべつ"]);
    expect(readingVariants("よろん/ヨロン")).toEqual(["よろん"]);
  });

  it("keeps a plain reading untouched and returns [] for nothing usable", () => {
    expect(readingVariants("よろん")).toEqual(["よろん"]);
    expect(readingVariants("")).toEqual([]);
    expect(readingVariants(undefined)).toEqual([]);
    expect(readingVariants("【】")).toEqual([]);
  });
});

describe("splitStrayReading", () => {
  it("takes out Vietnamese words that slipped into the reading", () => {
    expect(splitStrayReading("chãi, ổn ちゃくちゃく")).toEqual({ kana: "ちゃくちゃく", stray: "chãi, ổn" });
    expect(splitStrayReading("loay hoay, まごまご")).toEqual({ kana: "まごまご", stray: "loay hoay," });
    expect(splitStrayReading("có gì) また")).toEqual({ kana: "また", stray: "có gì)" });
    expect(splitStrayReading("bị sa リストラ")).toEqual({ kana: "リストラ", stray: "bị sa" });
    expect(splitStrayReading("ổnちゃくちゃく")).toEqual({ kana: "ちゃくちゃく", stray: "ổn" });
  });

  it("leaves a clean reading alone", () => {
    expect(splitStrayReading("げんぞん/げんそん")).toEqual({ kana: "げんぞん/げんそん", stray: "" });
    expect(splitStrayReading("【かくべつ】")).toEqual({ kana: "【かくべつ】", stray: "" });
    expect(splitStrayReading("")).toEqual({ kana: "", stray: "" });
  });

  it("keeps nothing when the whole cell is Vietnamese", () => {
    expect(splitStrayReading("vững chãi")).toEqual({ kana: "", stray: "vững chãi" });
  });
});
