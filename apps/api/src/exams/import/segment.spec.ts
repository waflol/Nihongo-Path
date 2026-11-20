import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { segmentBlocks } from "./segment.js";

/**
 * NP-407: block segmentation, tested on the three SELF-AUTHORED fixture
 * layouts (plan §8.1 — the repo is public, so no real exam content; the
 * fixtures mimic the official collection, a Migii model test, and a combined
 * N3 set). The official + Migii files mark page breaks with `— n —`; the
 * combined file is one page.
 */

const here = new URL(".", import.meta.url).pathname;
function pagesOf(name: string, splitOnPageBreaks: boolean): string[] {
  const text = readFileSync(`${here}__fixtures__/${name}`, "utf8");
  if (!splitOnPageBreaks) return [text];
  return text.split(/^— \d+ —\s*$/m).map((p) => p.trim()).filter(Boolean);
}

describe("segmentBlocks — official collection (one sitting across pages)", () => {
  const { blocks, answerKey } = segmentBlocks(pagesOf("official_collection.txt", true), "N3");

  it("finds the seven 問題 blocks, all under the 2010-07 sitting", () => {
    expect(blocks).toHaveLength(7);
    for (const b of blocks) expect(b.sitting).toBe("2010-07");
  });

  it("classifies the vocab forms under 文字・語彙", () => {
    expect(blocks[0].mondai).toBe("kanji-reading"); // 読み方として
    expect(blocks[1].mondai).toBe("orthography"); // 漢字で書くとき
    expect(blocks[2].mondai).toBe("context"); // （ ）に入れるのに最もよいもの
  });

  it("classifies the reading forms after the part switches to 読解", () => {
    expect(blocks[3].sectionHint).toBe("reading");
    expect(blocks[3].mondai).toBe("reading-long"); // 次の文章を読んで
    expect(blocks[4].mondai).toBe("reading-mid"); // (1)から(3)
    expect(blocks[5].mondai).toBe("reading-mid"); // (1)から(2)
    expect(blocks[6].mondai).toBe("info-retrieval"); // 次の掲示
  });

  it("keeps the answer key OUT of the blocks, mark-preserved", () => {
    expect(blocks.length).toBe(7); // the 答案 問題X lines did not open blocks
    expect(answerKey).toContain("①"); // circled marks survive the answer region
    expect(answerKey).toContain("問題Ⅰ 4x1");
    expect(answerKey).not.toMatch(/11/); // `1①` was not folded to `11`
  });

  it("drops the repeated watermark but keeps question bodies", () => {
    for (const b of blocks) expect(b.rawText).not.toContain("Facebook: SachTiengNhat");
    expect(blocks[0].rawText).toContain("毎朝、公園を散歩します。");
  });
});

describe("segmentBlocks — Migii model test (bare 問題 N: headings)", () => {
  const { blocks } = segmentBlocks(pagesOf("migii.txt", true), "N1");

  it("uses the EXAM ID as the sitting label", () => {
    for (const b of blocks) expect(b.sitting).toBe("Migii 616");
  });

  it("classifies via the heading + the first body lines (Migii layout)", () => {
    expect(blocks[0].mondai).toBe("kanji-reading"); // 問題 1: 読み方として
    expect(blocks[1].mondai).toBe("orthography"); // 問題 2: 漢字で書くとき
    expect(blocks[2].mondai).toBe("text-grammar"); // 問題 3: 文全体の内容を
    expect(blocks[3].mondai).toBe("reading-mid"); // 問題 4: (1)から(2)
    // 問題 5 is listening (音声と絵) — the global 音声 marker catches it.
    expect(blocks[4].mondai).toBe("listening");
  });

  it("keeps the cloze body with its [n] blank markers", () => {
    expect(blocks[2].rawText).toContain("[1] 駅前のパン屋は朝早くから[2] 行列ができ、");
    expect(blocks[2].rawText).toContain("[3] 午後は[4] 静かになる。");
  });
});

describe("segmentBlocks — combined N3 collection (NN-K label + official date)", () => {
  const { blocks, answerKey } = segmentBlocks(pagesOf("combined_n3.txt", false), "N3");

  it("the official date, read after the N3-1 label, becomes the sitting", () => {
    for (const b of blocks) expect(b.sitting).toBe("2011-07");
  });

  it("classifies all eight forms of the collection", () => {
    expect(blocks.map((b) => b.mondai)).toEqual([
      "kanji-reading", // Ⅰ 読み方として
      "orthography", // Ⅱ 漢字で書くとき
      "context", // Ⅲ （ ）に入れるのに
      "paraphrase", // ④ 意味が最も近いもの
      "usage", // ⑤ 使い方として
      "context", // ⑥ 次の文の（ ）に入れるのに… (vocab block)
      "reading-long", // ⑦ 次の文章を読んで
      "reading-mid", // ⑧ 次の(1)から(2)
    ]);
  });

  it("keeps the compact answer key, mark-preserved, out of the blocks", () => {
    expect(blocks).toHaveLength(8);
    expect(answerKey).toContain("問題Ⅰ 3x1");
    expect(answerKey).toContain("1③ 2② 3③"); // the 問題Ⅰ inline answers
  });
});
