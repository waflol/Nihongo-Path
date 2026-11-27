import { describe, expect, it } from "vitest";
import { cleanAllPages, cleanLine, cleanPage, isJunkLine, learnNoise, noiseFragments, stripNoiseFragments } from "./clean.js";

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

describe("running header with a page number", () => {
  it("is learned as noise even though the number differs per page", () => {
    const hdr = (n: number) => `Tổng hợp đề thi chính thức N3 kỳ thi năng lực tiếng Nhật các năm ${n}`;
    const pages = [1, 2, 3, 4].map((n) => `${hdr(120 + n)}\n問題${n} 本文です。`);
    const out = cleanAllPages(pages);
    expect(out.some((l) => l.includes("Tổng hợp"))).toBe(false);
    expect(out).toContain("問題1 本文です。");
  });
});

describe("a sharer's watermark woven through the text layer", () => {
  // Self-authored: a watermark split into Latin pieces, each on its own line on most pages and glued into some.
  const page = (body: string[]) => ["Group", "ữ", body[0], "i Ng", body[1], "ạ", "Ana Lee", body[2], "Học Cùng Nhau"].join("\n");
  const pages = [
    page(["問題 1 ___の言葉の読み方として最もよいものを選びなさい。", "1) 毎朝、公園を散歩します。", "Học Cùng Nhau1 さんぽ 2 さんほ 3 ざんぽ 4 ざんほ"]),
    page(["2) 雨が降っています。", "1 あめ i Ng2 あま 3 う 4 ゆ", "時間がありGroupます。"]),
    page(["3) 山に登る。", "1 のぼる 2 のこる 3 のせる 4 のびる", "4) 川で泳ぐ。"]),
  ];

  it("drops Vietnamese-only lines and strips the pieces glued into exam lines", () => {
    const noise = learnNoise(pages);
    const frags = noiseFragments(noise);
    expect(frags).toEqual(expect.arrayContaining(["Học Cùng Nhau", "Ana Lee", "Group", "i Ng"]));
    expect(stripNoiseFragments("Học Cùng Nhau1 さんぽ 2 さんほ", frags)).toBe("1 さんぽ 2 さんほ");
    expect(stripNoiseFragments("1 あめ i Ng2 あま 3 う 4 ゆ", frags)).toBe("1 あめ 2 あま 3 う 4 ゆ");
    expect(stripNoiseFragments("時間がありGroupます。", frags)).toBe("時間があります。");
    expect(stripNoiseFragments("1 栄養Group2 資源", frags)).toBe("1 栄養 2 資源");
    expect(stripNoiseFragments("Eメール Groupware の設定", frags)).toBe("Eメール Groupware の設定"); // part of a word: kept
    const all = cleanAllPages(pages).join("\n");
    expect(all).not.toMatch(/Group|i Ng|ữ|ạ|Ana Lee|Học/);
    expect(isJunkLine("Tài liệu được chia sẻ bởi nhóm học tiếng Nhật")).toBe(true);
    expect(isJunkLine("Facebook: 日本語の勉強")).toBe(false);
  });

  it("reads 間題 as 問題 at the head of a line", () => {
    expect(cleanLine("間題 3（ ）に入れるのに最もよいもの")).toBe("問題 3( )に入れるのに最もよいもの");
    expect(cleanLine("時間題がある")).toBe("時間題がある");
  });
});
