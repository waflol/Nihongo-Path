import { describe, expect, it } from "vitest";
import { findGutter, type Frag } from "./prose.js";

/** One 問題1 question row: `１ めぐまれた ２ かこまれた ３ つつまれた ４ のまれた`, laid out as a table. */
function optionRow(y: number): Frag[] {
  return [
    { x: 97, y, w: 12, s: "１" },
    { x: 121, y, w: 60, s: "めぐまれた" },
    { x: 193, y, w: 12, s: "２" },
    { x: 217, y, w: 60, s: "かこまれた" },
    { x: 289, y, w: 12, s: "３" },
    { x: 313, y, w: 60, s: "つつまれた" },
    { x: 385, y, w: 12, s: "４" },
    { x: 409, y, w: 60, s: "のまれた" },
  ];
}

describe("findGutter", () => {
  it("does not mistake the gap inside an options table (１ … ２ … ３ | … ４ …) for a column gutter", () => {
    const frags = [588, 535, 481, 428, 374].flatMap(optionRow);
    expect(findGutter(frags, false)).not.toBeNull(); // the gap alone looks like a gutter…
    expect(findGutter(frags)).toBeNull(); // …but the option numbers hugging their text say it is a table
  });

  it("still finds the gutter of a real two-column page", () => {
    const frags: Frag[] = [];
    for (let i = 0; i < 10; i++) {
      frags.push({ x: 72, y: 700 - i * 18, w: 200, s: "左の列の文章がここに入ります" });
      frags.push({ x: 330, y: 700 - i * 18, w: 200, s: "右の列の文章がここに入ります" });
    }
    expect(findGutter(frags)).toBeGreaterThan(272);
  });
});
