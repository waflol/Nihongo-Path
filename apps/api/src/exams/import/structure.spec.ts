import { describe, expect, it } from "vitest";
import { parseAiJson, presentInBlock, type ParsedBlock, structurePrompt, validateParsed } from "./structure.js";

/**
 * NP-407: the AI-structuring guardrail. The model is only ever ASKED to copy
 * content; `validateParsed` rejects anything it invented — a prompt / option /
 * passage body that is not a substring of the block (NFKC-normalised) means
 * the model fabricated or "improved" it, and the block becomes an `error`
 * draft for a human, never a silent guess.
 */

const BLOCK = [
  "問題I 読み方として最もよいものを１から４のうちから一つえらべ。",
  "[1] 毎朝、公園を散歩します。",
  "① さんぽ ② わたし ③ しょくじ ④ ねむり",
  "[2] 先生は黒板に字を書きました。",
  "① かける ② かす ③ かき ④ かく",
].join("\n");

function goodParsed(): ParsedBlock {
  return {
    stimuli: [],
    questions: [
      { no: 1, prompt: "毎朝、公園を散歩します。", options: ["さんぽ", "わたし", "しょくじ", "ねむり"] },
      { no: 2, prompt: "先生は黒板に字を書きました。", options: ["かける", "かす", "かき", "かく"] },
    ],
  };
}

describe("validateParsed", () => {
  it("accepts a faithful parse", () => {
    expect(validateParsed(goodParsed(), BLOCK)).toEqual([]);
  });

  it("accepts a prompt re-joined across lines (NFKC + whitespace-insensitive)", () => {
    const p = goodParsed();
    p.questions[0].prompt = "毎朝、公園を散歩します。"; // same, whitespace removed by normalisation
    const joined = goodParsed();
    joined.questions[1].prompt = "先生は黒板に字を書きました。";
    expect(validateParsed(p, BLOCK)).toEqual([]);
    expect(validateParsed(joined, BLOCK)).toEqual([]);
  });

  it("rejects a fabricated option (not in the block)", () => {
    const p = goodParsed();
    p.questions[0].options[0] = "はこ"; // invented distractor
    const issues = validateParsed(p, BLOCK);
    expect(issues.some((i) => i.path.includes("options[0]") && i.message.includes("bịa"))).toBe(true);
  });

  it("rejects a fabricated prompt", () => {
    const p = goodParsed();
    p.questions[0].prompt = "私は毎日学校に行きます。"; // not in the block
    expect(validateParsed(p, BLOCK).some((i) => i.path.includes("prompt"))).toBe(true);
  });

  it("rejects a fabricated passage body and a bodyB that never existed", () => {
    const p: ParsedBlock = {
      stimuli: [{ key: "s1", kind: "pair", body: "新しい文A", bodyB: "新しい文B" }],
      questions: [{ no: 1, prompt: "毎朝、公園を散歩します。", options: ["さんぽ", "わたし", "しょくじ", "ねむり"], stimulusKey: "s1" }],
    };
    const issues = validateParsed(p, BLOCK);
    expect(issues.some((i) => i.path === "stimuli.s1.body")).toBe(true);
    expect(issues.some((i) => i.path === "stimuli.s1.bodyB")).toBe(true);
  });

  it("rejects the wrong option count for a printed form (4 expected)", () => {
    const p = goodParsed();
    p.questions[0].options = ["さんぽ", "わたし", "しょくじ"]; // 3, not a listening form
    expect(validateParsed(p, BLOCK).some((i) => i.path.includes("options") && i.message.includes("số phương án"))).toBe(true);
  });

  it("allows 3 options for a listening form", () => {
    const p = goodParsed();
    p.questions[0].options = ["さんぽ", "わたし", "しょくじ"];
    expect(validateParsed(p, BLOCK, [3, 4])).toEqual([]);
  });

  it("rejects a duplicate question number", () => {
    const p = goodParsed();
    p.questions[1].no = 1;
    expect(validateParsed(p, BLOCK).some((i) => i.message.includes("lặp lại"))).toBe(true);
  });

  it("rejects a question pointing at a missing passage", () => {
    const p = goodParsed();
    p.questions[0].stimulusKey = "s9";
    expect(validateParsed(p, BLOCK).some((i) => i.message.includes("không tồn tại"))).toBe(true);
  });

  it("a passage nobody points at is flagged (the generator can't draw it)", () => {
    const p: ParsedBlock = {
      stimuli: [{ key: "s1", kind: "passage", body: "毎朝、公園を散歩します。" }],
      questions: [{ no: 1, prompt: "毎朝、公園を散歩します。", options: ["さんぽ", "わたし", "しょくじ", "ねむり"] }],
    };
    expect(validateParsed(p, BLOCK).some((i) => i.message.includes("câu hỏi nào trỏ tới"))).toBe(true);
  });

  it("a missing / empty question list is one hard issue, not a crash", () => {
    expect(validateParsed({ stimuli: [], questions: [] }, BLOCK)).toHaveLength(1);
    expect(validateParsed(null, BLOCK)).toHaveLength(1);
  });
});

describe("presentInBlock", () => {
  it("normalises both sides (full→half width, whitespace, NFKC)", () => {
    expect(presentInBlock("毎朝、公園を散歩します。", "毎朝、公園を散歩します。")).toBe(true);
    // Fullwidth ０-４ and spaces are unified before the test.
    expect(presentInBlock("１から４", "1から4")).toBe(true);
    expect(presentInBlock("毎朝、公園を散歩します。", "hồ sơ")).toBe(false);
    expect(presentInBlock("anything", "")).toBe(true); // empty is always ok
  });
});

describe("structurePrompt", () => {
  it("embeds the block + the hard copy-only rule, and the mondai hint", () => {
    const p = structurePrompt({ instruction: "問題I 読み方として…", rawText: BLOCK, mondai: "kanji-reading" });
    expect(p).toContain("KHỐI GỐC");
    expect(p).toContain(BLOCK);
    expect(p).toContain("không bịa");
    expect(p).toContain("kanji-reading");
  });

  it("says to keep the content when the type is unknown", () => {
    const p = structurePrompt({ instruction: "問題X", rawText: BLOCK, mondai: null });
    expect(p).toContain("chưa nhận dạng được");
  });
});

describe("parseAiJson", () => {
  it("parses a fenced reply", () => {
    const p = parseAiJson("```json\n" + JSON.stringify(goodParsed()) + "\n```");
    expect(p).not.toBeNull();
    expect(p!.questions).toHaveLength(2);
  });

  it("tolerates prose around the JSON", () => {
    const p = parseAiJson(`Dưới đây là kết quả:\n${JSON.stringify(goodParsed())}\nXong.`);
    expect(p!.stimuli).toEqual([]);
  });

  it("returns null on bad JSON or a missing questions array", () => {
    expect(parseAiJson("{not json")).toBeNull();
    expect(parseAiJson(JSON.stringify({ stimuli: [] }))).toBeNull();
    expect(parseAiJson("no braces here")).toBeNull();
  });
});
