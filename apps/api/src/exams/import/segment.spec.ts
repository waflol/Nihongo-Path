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

describe("collection PDF (many papers + per-paper answer sheets)", () => {
  const paper = (n: number, firstLine: string) =>
    [`N2 - ${n} ${firstLine}`, `問題${n} ___の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。(${n})`, `1 あ${n} 2 い 3 う 4 え`].join("\n");
  const sheet = (n: number, ans: string) =>
    [`日本語の能力試験 N2-${n} 解答`, "問題 1 5x1(5d)", "1 2 3 4 5", ans].join("\n");

  it("reads the paper label glued to the first text line, and drops it from the body", () => {
    const { blocks } = segmentBlocks([paper(4, "これは前置きです"), paper(5, "別の前置き")], "N2");
    expect(blocks.map((b) => b.sitting)).toEqual(["N2-4", "N2-5"]);
    expect(blocks[0].rawText).not.toMatch(/N2\s*-\s*4/);
  });

  it("keeps answer-sheet pages out of the blocks and parses a key per paper", () => {
    const { blocks, sheetKeys } = segmentBlocks([paper(1, "前置き"), sheet(1, "2 4 2 3 4"), sheet(2, "1 1 1 1 1")], "N2");
    expect(blocks).toHaveLength(1);
    expect(Object.keys(sheetKeys).sort()).toEqual(["N2-1", "N2-2"]);
    expect(sheetKeys["N2-1"][0]).toMatchObject({ heading: "問題1", questionCount: 5, answers: [2, 4, 2, 3, 4] });
  });
});

describe("official collection with each paper's own answer pages (`…N2 答案`)", () => {
  const paper1 = [
    "2010年7月新日本語能力試験N2",
    "問題1 ___の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。",
    "[1] 花を見る。",
    "1 はな 2 は 3 ひ 4 み",
    "問題10 次の(1)から(5)の文章を読んで、後の問いに対する答えとして最もよいものを、1・2・3・4から一つ選びなさい。",
    "(1)",
    "2010年6月28日",
    "社員各位　来月の会議についてお知らせします。",
    "55 この文書で一番伝えたいことは何か。",
    "1 会議 2 日程 3 場所 4 時間",
  ].join("\n");
  const key1 = ["2010年7月新日本語能力試験N2 答案", "文字・語彙", "問題1", "1 2 3 4 5", "3 1 2 4 2", "問題2", "6 7 8 9 10", "4 2 3 1 3"].join("\n");
  const key1More = ["淘宝店铺：约翰杂货铺", "問題 10", "55 56 57 58 59", "2 3 4 2 1"].join("\n"); // runs on, no header
  // The next paper's first page was not read (no header): it is named by the key that closes it.
  const paper2 = [
    "問題6 次の言葉の使い方として最もよいものを、1・2・3・4から一つ選びなさい。",
    "28 深刻",
    "1 あ 2 い 3 う 4 え",
    "問題7 次の文の( )に入れるのに最もよいものを、1・2・3・4から一つ選びなさい。",
    "33 このレストランは、客の予算( )コースを用意してくれる。",
    "1 に比べて 2 に先立って 3 に応じて 4 に向けて",
  ].join("\n");
  const key2 = ["2011年7月新日本語能力試験N2答案", "問題6", "28 29 30 31 32", "4 2 3 2 1", "問題7", "33 34", "3 1"].join("\n");
  const seg = segmentBlocks([paper1, key1, key1More, paper2, key2], "N2");

  it("keeps the answer pages out of the blocks", () => {
    expect(seg.blocks.map((b) => [b.sitting, b.instruction.slice(0, 5)])).toEqual([
      ["2010-07", "問題1 _"],
      ["2010-07", "問題10 "],
      ["2011-07", "問題6 次"],
      ["2011-07", "問題7 次"],
    ]);
  });

  it("reads one key per paper, including the page that runs on without a header", () => {
    expect(seg.sheetKeys["2010-07"].map((k) => [k.heading, k.questionCount, k.answers])).toEqual([
      ["問題1", 5, [3, 1, 2, 4, 2]],
      ["問題2", 5, [4, 2, 3, 1, 3]],
      ["問題10", 5, [2, 3, 4, 2, 1]],
    ]);
    expect(seg.sheetKeys["2011-07"][0]).toMatchObject({ heading: "問題6", answers: [4, 2, 3, 2, 1] });
  });

  it("does not take a dated line in a passage for a new paper (and keeps the lines after it)", () => {
    expect(Object.keys(seg.sheetKeys).sort()).toEqual(["2010-07", "2011-07"]);
    expect(seg.blocks[1].rawText).toContain("2010年6月28日");
    expect(seg.blocks[1].rawText).toContain("55 この文書で一番伝えたいことは何か。");
  });

  it("types the N2 問題7 blank by its number (same instruction as 問題4 文脈規定)", () => {
    expect(seg.blocks[3].mondai).toBe("grammar-form");
  });
});

