import { describe, expect, it } from "vitest";
import { optionOrder, seededOrder } from "./shuffle.js";

/**
 * T-P4-01: shuffle 1000 times → the answer always stays findable.
 *
 * The invariant is NOT "the answer index is preserved" (it isn't — the whole
 * point is the options move). It is: after any shuffle, the original bank
 * index of the correct option maps to EXACTLY ONE served position, and
 * recovering it through `optionOrder` returns the original index.
 */
describe("seededOrder", () => {
  it("is a permutation for any seed", () => {
    for (const seed of [0, 1, 42, 12345, 0x7fffffff]) {
      const out = seededOrder(seed, 4);
      expect(out).toHaveLength(4);
      expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    }
  });

  it("is deterministic (same seed → same order)", () => {
    expect(seededOrder(7, 6)).toEqual(seededOrder(7, 6));
  });

  it("differs across seeds (with high probability)", () => {
    const a = seededOrder(1, 8);
    const b = seededOrder(2, 8);
    expect(a).not.toEqual(b);
  });

  it("handles n<=1 as the identity", () => {
    expect(seededOrder(1, 0)).toEqual([]);
    expect(seededOrder(1, 1)).toEqual([0]);
  });

  it("keeps the correct answer reachable after 1000 shuffles (T-P4-01)", () => {
    // Bank option list with the correct answer at original index 2.
    const options = ["a", "b", "CORRECT", "d"];
    const answerIndex = options.indexOf("CORRECT");
    expect(answerIndex).toBe(2);

    for (let seed = 0; seed < 1000; seed += 1) {
      // `served[p]` = the original option index shown at served position `p`.
      const served = optionOrder(seed, "q-1", options.length, true);
      // Exactly one position maps to the correct original index.
      expect(served.filter((v) => v === answerIndex)).toHaveLength(1);
      const shown = served.map((origIdx) => options[origIdx]);
      // The correct option is still among the four, and sits at the position
      // whose original index is the answer's.
      expect(shown).toContain("CORRECT");
      expect(shown[served.indexOf(answerIndex)]).toBe("CORRECT");
    }
  });
});

describe("optionOrder", () => {
  it("is the identity when options are not shuffled", () => {
    expect(optionOrder(99, "q-1", 4, false)).toEqual([0, 1, 2, 3]);
  });

  it("is the identity for <2 options", () => {
    expect(optionOrder(99, "q-1", 1, true)).toEqual([0]);
  });

  it("varies with the question id (same count, different qid)", () => {
    const a = optionOrder(5, "q-A", 4, true);
    const b = optionOrder(5, "q-B", 4, true);
    expect(a).not.toEqual(b);
  });

  it("always covers every original index exactly once", () => {
    for (const seed of [0, 1, 999, 0x7fffffff]) {
      const served = optionOrder(seed, "q-X", 4, true);
      expect([...served].sort((x, y) => x - y)).toEqual([0, 1, 2, 3]);
    }
  });
});
