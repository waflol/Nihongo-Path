import { describe, expect, it } from "vitest";
import { parseVerify } from "./ai-benchmark.js";

describe("vocabulary check answer parser", () => {
  it("reads the fixes by id, upper-cases Hán Việt and drops empty fields", () => {
    const m = parseVerify('{"items":[{"id":2,"readingFix":"けいざい","hanVietFix":"kinh tế","meaningFix":""}]}');
    expect(m.get(2)).toEqual({ reading: "けいざい", hanViet: "KINH TẾ", meaning: undefined });
  });
  it("returns an empty map for an unreadable answer", () => {
    expect(parseVerify("sorry").size).toBe(0);
  });
});
