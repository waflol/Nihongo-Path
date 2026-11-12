import { describe, expect, it } from "vitest";
import { userFixedFields } from "./flashcards.service.js";

const card = { reading: "chãi, ổn ちゃくちゃく", back: "đều đặn", hanViet: "TRƯỚC" };

describe("userFixedFields", () => {
  it("marks a warned field the person changed by hand", () => {
    expect(userFixedFields(card, { ...card, reading: "ちゃくちゃく" }, new Set(["reading"]))).toEqual(["reading"]);
  });

  it("ignores a field without a warning, or left unchanged", () => {
    expect(userFixedFields(card, { ...card, back: "vững chắc" }, new Set(["reading"]))).toEqual([]);
    expect(userFixedFields(card, { ...card }, new Set(["reading", "back"]))).toEqual([]);
  });

  it("does not count applying the check's own suggestion", () => {
    expect(userFixedFields(card, { ...card, reading: "ちゃくちゃく" }, new Set(["reading"]), "reading")).toEqual([]);
  });

  it("marks several fields at once", () => {
    expect(userFixedFields(card, { reading: "ちゃくちゃく", back: "vững chắc", hanViet: "TRƯỚC" }, new Set(["reading", "back", "hanViet"]))).toEqual(["reading", "back"]);
  });
});
