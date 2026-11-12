import { describe, expect, it } from "vitest";
import { parsePronounce } from "./ai-benchmark.js";

describe("pronunciation answer parser", () => {
  it("parses the batched answer by id", () => {
    const m = parsePronounce('{"items":[{"id":2,"reading":"きょう","romaji":"kyō","viet":"kyo:","words":[],"tips":["x"]}]}');
    expect(m.get(2)?.reading).toBe("きょう");
    expect(m.get(2)?.tips).toEqual(["x"]);
    expect(parsePronounce("not json").size).toBe(0);
  });});