describe("segmentBlocks — the 聴解 part of a paper", () => {
  const written = ["JLPT・N2・12/2025", "問題 1 の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。", "1 雨が降る。", "1 あめ 2 あま 3 う 4 ゆ"].join("\n");
  const listening = [
    "JLPT・N2・12/2025",
    "聴解",
    "問題 1 では、まず質問を聞いてください。それから話を聞いて、問題用紙の 1 から 4 の中か",
    "ら、最もよいものを一つ選んでください。",
    "1番",
    "1 本を返す",
    "2 席を取る",
    "3 傘を買う",
    "4 駅へ行く",
    "問題 4 では、問題用紙に何も印刷されていません。まず文を聞いてください。",
    "それから、それに対する返事を聞いて、1 から 3 の中から、最もよいものを一つ選んでください。",
    "ーメモー",
  ].join("\n");
  const { blocks } = segmentBlocks([written, listening], "N2");

  it("types each listening 問題 by its own layout — not as the 文字・語彙 問題 of the same number", () => {
    expect(blocks.map((b) => [b.sectionHint, b.mondai, b.note ?? ""])).toEqual([
      ["vocab", "kanji-reading", ""],
      ["listening", "listening-task", ""],
      ["listening", "listening-quick", ""],
    ]);
  });
});

describe("segmentBlocks — a typed N3 paper with a sharer's watermark", () => {
  const wm = ["Group", "ữ", "Ana Lee", "i Ng"];
  const page = (lines: string[]) => [...wm.slice(0, 2), ...lines, ...wm.slice(2)].join("\n");
  const pages = [
    page([
      "2022 年 7 月 N3 ANA LEE",
      "文字・語彙",
      "問題 1 ＿＿＿の言葉の読み方として最もよいものを、1・2・3・4 から一つ選びなさい。",
      "1) 毎朝、公園を散歩します。",
      "1 さんぽ 2 さんほ 3 ざんぽ 4 ざんほ",
      "問題 2＿＿＿のことばを漢字で書くとき、最もよいものを、1・2・3・4 から一つえらびなさい。",
      "2) かぜをひいた。",
      "1 風邪 2 風引 3 風事 4 風地",
    ]),
    page([
      "間題 3（ ）に人れるのに最もよいものを、1・2・3・4 から一つえらびなさい。",
      "3) のどが（ ）ので、何か飲みたい。",
      "Ana Lee1 かわいた 2 すいた 3 へった 4 やせた",
      "聴解",
      "問題 1",
      "問題 1 では、まず質問を聞いてください。それから話を聞いて、問題用紙の 1 から 4 の中から、最もよいものを一つえらんでください。",
      "1 番",
      "1 本を返す",
      "2 席を取る",
      "3 傘を買う",
      "4 駅へ行く",
    ]),
    page(["問題 4", "問題 4 では、えを見ながら質問を聞いてください。やじるし(→)の人は何と言いますか。", "1 番 2 番", "3 番 4 番"]),
  ];
  const { blocks } = segmentBlocks(pages, "N3");

  it("opens every 問題, even glued to its ＿＿＿ or misread 間題, and names the paper", () => {
    expect(blocks.map((b) => [b.sitting, b.mondai])).toEqual([
      ["2022-07", "kanji-reading"],
      ["2022-07", "orthography"],
      ["2022-07", "context"],
      ["2022-07", "listening-task"],
      ["2022-07", "listening-utterance"],
    ]);
  });

  it("keeps the watermark out of the blocks and makes one block of a title printed above its instruction", () => {
    expect(blocks[2].rawText).toContain("1 かわいた 2 すいた");
    for (const b of blocks) expect(b.instruction + b.rawText).not.toMatch(/Group|Ana Lee|i Ng|ữ/);
    expect(blocks[3].instruction).toMatch(/^問題 1 では/);
    expect(blocks[4].rawText).toBe("1 番 2 番\n3 番 4 番");
  });

  it("takes the paper's name from a running header", () => {
    const header = (body: string) => ["JLPT・N2・12/2025", body].join("\n");
    const r = segmentBlocks(
      [header("問題 1 ＿＿＿の言葉の読み方として最もよいものを選びなさい。\n1) 雨が降る。\n1 あめ 2 あま 3 う 4 ゆ"), header("2) 山に登る。\n1 のぼる 2 のこる 3 のせる 4 のびる")],
      "N2",
    );
    expect(r.blocks.map((b) => b.sitting)).toEqual(["2025-12"]);
  });
});
