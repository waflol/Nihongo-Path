import { describe, expect, it } from "vitest";
import { markToNumber, parseBrokenGrid, parseCompactKey } from "./answer-key.js";

/**
 * NP-407: the answer key is the most expensive part of an import to misread —
 * a wrong number must force a human review, never a guess. Mark-preserving
 * cleaning keeps `1①` (question 1, answer ①) distinct from `11`.
 */

describe("markToNumber", () => {
  it("①②③④ → 1..4, anything else → null", () => {
    expect(markToNumber("①")).toBe(1);
    expect(markToNumber("④")).toBe(4);
    expect(markToNumber("５")).toBeNull();
    expect(markToNumber("①②")).toBe(1); // first mark
    expect(markToNumber("x")).toBeNull();
  });
});

describe("parseCompactKey — the official collection form", () => {
  it("reads the heading + points + one answer line (with the count on its own)", () => {
    const key = parseCompactKey("問題Ⅰ 4x1 ( 4 点)\n1① 2④ 3① 4①")!;
    expect(key.heading).toContain("問題");
    expect(key.questionCount).toBe(4);
    expect(key.pointsPerQuestion).toBe(1);
    expect(key.totalPoints).toBe(4);
    expect(key.answers).toEqual([1, 4, 1, 1]);
  });

  it("reads a 2-point-per-question key and an inline heading line", () => {
    // The combined N3 collection puts the answers ON the heading line.
    const key = parseCompactKey("問題Ⅰ 3x1 ( 3 点) 1③ 2② 3③")!;
    expect(key.questionCount).toBe(3);
    expect(key.totalPoints).toBe(3);
    expect(key.answers).toEqual([3, 2, 3]);
  });

  it("returns null when no 問題 heading is present", () => {
    expect(parseCompactKey("1① 2④ 3①")).toBeNull();
  });

  it("an unreadable slot stays null — it is not a guess", () => {
    const key = parseCompactKey("問題Ⅱ 2x1 ( 2 点)\n1① 2")!;
    expect(key.answers).toEqual([1, null]);
  });

  it("multi-digit question numbers work", () => {
    const key = parseCompactKey("問題Ⅰ 8x2 ( 16 点)\n1① 2④ 10③ 9②")!;
    expect(key.questionCount).toBe(8);
    expect(key.totalPoints).toBe(16);
    expect(key.answers[0]).toBe(1); // Q1 → ①
    expect(key.answers[1]).toBe(4); // Q2 → ④
    expect(key.answers[9]).toBe(3); // Q10 → ③
    expect(key.answers[8]).toBe(2); // Q9 → ②
    expect(key.answers[2]).toBeNull(); // Q3 not printed → hole, not a guess
  });
});

describe("parseBrokenGrid — a scattered OCR grid (best effort)", () => {
  it("pairs a number with its mark, positionally fills bare marks", () => {
    const out = parseBrokenGrid(["1③", "②", "3①", "5④"]);
    expect(out).toEqual([3, 2, 1, null, 4]);
  });

  it("a bare number marks a slot that must be reviewed", () => {
    const out = parseBrokenGrid(["2", "3①"]);
    expect(out).toEqual([null, null, 1]); // slot 2 exists but has no mark
  });

  it("garbage cells open no slot — a bare mark fills the next free slot", () => {
    const out = parseBrokenGrid(["①", "###", "③"]);
    // `###` cannot be read as a question number, so it is dropped; ③ is the
    // second question, not the third.
    expect(out).toEqual([1, 3]);
  });

  it("an empty grid is an empty list of nulls", () => {
    expect(parseBrokenGrid([])).toEqual([]);
  });
});
