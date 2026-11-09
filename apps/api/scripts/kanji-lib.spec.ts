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
import { N1_ORDER_D, N1_ORDER_E, N1_ORDER_F, N1_ORDER_G, N1_ORDER_H, N1_ORDER_I, N1_PAGE_8, N1_ORDER_A, N1_ORDER_B, N1_ORDER_C, N2_ORDER, N3_PAGE_6, N2_ORDER_2, N3_ORDER, N4_ORDER, N5_ORDER, hanVietNorm, levelForRank, rankJoyo, readingsOf, resolveHanViet } from "./kanji-lib.mjs";

describe("level bands", () => {
  it("maps rank boundaries", () => {
    expect([1, 120, 121, 320, 321, 720, 721, 1200, 1201, 2136].map(levelForRank)).toEqual(
      ["N5", "N5", "N4", "N4", "N3", "N3", "N2", "N2", "N1", "N1"],
    );
    expect(levelForRank(2137)).toBe("");
  });
  it("ranks JLPT easier levels first, then frequency", () => {
    // Latin placeholders so the test never collides with a pinned kanji.
    const r = rankJoyo(["m", "e", "z"], {
      m: { jlpt_new: 4, freq: 300 }, e: { jlpt_new: 5, freq: 1 }, z: { freq: 2000 },
    });
    expect([r.get("e"), r.get("m"), r.get("z")]).toEqual([1, 2, 3]);
  });
  it("pins the fixed N5 order at ranks 1-120", () => {
    expect(N5_ORDER).toHaveLength(120);
    expect(new Set(N5_ORDER).size).toBe(120);
    const r = rankJoyo(["m", "木", "一", "z"], { m: { jlpt_new: 4, freq: 1 }, z: { freq: 2 } });
    // pinned chars keep their fixed rank; the rest fill the free ranks ascending
    expect([r.get("一"), r.get("木"), r.get("m"), r.get("z")]).toEqual([1, 20, 2, 3]);
  });
  it("pins N4 order at ranks 121-320 with no overlap with N5", () => {
    expect(N4_ORDER).toHaveLength(200);
    expect(new Set([...N5_ORDER, ...N4_ORDER]).size).toBe(320);
  });
  it("pins N3 order with no overlap with N5/N4", () => {
    expect(new Set(N3_ORDER).size).toBe(N3_ORDER.length);
    expect(new Set([...N5_ORDER, ...N4_ORDER, ...N3_ORDER]).size).toBe(120 + 200 + N3_ORDER.length);
  });
  it("pins N3 page 6 at 421-440 and shifts the rest of N3 to 441-720 (pages reordered)", () => {
    expect(N3_PAGE_6).toHaveLength(20);
    expect(N3_PAGE_6[0]).toBe("測");
    expect(N3_PAGE_6[19]).toBe("悲");
    const all = [...N5_ORDER, ...N4_ORDER, ...N3_ORDER, ...N3_PAGE_6, ...N2_ORDER];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo([...all, "z"], { z: { freq: 2 } });
    expect(r.get("測")).toBe(421);
    expect(r.get("悲")).toBe(440);
    expect(r.get(N3_ORDER[120])).toBe(441); // 笑…列
    expect(r.get(N3_ORDER[140])).toBe(461); // 祝…久
    expect(r.get(N3_ORDER[100])).toBe(481); // 達…師
    expect(r.get(N3_ORDER[379])).toBe(720);
    expect(r.get(N2_ORDER[0])).toBe(721);
    expect(r.get(N2_ORDER[299])).toBe(1020);
  });
  it("pins the second N2 part at ranks 1021-1200", () => {
    expect(N2_ORDER_2).toHaveLength(180);
    const all = [...N5_ORDER, ...N4_ORDER, ...N3_ORDER, ...N2_ORDER, ...N2_ORDER_2];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N2_ORDER_2[0])).toBe(1021);
    expect(r.get(N2_ORDER_2[179])).toBe(1200);
  });
  it("pins N1 pages at 1201-1340 and 1361-1380 without duplicates", () => {
    expect(N1_ORDER_A).toHaveLength(140);
    expect(N1_ORDER_B).toHaveLength(20);
    const all = [...N5_ORDER, ...N4_ORDER, ...N3_ORDER, ...N3_PAGE_6, ...N2_ORDER, ...N2_ORDER_2, ...N1_ORDER_A, ...N1_ORDER_B];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_A[0])).toBe(1201);
    expect(r.get(N1_ORDER_A[139])).toBe(1340);
    expect(r.get(N1_ORDER_B[0])).toBe(1361);
    expect(r.get(N1_ORDER_B[19])).toBe(1380);
  });
  it("pins N1 pages 1381-1560", () => {
    expect(N1_ORDER_C).toHaveLength(180);
    const all = [...N1_ORDER_A, ...N1_ORDER_B, ...N1_ORDER_C];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo([...N1_ORDER_A, ...N1_ORDER_B, ...N1_ORDER_C], {});
    expect(r.get(N1_ORDER_C[0])).toBe(1381);
    expect(r.get(N1_ORDER_C[179])).toBe(1560);
  });
  it("pins N1 page 8 at 1341-1360", () => {
    expect(N1_PAGE_8).toHaveLength(20);
    const all = [...N1_ORDER_A, ...N1_PAGE_8, ...N1_ORDER_B];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_PAGE_8[0])).toBe(1341);
    expect(r.get(N1_PAGE_8[19])).toBe(1360);
  });
  it("pins N1 pages 1561-1620", () => {
    expect(N1_ORDER_D).toHaveLength(60);
    const all = [...N1_ORDER_C, ...N1_ORDER_D];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_D[0])).toBe(1561);
    expect(r.get(N1_ORDER_D[59])).toBe(1620);
  });
  it("pins N1 pages 1621-1680", () => {
    expect(N1_ORDER_E).toHaveLength(60);
    const all = [...N1_ORDER_D, ...N1_ORDER_E];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_E[0])).toBe(1621);
    expect(r.get(N1_ORDER_E[59])).toBe(1680);
  });
  it("pins N1 pages 1681-1800", () => {
    expect(N1_ORDER_F).toHaveLength(120);
    const all = [...N1_ORDER_E, ...N1_ORDER_F];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_F[0])).toBe(1681);
    expect(r.get(N1_ORDER_F[119])).toBe(1800);
  });
  it("pins N1 pages 1801-1920", () => {
    expect(N1_ORDER_G).toHaveLength(120);
    const all = [...N1_ORDER_F, ...N1_ORDER_G];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_G[0])).toBe(1801);
    expect(r.get(N1_ORDER_G[119])).toBe(1920);
  });
  it("pins N1 pages 1921-2040", () => {
    expect(N1_ORDER_H).toHaveLength(120);
    const all = [...N1_ORDER_G, ...N1_ORDER_H];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_H[0])).toBe(1921);
    expect(r.get(N1_ORDER_H[119])).toBe(2040);
  });
  it("pins the last N1 pages 2041-2136", () => {
    expect(N1_ORDER_I).toHaveLength(96);
    const all = [...N1_ORDER_H, ...N1_ORDER_I];
    expect(new Set(all).size).toBe(all.length);
    const r = rankJoyo(all, {});
    expect(r.get(N1_ORDER_I[0])).toBe(2041);
    expect(r.get(N1_ORDER_I[95])).toBe(2136);
  });
  it("resolves and deduplicates multiple Hán Việt readings", () => {
    expect(readingsOf({ a: ["thủy", "thuỷ"], b: ["hành", "hạnh", "hàng"] })).toEqual([
      "thủy",
      "hành",
      "hạnh",
      "hàng",
    ]);
    expect(
      resolveHanViet("行", {
        curated: { 行: "hành/hạnh/hàng/hạng" },
        hvData: {},
        variants: new Map(),
        kViet: new Map(),
      }),
    ).toBe("hành/hạnh/hàng/hạng");
    expect(hanVietNorm("hành, hạnh / hàng")).toBe("hanh/hanh/hang");
  });
});
