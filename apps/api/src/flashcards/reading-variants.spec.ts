import { describe, expect, it } from "vitest";
import { readingVariants } from "./reading.service.js";

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
