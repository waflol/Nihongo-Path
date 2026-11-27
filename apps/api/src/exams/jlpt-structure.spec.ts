import { describe, expect, it } from "vitest";
import { LISTENING_LAYOUT } from "./import/listening.js";
import { OFFICIAL_MONDAI } from "./import/mondai-table.js";
import { JLPT_STRUCTURE, usualCountOf, type JlptLevelStructure } from "./jlpt-structure.js";

const level = (l: JlptLevelStructure["level"]) => JLPT_STRUCTURE.find((s) => s.level === l)!;
const bySection = (l: JlptLevelStructure["level"]) => {
  const out: Record<string, number> = {};
  for (const p of level(l).parts) for (const m of p.mondai) out[m.section] = (out[m.section] ?? 0) + m.count;
  return out;
};

describe("JLPT_STRUCTURE", () => {
  it("lists N5 … N1 with the times of the product owner's tables", () => {
    expect(JLPT_STRUCTURE.map((s) => [s.level, s.parts.map((p) => p.timeMin), s.totalMin])).toEqual([
      ["N5", [20, 40, 30], 90],
      ["N4", [25, 55, 35], 115],
      ["N3", [30, 70, 40], 140],
      ["N2", [105, 50], 155],
      ["N1", [110, 60], 170],
    ]);
  });

  it("prints the written 大問 in the order of the official layout the import uses", () => {
    for (const s of JLPT_STRUCTURE) {
      const written = s.parts.filter((p) => p.key !== "listening").map((p) => p.mondai.map((m) => m.mondai));
      expect(written).toEqual(OFFICIAL_MONDAI[s.level].map((row) => [...row]));
      for (const p of s.parts) expect(p.mondai.map((m) => m.no)).toEqual(p.mondai.map((_, i) => i + 1));
    }
  });

  it("has the listening 大問 of the import's listening layout", () => {
    for (const s of JLPT_STRUCTURE) {
      const listening = s.parts.find((p) => p.key === "listening")!;
      expect(listening.mondai.map((m) => m.mondai)).toEqual(LISTENING_LAYOUT[s.level].map((m) => m.mondai));
    }
  });

  it("adds up to the subtotals of those tables", () => {
    expect(["N1", "N2", "N3", "N4", "N5"].map((l) => bySection(l as JlptLevelStructure["level"]))).toEqual([
      { vocab: 25, grammar: 19, reading: 22, listening: 30 },
      { vocab: 30, grammar: 21, reading: 20, listening: 30 },
      { vocab: 35, grammar: 22, reading: 16, listening: 28 },
      { vocab: 35, grammar: 25, reading: 10, listening: 28 },
      { vocab: 35, grammar: 26, reading: 6, listening: 24 },
    ]);
    for (const s of JLPT_STRUCTURE) expect(s.totalQuestions).toBe(s.parts.reduce((n, p) => n + p.questions, 0));
  });

  it("gives 即時応答 and 発話表現 three options, the rest four, and names each 大問", () => {
    const n3 = level("N3").parts.find((p) => p.key === "listening")!.mondai;
    expect(n3.map((m) => [m.nameJa, m.options])).toEqual([
      ["課題理解", 4],
      ["ポイント理解", 4],
      ["概要理解", 4],
      ["発話表現", 3],
      ["即時応答", 3],
    ]);
    expect(level("N2").parts[0].mondai[6]).toMatchObject({ no: 7, nameJa: "文の文法1（文法形式の判断）", count: 12, section: "grammar" });
  });

  it("tells the usual count of a 大問 at a level, nothing for a form the level does not print", () => {
    expect(usualCountOf("n2", "word-formation")).toBe(3);
    expect(usualCountOf("N3", "text-grammar")).toBe(4);
    expect(usualCountOf("N3", "word-formation")).toBeUndefined();
    expect(usualCountOf(undefined, "context")).toBeUndefined();
  });
});
