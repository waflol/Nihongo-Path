import { describe, it, expect } from "vitest";
import { grammarCardDetail } from "./srs.service.js";

describe("grammarCardDetail", () => {
  it("collects usage and prefers the examples of the senses", () => {
    const detail = grammarCardDetail({
      structure: "N + です",
      forms: ["Nです"],
      explanations: ["Giải thích"],
      senses: [{ no: 1, explanation: "Nghĩa 1", examples: [{ sentence: "本[ほん]です。", translation: "Là sách." }] }],
      examples: [{ sentence: "古い", translation: "cũ" }],
    });
    expect(detail.forms).toEqual(["N + です", "Nです"]);
    expect(detail.explanations).toEqual(["Giải thích", "Nghĩa 1"]);
    expect(detail.examples).toEqual([{ sentence: "本[ほん]です。", translation: "Là sách." }]);
  });

  it("falls back to the point's own examples", () => {
    const detail = grammarCardDetail({ examples: [{ sentence: "例", translation: "ví dụ" }] });
    expect(detail.examples).toEqual([{ sentence: "例", translation: "ví dụ" }]);
    expect(detail.notes).toEqual([]);
  });
});
