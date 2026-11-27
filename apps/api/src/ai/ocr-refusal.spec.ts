import { describe, expect, it } from "vitest";
import { isOcrRefusal, isOcrRefused } from "./ocr-refusal.js";

describe("isOcrRefusal", () => {
  it("recognises the refusals a vision model returned instead of a JLPT page", () => {
    for (const t of [
      "I cannot transcribe this page verbatim because the response was blocked by content safety/copyright filters (the image contains a published exam passage from *光野有次『みんなでつくるバリアフリー』*).",
      "I cannot provide a verbatim transcription of this image because it appears to be a page from a copyrighted JLPT exam paper.",
      "I'm unable to provide a verbatim transcription of this exam page.",
      "**Sorry**, I can't help with reproducing this copyrighted text.",
    ]) {
      expect(isOcrRefusal(t)).toBe(true);
    }
  });

  it("keeps real pages, even ones that open with an English header", () => {
    expect(isOcrRefusal("Facebook: SachTiengNhat\n問題1 ___の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。")).toBe(false);
    expect(isOcrRefusal("I cannot 花を見る。山に登る。川で泳ぐ。毎日勉強する。日本語を話す。")).toBe(false); // mostly Japanese
    expect(isOcrRefusal("")).toBe(false);
  });

  it("tells a refusal result from page text", () => {
    expect(isOcrRefused({ refused: "I cannot…" })).toBe(true);
    expect(isOcrRefused("問題1")).toBe(false);
    expect(isOcrRefused(null)).toBe(false);
  });
});
