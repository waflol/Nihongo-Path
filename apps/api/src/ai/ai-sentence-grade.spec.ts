import { describe, expect, it } from "vitest";
import { parseSentenceGrade } from "./ai-example.service.js";

describe("parseSentenceGrade", () => {
  it("clamps the score and cleans the lists", () => {
    const g = parseSentenceGrade({
      score: 14.4,
      summary: " Tốt ",
      corrected: "私は学校に行きます。",
      mistakes: [{ part: "を", problem: "Sai trợ từ", fix: "に" }, { problem: "" }],
      usage: [{ ja: "学校に行く。", vi: "Đi học.", note: "N に行く" }, { ja: "" }],
    });
    expect(g?.score).toBe(10);
    expect(g?.summary).toBe("Tốt");
    expect(g?.usesWord).toBe(true);
    expect(g?.mistakes).toHaveLength(1);
    expect(g?.usage).toHaveLength(1);
  });

  it("rejects an answer without a score or summary", () => {
    expect(parseSentenceGrade({ summary: "x" })).toBeNull();
    expect(parseSentenceGrade({ score: 5 })).toBeNull();
    expect(parseSentenceGrade("no")).toBeNull();
  });
});
