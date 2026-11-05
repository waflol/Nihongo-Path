import { describe, expect, it } from "vitest";
import { ExampleSuggestService } from "./example-suggest.service.js";
import { toHiragana } from "./reading.service.js";

/** A fake analyser: one token per call, the sentence 格別な味 → 格別 (かくべつ) + な + 味. */
const morph = {
  tokens: async () => [
    { surface_form: "格別", basic_form: "格別", pos: "名詞", reading: "カクベツ" },
    { surface_form: "な", basic_form: "だ", pos: "助動詞", reading: "ナ" },
  ],
};
const svc = new ExampleSuggestService(morph as never) as unknown as {
  usesWord: (
    sentence: string,
    termTokens: { surface_form: string; basic_form: string; pos: string }[],
    pos: "noun" | null,
    reading: string,
  ) => Promise<boolean>;
};
const term = [{ surface_form: "格別", basic_form: "格別", pos: "名詞" }];

describe("ExampleSuggestService reading check", () => {
  it("accepts the card's reading when the book wrote it in brackets", async () => {
    expect(toHiragana("カクベツ")).toBe("かくべつ");
    expect(await svc.usesWord("格別な味", term, "noun", "【かくべつ】")).toBe(true);
  });

  it("accepts any of several readings", async () => {
    expect(await svc.usesWord("格別な味", term, "noun", "かくべつ/かくへつ")).toBe(true);
    expect(await svc.usesWord("格別な味", term, "noun", "【かくべち】／【かくべつ】")).toBe(true);
  });

  it("still rejects a different reading (homograph guard stays on)", async () => {
    expect(await svc.usesWord("格別な味", term, "noun", "【ほかのよみ】")).toBe(false);
  });

  it("does not check the reading when the card has none", async () => {
    expect(await svc.usesWord("格別な味", term, "noun", "")).toBe(true);
  });
});
