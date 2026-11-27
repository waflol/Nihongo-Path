import { describe, expect, it } from "vitest";
import { readSuggestions, suggestPrompt } from "./suggest.js";

const qs = [
  { no: 1, prompt: "<u>花</u>を見る。", options: ["はな", "は", "ひ", "み"] },
  { no: 2, prompt: "筆者の考えはどれか。", options: ["あ", "い", "う", "え"], stimulusKey: "s1" },
];

describe("suggestPrompt", () => {
  it("numbers the questions as the reader expects and keeps the underline, without furigana", () => {
    const p = suggestPrompt({
      level: "N2",
      mondai: "kanji-reading",
      instruction: "問題1 ___の言葉の読み方として最もよいものを選びなさい。",
      stimuli: [{ key: "s1", title: "お知らせ", body: "<ruby=ほんぶん>本文</ruby>です。" }],
      questions: qs,
    });
    expect(p).toContain("JLPT N2 teacher");
    expect(p).toContain("Q1: <u>花</u>を見る。\n  1) はな\n  2) は");
    expect(p).toContain("Q2 (passage s1): 筆者の考えはどれか。");
    expect(p).toContain("PASSAGE s1 — お知らせ:\n本文です。");
    expect(p).not.toContain("ruby");
    expect(p).not.toContain("★");
  });

  it("explains the ★ answer for sentence-order blocks", () => {
    expect(suggestPrompt({ mondai: "star-order", instruction: "", stimuli: [], questions: qs })).toContain("★ blank");
  });
});

describe("readSuggestions", () => {
  it("keys each answer by the draft's question number", () => {
    const r = readSuggestions('```json\n{"answers":[{"q":2,"answer":3,"why":"Vì..."},{"q":1,"answer":1,"why":"はな"}]}\n```', qs);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual([
      { answer: 1, why: "はな" },
      { answer: 3, why: "Vì..." },
    ]);
  });

  it("drops answers outside the options or for unknown questions, and says when some are missing", () => {
    const r = readSuggestions('{"answers":[{"q":1,"answer":5},{"q":7,"answer":1},{"q":2,"answer":"2"}]}', qs);
    expect(r.ok).toBe(false);
    expect(r.value.map((s) => s.answer)).toEqual([0, 2]);
  });

  it("survives an answer that is not JSON", () => {
    expect(readSuggestions("I think the answer is 2.", qs)).toEqual({ value: [{ answer: 0, why: "" }, { answer: 0, why: "" }], ok: false });
  });
});
