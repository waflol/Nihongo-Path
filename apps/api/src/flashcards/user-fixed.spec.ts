import { describe, expect, it } from "vitest";
import { learnedVocab, userFixedFields } from "./flashcards.service.js";

const card = { reading: "chãi, ổn ちゃくちゃく", back: "đều đặn", hanViet: "TRƯỚC" };

describe("userFixedFields", () => {
  it("marks a field the person changed by hand, with or without a warning", () => {
    expect(userFixedFields(card, { ...card, reading: "ちゃくちゃく" })).toEqual(["reading"]);
    expect(userFixedFields(card, { ...card, back: "vững chắc" })).toEqual(["back"]);
  });

  it("ignores a field left unchanged", () => {
    expect(userFixedFields(card, { ...card, back: " đều đặn " })).toEqual([]);
  });

  it("does not count applying the check's own suggestion", () => {
    expect(userFixedFields(card, { ...card, reading: "ちゃくちゃく" }, "reading")).toEqual([]);
  });

  it("marks several fields at once", () => {
    expect(userFixedFields(card, { reading: "ちゃくちゃく", back: "vững chắc", hanViet: "TRƯỚC" })).toEqual(["reading", "back"]);
  });
});

describe("learnedVocab", () => {
  const norm = (t: string) => t.trim().toLowerCase();
  const meanings = [
    { reading: "にんき", meaning: "được yêu thích" },
    { reading: "ひとけ", meaning: "hơi người" },
  ];

  it("skips reading and meaning when both were learned", () => {
    expect(learnedVocab(["にんき"], ["にんき", "ひとけ"], "Được yêu thích", meanings, norm)).toEqual({ reading: true, meaning: true });
  });

  it("still checks the meaning when it is not a learned one", () => {
    expect(learnedVocab(["にんき"], ["にんき"], "nổi tiếng", meanings, norm)).toEqual({ reading: true, meaning: false });
  });

  it("checks everything when any reading on the card was not learned", () => {
    expect(learnedVocab(["にんき", "じんき"], ["にんき"], "được yêu thích", meanings, norm)).toEqual({ reading: false, meaning: false });
    expect(learnedVocab([], [], "", [], norm)).toEqual({ reading: false, meaning: false });
  });
});
