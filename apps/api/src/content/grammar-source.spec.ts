import { describe, expect, it } from "vitest";
import { mapSuperHonkiSource, parseRegisteredJson } from "./grammar-source.js";

describe("grammar source parser", () => {
  it("parses the static SB.register wrapper without executing it", () => {
    expect(parseRegisteredJson('SB.register({"level":"n5","pats":[]});')).toEqual({ level: "n5", pats: [] });
  });

  it("rejects executable or unknown wrappers", () => {
    expect(() => parseRegisteredJson("window.run({})")).toThrow();
    expect(() => parseRegisteredJson('SB.register({"x": function(){}})')).toThrow();
  });

  it("maps senses, examples and provenance", () => {
    const [point] = mapSuperHonkiSource(`SB.register(${JSON.stringify({
      level: "n5",
      groups: [{ n: 1, ja: "入門", vi: "Nhập môn" }],
      pats: [{ id: "n5-001", g: 1, note: ["Lưu ý"], cmp: [{ id: "n5-002", pat: "～間に", desc: "Khác nhau" }], lv: "n5", pat: "～うちに", mean: "Trong lúc", core: "Giải thích", form: ["N + の + うちに"], exp: ["Dùng khi..."], theme: ["thoi-gian"], ctx: ["hoi-thoai"], book: [["minna", "1", 1]], senses: [{ n: 1, label: "Cách dùng", ex: [{ ja: "日本語[にほんご]を勉強[べんきょう]するうちに", vi: "Trong lúc học tiếng Nhật" }] }] }],
    })})`, "test");
    expect(point.sourceKey).toBe("n5-001");
    expect(point.sourceHash).toHaveLength(64);
    expect(point.senses[0].examples[0].translation).toContain("Trong lúc");
    expect(point.level).toBe("N5");
    expect(point.notes).toEqual(["Lưu ý"]);
    expect(point.compareWith).toEqual([{ grammarId: "n5-002", label: "～間に", note: "Khác nhau" }]);
    expect(point).toMatchObject({ groupNo: 1, groupJa: "入門", groupVi: "Nhập môn" });
    expect(point.themeIds).toEqual(["thoi-gian"]);
    expect(point.contextIds).toEqual(["hoi-thoai"]);
    expect(point.textbookRefs).toEqual([{ textbookId: "minna", unitId: "1", order: 1 }]);
  });
});
