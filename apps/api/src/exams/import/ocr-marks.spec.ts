import { describe, expect, it } from "vitest";
import { applyMarks } from "./marks.js";
import { readOcrMarks } from "./ocr-marks.js";

// Self-authored sentences (the repo is public: no exam content).
describe("readOcrMarks", () => {
  it("takes the tags out of the page text and keeps them as underline marks", () => {
    const r = readOcrMarks("【31】 彼の<u>態度</u>はよくない。\n1 たいど 2 たいと\n< U >空</ U >は青い。");
    expect(r.text).toBe("【31】 彼の態度はよくない。\n1 たいど 2 たいと\n空は青い。");
    expect(r.marks.map((m) => [m.kind, m.text])).toEqual([
      ["u", "態度"],
      ["u", "空"],
    ]);
  });

  it("puts the underline back on the structured question, whose numbering differs from the page", () => {
    const { marks } = readOcrMarks("【31】 彼の<u>態度</u>はよくない。");
    expect(applyMarks(["彼の態度はよくない。", "態度"], marks)).toEqual(["彼の<u>態度</u>はよくない。", "態度"]);
  });

  it("underlines the same word in each sentence of a 用法 question", () => {
    const { marks } = readOcrMarks("1 朝の<u>空気</u>はいい。\n2 彼は<u>空気</u>を読む。");
    expect(applyMarks(["朝の空気はいい。", "彼は空気を読む。"], marks)).toEqual(["朝の<u>空気</u>はいい。", "彼は<u>空気</u>を読む。"]);
  });

  it("ignores blanks to fill in and unpaired tags", () => {
    const r = readOcrMarks("これは<u>　　</u>です。<u>＿＿</u>\n閉じていない<u>行\n余り</u>の行");
    expect(r.marks).toEqual([]);
    expect(r.text).toBe("これは　　です。＿＿\n閉じていない行\n余りの行");
  });
});
