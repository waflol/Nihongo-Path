import { describe, expect, it } from "vitest";
import { cleanAllPages, cleanPage, isJunkLine, learnNoise } from "./clean.js";

/**
 * NP-407: page-text cleaning. Repeated noise (a source's watermark printed on
 * ≥ 30% of pages) is dropped by FREQUENCY, not a blacklist, so a brand-new
 * source's footer is caught without hard-coding it. A broken CJK line is
 * re-joined onto the one before it.
 */

describe("isJunkLine", () => {
  it("drops URLs / mailto / bare-domain lines", () => {
    expect(isJunkLine("https://example.com/x")).toBe(true);
    expect(isJunkLine("mailto:a@b.c")).toBe(true);
    expect(isJunkLine("www.example.jp")).toBe(true);
    expect(isJunkLine("（ ）に入れるのに最もよいもの")).toBe(false);
  });
});

describe("learnNoise", () => {
  it("keeps a line that appears on ≥30% of pages", () => {
    const pages = [
      "Facebook: X\n次の漢字の読み方",
      "Facebook: X\n問題1",
      "Facebook: X\n答え ①",
      "Facebook: X\n問題2",
      "別ページ\n問題3", // only 4/5 have the watermark → still ≥30%
    ];
    const noise = learnNoise(pages);
    expect(noise.has("Facebook: X")).toBe(true);
    // A line that appears once is NOT noise.
    expect(noise.has("別ページ")).toBe(false);
  });

  it("ignores junk lines when counting frequency", () => {
    const pages = ["https://a.com\nx", "https://a.com\ny", "https://a.com\nz", "https://a.com\nw"];
    const noise = learnNoise(pages);
    expect(noise.has("https://a.com")).toBe(false); // junk, not a content line
  });
});

describe("cleanPage", () => {
  const noise = new Set(["Facebook: X", "— 1 —"]);

  it("removes repeated noise + junk lines", () => {
    const out = cleanPage("Facebook: X\n問題1\n— 1 —\nhttps://x\n本文", noise);
    expect(out).toEqual(["問題1", "本文"]);
  });

  it("re-joins a sentence broken mid-line (CJK, no trailing punctuation)", () => {
    const out = cleanPage("新しい本屋には、店主が\n手書きでつけたメモがあります。", new Set());
    expect(out).toEqual(["新しい本屋には、店主が手書きでつけたメモがあります。"]);
  });

  it("does NOT join across a punctuation boundary", () => {
    const out = cleanPage("雨だから、傘を持って出て\n行った。", new Set());
    // The line ends without punctuation but the next starts lowercase CJK → join.
    expect(out).toHaveLength(1);
  });

  it("keeps a new line when the previous ended with punctuation", () => {
    const out = cleanPage("問題1。\n問題2。", new Set());
    expect(out).toHaveLength(2);
  });
});

describe("cleanAllPages", () => {
  it("cleans every page in one call, dropping cross-page repeated noise", () => {
    const pages = [
      "Footer\nA",
      "Footer\nB",
      "Footer\nC",
      "Footer\nD",
      "Other\nE",
    ];
    const out = cleanAllPages(pages);
    expect(out).toEqual(["A", "B", "C", "D", "Other", "E"]);
  });
});
