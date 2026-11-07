import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper without types
import { extractStrokePaths, pickKanjiData, SAFE_KANJI_DATA_FIELDS, wordsByKanji } from "./kanji-lib.mjs";

describe("kanji-lib", () => {
  it("never passes WaniKani fields through", () => {
    const out = pickKanjiData({
      strokes: 8, jlpt_new: 5, readings_on: ["がく"],
      wk_radicals: ["x"], wk_level: 1, wk_meanings: ["y"],
    });
    expect(Object.keys(out).some((k: string) => k.startsWith("wk_"))).toBe(false);
    expect(SAFE_KANJI_DATA_FIELDS.some((k: string) => k.startsWith("wk_"))).toBe(false);
  });

  it("copies stroke d verbatim and in order", () => {
    const d1 = "M31.5,11.5c0.5,1.25,1,2.25,1,4";
    const d2 = "M12,20 c1,2 3,4 5,6";
    const svg = `<g id="kvg:StrokePaths_05b66"><path id="kvg:05b66-s1" kvg:type="㇔" d="${d1}"/><path id="kvg:05b66-s2" d="${d2}"/></g><text>1</text>`;
    expect(extractStrokePaths(svg)).toEqual([d1, d2]);
  });

  it("builds related words from common entries only", () => {
    const m = wordsByKanji({
      words: [
        { kanji: [{ text: "学生", common: true, tags: [] }], kana: [{ text: "がくせい" }], sense: [{ gloss: [{ text: "student" }] }] },
        { kanji: [{ text: "学問", common: false, tags: [] }], kana: [{ text: "がくもん" }], sense: [{ gloss: [{ text: "learning" }] }] },
      ],
    });
    expect(m.get("学")).toHaveLength(1);
    expect(m.get("学")[0]).toMatchObject({ term: "学生", reading: "がくせい", glossEn: "student", meaning: "" });
  });
});

// @ts-expect-error plain .mjs helper without types
import { levelForRank, rankJoyo } from "./kanji-lib.mjs";

describe("level bands", () => {
  it("maps rank boundaries", () => {
    expect([1, 120, 121, 320, 321, 720, 721, 1200, 1201, 2136].map(levelForRank)).toEqual(
      ["N5", "N5", "N4", "N4", "N3", "N3", "N2", "N2", "N1", "N1"],
    );
    expect(levelForRank(2137)).toBe("");
  });
  it("ranks JLPT easier levels first, then frequency", () => {
    const r = rankJoyo(["難", "日", "鬱"], {
      難: { jlpt_new: 4, freq: 300 }, 日: { jlpt_new: 5, freq: 1 }, 鬱: { freq: 2000 },
    });
    expect([r.get("日"), r.get("難"), r.get("鬱")]).toEqual([1, 2, 3]);
  });
});
