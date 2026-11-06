import { describe, expect, it } from "vitest";
import { lostKanji } from "./ai-example.service.js";

describe("lostKanji (OCR copied the reading into the word column)", () => {
  it("flags a kana word equal to its reading that has a Hán Việt reading", () => {
    expect(lostKanji({ word: "こうどう", reading: "こうどう", hanViet: "HÀNH ĐỘNG" })).toBe(true);
    expect(lostKanji({ word: "コウドウ", reading: "こうどう", hanViet: "HÀNH ĐỘNG" })).toBe(true);
  });

  it("keeps real kanji words and genuine kana words", () => {
    expect(lostKanji({ word: "行動", reading: "こうどう", hanViet: "HÀNH ĐỘNG" })).toBe(false);
    expect(lostKanji({ word: "きっかけ", reading: "きっかけ", hanViet: "" })).toBe(false);
    expect(lostKanji({ word: "ひも", reading: "ひも" })).toBe(false);
  });
});
