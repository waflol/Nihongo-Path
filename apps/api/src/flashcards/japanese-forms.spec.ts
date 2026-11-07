import { describe, expect, it } from "vitest";
import { sentenceUsesForm } from "./japanese-forms.js";

const v = (s: string, t: string) => sentenceUsesForm(s, t, "verb");
const a = (s: string, t: string) => sentenceUsesForm(s, t, "adjective");

describe("verb forms", () => {
  it.each([
    ["先生に褒められた。", "褒める"], // passive
    ["子供に野菜を食べさせる。", "食べる"], // causative
    ["嫌いな物を食べさせられた。", "食べる"], // causative-passive
    ["彼は刺身が食べられる。", "食べる"], // potential
    ["手紙を書かせた。", "書く"],
    ["手紙を書かれた。", "書く"],
    ["漢字が書ける。", "書く"], // godan potential
    ["昨日本を読んだ。", "読む"],
    ["友達と遊ばない。", "遊ぶ"],
    ["学校に行って来た。", "行く"],
    ["毎日勉強させられる。", "勉強する"],
    ["勉強されている。", "勉強する"],
    ["日本語が話せます。", "話す"],
    ["明日は本を持って来られない。", "持って来る"],
  ])("%s ← %s", (s, t) => {
    expect(v(s, t)).toBe(true);
  });

  it("rejects an unrelated verb", () => {
    expect(v("手紙を読んだ。", "書く")).toBe(false);
    expect(v("魚を飲んだ。", "読む")).toBe(false);
  });
});

describe("adjective forms", () => {
  it.each([
    ["この料理は美味しくない。", "美味しい"],
    ["美味しく食べた。", "美味しい"],
    ["美味しかった。", "美味しい"],
    ["美味しい料理。", "美味しい"],
    ["高さが分かる。", "高い"],
    ["今日はよくない。", "いい"],
  ])("%s ← %s", (s, t) => expect(a(s, t)).toBe(true));

  it("rejects another adjective", () => {
    expect(a("安くない。", "高い")).toBe(false);
  });
});
