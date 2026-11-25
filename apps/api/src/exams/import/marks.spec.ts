import { describe, expect, it } from "vitest";
import { applyMarks, enrich, extractFurigana, findStarSlots, findUnderlines, stripJunk, type TextRun } from "./marks.js";

/** Full-width text at 12pt (furigana at 6pt), one unit of width per character. */
const run = (s: string, x: number, y: number, h = 12): TextRun => ({ s, x, y, h, w: [...s].length * h });

const body = [run("ぼくはひとみしりをする質で、", 100, 300), run("あんなふうには真似ができない。", 100, 270), run("本を読む。", 100, 240)];
// 質 is the 12th character of line 1; 真 and 似 the 8th and 9th of line 2.
const furigana = [run("たち", 232, 312, 6), run("ま", 187, 282, 6), run("ね", 199, 282, 6)];

describe("extractFurigana", () => {
  it("takes the small kana off the page and attaches it to the kanji below, joining one word", () => {
    const r = extractFurigana([...body, ...furigana]);
    expect(r.body).toEqual(body);
    expect(r.marks.map((m) => [m.text, m.reading])).toEqual([
      ["質", "たち"],
      ["真似", "まね"],
    ]);
  });

  it("keeps small kana that sits over no kanji as ordinary text", () => {
    const stray = run("ちゅう", 100, 312, 6);
    expect(extractFurigana([...body, stray]).body).toContain(stray);
  });
});

describe("findUnderlines", () => {
  // Characters 4–11 of line 1: ひとみしりをする.
  const rule = { x0: 136, y0: 297, x1: 232, y1: 297 };

  it("reads the words above a rule just under the baseline", () => {
    expect(findUnderlines(body, [rule]).map((m) => m.text)).toEqual(["ひとみしりをする"]);
  });

  it("ignores table borders and rules far from any baseline", () => {
    const side = { x0: 136, y0: 290, x1: 136, y1: 320 };
    expect(findUnderlines(body, [rule, side])).toEqual([]);
    expect(findUnderlines(body, [{ ...rule, y0: 290, y1: 290 }])).toEqual([]);
  });
});

describe("★ sentences", () => {
  // 今朝は地震で ＿＿＿＿★＿ ＿＿ ではなかった。 — 12pt text; two blanks drawn as one rule, as in the paper.
  const line = [run("今朝は地震で", 100, 500), run("★", 270, 500), run("ではなかった。", 360, 500)];
  const under = (x0: number, x1: number) => ({ x0, y0: 498, x1, y1: 498 });

  it("counts the blanks by width and finds the one holding the ★", () => {
    const m = findStarSlots(line, [under(175, 305), under(315, 355)]);
    expect(m.map((x) => x.slot)).toEqual([2]);
    expect(applyMarks(["今朝は地震で ★ ではなかった。"], m)).toEqual(["今朝は地震で ___ ___ _★_ ___ ではなかった。"]);
  });

  it("does not count the part of a rule that runs under the words", () => {
    // 男は★ ＿＿ ＿＿ ＿＿ with the first rule starting under 男は.
    const l = [run("男は", 100, 400), run("★", 150, 400)];
    const r = [101, 183, 232, 281].map((x, i) => ({ x0: x, y0: 398, x1: i === 0 ? 171 : x + 39, y1: 398 }));
    expect(findStarSlots(l, r).map((x) => x.slot)).toEqual([0]);
  });

  it("stays silent when the rules do not make four blanks", () => {
    expect(findStarSlots(line, [under(250, 290)])).toEqual([]);
  });

  it("replaces an already underlined ★ and leaves written-out blanks alone", () => {
    const m = findStarSlots(line, [under(175, 305), under(315, 355)]);
    expect(enrich(["今朝は地震で <u>★</u> ではなかった。"], m, [])).toEqual(["今朝は地震で ___ ___ _★_ ___ ではなかった。"]);
    expect(enrich(["今朝は地震で ___ _★_ ___ ___ ではなかった。"], m, [])).toEqual(["今朝は地震で ___ _★_ ___ ___ ではなかった。"]);
  });
});

describe("updating an earlier import", () => {
  const { marks, junk } = extractFurigana([...body, ...furigana]);

  it("drops the readings plain extraction left alone on a line or glued before their line", () => {
    expect(stripJunk("たち\nぼくはひとみしりをする質で、まねあんなふうには真似ができない。", junk)).toBe(
      "ぼくはひとみしりをする質で、あんなふうには真似ができない。",
    );
  });

  it("tags plain fields and never touches a field someone formatted", () => {
    const edited = "<b>ぼくは</b>ひとみしりをする質で、";
    expect(enrich([edited, "まねあんなふうには真似ができない。"], marks, junk)).toEqual([edited, "あんなふうには<ruby=まね>真似</ruby>ができない。"]);
  });
});

describe("applyMarks", () => {
  const marks = [...extractFurigana([...body, ...furigana]).marks, ...findUnderlines(body, [{ x0: 136, y0: 297, x1: 244, y1: 297 }])];

  it("tags the matching text even when line breaks and widths differ, underline around furigana", () => {
    const [out] = applyMarks(["ぼくは ひとみしりをする質で、\nあんなふうには真似ができない。"], marks);
    expect(out).toBe("ぼくは <u>ひとみしりをする<ruby=たち>質</ruby></u>で、\nあんなふうには<ruby=まね>真似</ruby>ができない。");
  });

  it("picks the occurrence whose surroundings match, and only that one", () => {
    const m = [{ kind: "u" as const, text: "その中", before: "55)「", after: "」は何を" }];
    expect(applyMarks(["がありますが、その中の一つに", "「その中」は何を指しているか。"], m)).toEqual([
      "がありますが、その中の一つに",
      "「<u>その中</u>」は何を指しているか。",
    ]);
  });

  it("drops a mark it cannot place with confidence", () => {
    const m = [{ kind: "ruby" as const, text: "猿", reading: "さる", before: "", after: "" }];
    expect(applyMarks(["猿", "三猿"], m)).toEqual(["猿", "三猿"]);
  });
});
