import { describe, expect, it } from "vitest";
import { parseByRules } from "./rules.js";
import { segmentBlocks } from "./segment.js";

// Self-authored text that mimics a drill book's layout (the repo is public: no book content).
const OPTS = "1 あか 2 あお 3 しろ 4 くろ";
const q = (n: number) => `【${n}】 これは試験の文${n}です。\n${OPTS}`;
const drill = (round: number, type: string, instruction: string, from: number, count = 2) =>
  [
    `第${round}回`,
    type,
    "日付 / / /",
    "得点 /5 /5 /5",
    instruction,
    ...Array.from({ length: count }, (_, i) => q(from + i)),
    String(10 + round),
  ].join("\n");

const READ = "________の言葉の読み方として最もよいものを、1・2・3・4から一つ選びなさい。";
const WRITE = "の言葉を漢字で書くとき、最もよいものを1・2・3・4から一つ選びなさい。";
const BLANK = "(　　)に入れるのに最もよいものを、1・2・3・4から一つ選びなさい。";
const USAGE = "次の言葉の使い方として最もよいものを、1・2・3・4から一つ選びなさい。";

describe("segmentBlocks — drill book", () => {
  const pages = [
    drill(1, "漢字読み", READ, 1),
    drill(2, "漢字読み", READ, 3),
    drill(1, "表記", WRITE, 1),
    drill(1, "語形成", BLANK, 1),
    drill(1, "用法", USAGE, 1),
    // A continuation page: no banner, no instruction.
    q(3),
    // The answer booklet: typed sections, explanations after each entry.
    "漢字読み\n第1回\n【1】 正解2\nあお blue\n1 「あか」 red\n【2】正解 3\n第2回\n【3】・正解1\n【4】 正解4",
    "表記\n第1回\n【1】正解4\n【2】正解1",
    // An explanation page that carries no entry at all.
    "1 「しろ」 white\n2 「くろ」 black",
    "語形成\n第1回\n【1】正解3\n【2】正解3\n用法\n第1回\n【1】正解2\n【2】正解2\n【3】正解1",
  ];
  const { blocks } = segmentBlocks(pages, "N2");

  it("opens one block per drill, typed by its banner", () => {
    expect(blocks.map((b) => [b.mondai, b.pageFrom, b.pageTo])).toEqual([
      ["kanji-reading", 1, 1],
      ["kanji-reading", 2, 2],
      ["orthography", 3, 3],
      ["word-formation", 4, 4],
      ["usage", 5, 6],
    ]);
    expect(blocks.map((b) => b.sectionHint)).toEqual(Array(5).fill("vocab"));
  });

  it("matches each block's answers by type and printed number, not by position in the book", () => {
    expect(blocks.map((b) => b.key?.answers)).toEqual([
      [2, 3],
      [1, 4],
      [4, 1],
      [3, 3],
      [2, 2, 1],
    ]);
  });

  it("keeps banners, score boxes and explanations out of the question text", () => {
    for (const b of blocks) expect(b.rawText).not.toMatch(/日付|得点|正解|第\d回|white/);
  });

  it("is readable by the rules, keeping the printed numbers (also above 99)", () => {
    const [b] = segmentBlocks([drill(1, "漢字読み", READ, 101, 3)], "N2").blocks;
    const parsed = parseByRules(b);
    expect(parsed?.questions.map((x) => x.printedNo)).toEqual([101, 102, 103]);
    expect(parsed?.questions[0].options).toEqual(["あか", "あお", "しろ", "くろ"]);
  });

  it("still splits when the OCR lost the banner and the underline", () => {
    const bare = (inst: string, from: number) => [inst, q(from), q(from + 1)].join("\n");
    const out = segmentBlocks([bare(READ.replace(/_+/, ""), 1), bare(WRITE, 1)], "N2").blocks;
    expect(out.map((b) => b.mondai)).toEqual(["kanji-reading", "orthography"]);
  });

  it("matches untyped answer sections by order only when the counts agree", () => {
    const book = (answers: string) => [drill(1, "漢字読み", READ, 31), drill(1, "表記", WRITE, 1), answers];
    const same = segmentBlocks(book("【31】正解1\n【32】正解2\n【1】正解3\n【2】正解4"), "N2").blocks;
    expect(same.map((b) => b.key?.answers)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    // One section is missing: nothing says which paper the other belongs to → no guess.
    const short = segmentBlocks(book("【1】正解3\n【2】正解4"), "N2").blocks;
    expect(short.map((b) => b.key)).toEqual([undefined, undefined]);
  });

  it("leaves an exam paper with 問題 headings to the paper segmenter", () => {
    const paper = ["問題1 ________の言葉の読み方として最もよいものを選びなさい。\n1) 文です。\n1 あ 2 い 3 う 4 え"];
    const [b] = segmentBlocks(paper, "N2").blocks;
    expect(b.instruction.startsWith("問題1")).toBe(true);
    expect(b.key).toBeUndefined();
  });
});
