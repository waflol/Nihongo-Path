import { describe, expect, it } from "vitest";
import { parseVerify, scoreVerify, VERIFY_ITEMS } from "./ai-benchmark.js";

/** Answer that fixes every wrong field exactly and leaves the right ones alone. */
const perfect = () =>
  JSON.stringify({
    items: VERIFY_ITEMS.map((c, i) => ({
      id: i + 1,
      readingFix: c.fix.reading ?? "",
      hanVietFix: c.fix.hanViet ?? "",
      meaningFix: c.fix.meaning?.[0] ?? "",
    })),
  });

describe("verify benchmark", () => {
  it("scores 100 for a model that fixes exactly the wrong fields", () => {
    const r = scoreVerify(parseVerify(perfect()), 10);
    expect(r.accuracy).toBe(100);
    expect(r.verifyFix).toBe(100);
    expect(r.verifyKeep).toBe(100);
  });

  it("scores the right fields 0 when the model 'corrects' everything", () => {
    const all = JSON.stringify({ items: VERIFY_ITEMS.map((_, i) => ({ id: i + 1, readingFix: "ああ", hanVietFix: "X", meaningFix: "y" })) });
    const r = scoreVerify(parseVerify(all), 10);
    expect(r.verifyKeep).toBe(0);
    expect(r.verifyFix).toBe(0);
  });

  it("scores the wrong fields 0 when the model finds nothing", () => {
    const r = scoreVerify(parseVerify('{"items":[{"id":1,"readingFix":"","hanVietFix":"","meaningFix":""}]}'), 10);
    expect(r.verifyFix).toBe(0);
    expect(r.verifyKeep).toBe(100);
    expect(r.answered).toBe(1);
  });

  it("returns an empty map for an unreadable answer", () => {
    expect(parseVerify("sorry").size).toBe(0);
  });
});
