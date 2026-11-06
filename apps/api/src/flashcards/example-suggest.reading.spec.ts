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

describe("ExampleSuggestService.checkAiSentence (why an AI sentence is not used)", () => {
  const check = svc as unknown as {
    checkAiSentence: (term: string, reading: string | undefined, s: string) => Promise<{ ok: boolean; reason: string }>;
  };
  const noToken = new ExampleSuggestService({ tokens: async () => [] } as never) as unknown as typeof check;

  it("accepts a sentence that contains the word", async () => {
    expect((await noToken.checkAiSentence("信任", undefined, "彼は信任を得た。")).ok).toBe(true);
  });

  it("accepts a sentence that contains the card's reading", async () => {
    expect((await noToken.checkAiSentence("中程", "【なかほど】", "道のなかほどで止まる。")).ok).toBe(true);
  });

  it("explains a sentence that dropped the word", async () => {
    const r = await noToken.checkAiSentence("偶像", "ぐうぞう", "彼女は私のアイドルだ。");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("偶像");
  });

  it("explains an empty or too long sentence", async () => {
    expect((await noToken.checkAiSentence("犬", undefined, "")).reason).toMatch(/không trả về/);
    expect((await noToken.checkAiSentence("犬", undefined, "あ".repeat(41))).reason).toMatch(/quá dài/);
  });
});
