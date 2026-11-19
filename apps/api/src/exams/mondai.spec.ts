import { describe, expect, it } from "vitest";
import {
  classifyInstruction,
  contentHashOf,
  normalizeInstruction,
  optionCountsOf,
  SECTION_OF,
  USES_STIMULUS,
} from "./mondai.js";

/**
 * NP-406: the 問題-type taxonomy is the heart of the question bank — every
 * imported question gets a standard code from its INSTRUCTION, not its
 * printed number (D3). These instructions are SELF-AUTHORED in the layout of
 * real papers; the repo is public, so no real exam content here (plan §8.1).
 */

describe("normalizeInstruction", () => {
  it("strips whitespace and maps fullwidth forms to ASCII", () => {
    expect(normalizeInstruction("次の文の（　）に入れるのに最もよいもの")).toBe("次の文の()に入れるのに最もよいもの");
    expect(normalizeInstruction("（ 1 ） から （ 5 ）")).toBe("(1)から(5)");
    // NFKC unifies the fullwidth ７ → 7.
    expect(normalizeInstruction("問 題 ７")).toBe("問題7");
  });
});

describe("classifyInstruction — vocab block", () => {
  it("kanji-reading: 「読み方として」 (with + without spaces)", () => {
    const text = "次の漢字の読み方として最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "vocab" })).toBe("kanji-reading");
    expect(classifyInstruction(text.replace("読み方", "読  み方"), "N3", { section: "vocab" })).toBe("kanji-reading");
  });

  it("orthography: 「漢字で書くとき」", () => {
    const text = "次の文の（　）に最も適している漢字で書くとき、１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "vocab" })).toBe("orthography");
    expect(classifyInstruction(text, "N5", { section: "vocab" })).toBe("orthography");
  });

  it("paraphrase: 「意味が最も近いもの」", () => {
    const text = "次の語の意味が最も近いものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "vocab" })).toBe("paraphrase");
    expect(classifyInstruction(text.replace("最も", "最 も"), "N3", { section: "vocab" })).toBe("paraphrase");
  });

  it("usage: 「使い方として」", () => {
    const text = "次の語の使い方として最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "vocab" })).toBe("usage");
    expect(classifyInstruction(text, "N1", { section: "vocab" })).toBe("usage");
  });

  it("context: 「に入れるのに最もよいもの」 in the vocab block (N3 style)", () => {
    const text = "（　）に入れるのに最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "vocab" })).toBe("context");
    const fullWidth = "（　）に入れるのに最もよいものを １ から ４ のうちから一つえらべ。";
    expect(classifyInstruction(fullWidth, "N3", { section: "vocab" })).toBe("context");
  });

  it("word-formation: 「語形成」 (N2/N1 layout)", () => {
    const text = "次の語の語形成について、最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N2", { section: "vocab" })).toBe("word-formation");
    // N2/N1: the bare blank-fill right after orthography is word-formation.
    expect(classifyInstruction("（　）に入れる漢字を１から４のうちから一つえらべ。", "N1", { section: "vocab" })).toBe("word-formation");
    // But the same bare fill at N3 is NOT word-formation (it is 問題4 in N3: no marker) → null.
    expect(classifyInstruction("（　）に入れる漢字を１から４のうちから一つえらべ。", "N3", { section: "vocab" })).toBeNull();
  });
});

describe("classifyInstruction — grammar block", () => {
  it("grammar-form: 「次の文の（）に入れる」", () => {
    const text = "次の文の（　）には何がはいりますか。１から４のうちから最もよいものをえらべ。";
    expect(classifyInstruction(text, "N3", { section: "grammar" })).toBeNull(); // no 「に入れる」 marker
    const canonical = "次の文の（　）に入れるのに最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(canonical, "N3", { section: "grammar" })).toBe("grammar-form");
    expect(classifyInstruction(canonical, "N5", { section: "grammar" })).toBe("grammar-form");
  });

  it("star-order: 「★」 + 「最もよいもの」", () => {
    const text = "次の文の（　★　）には、次に示すもののうち、文を完成するために最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "grammar" })).toBe("star-order");
    const spaced = "（★）に入れるものに最もよいものを １ から ４ のうちから一つえらべ。";
    expect(classifyInstruction(spaced, "N3", { section: "grammar" })).toBe("star-order");
  });

  it("text-grammar: 「文章全体の内容を考えて」", () => {
    const text = "次の文章全体の内容を考えて、文章中の（　）に入れるのに最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "grammar" })).toBe("text-grammar");
    expect(classifyInstruction(text, "N2", { section: "grammar" })).toBe("text-grammar");
  });
});

describe("classifyInstruction — reading block", () => {
  it("reading-short: 「次の(1)から(4)」 with a short passage", () => {
    const text = "次の(1)から(4)の文章を読み、それぞれの問いに対して最もよい答えを１から４のうちから一つえらべ。";
    expect(classifyInstruction(text, "N3", { section: "reading" })).toBe("reading-short");
    const alt = "次の(1)から(5)の文章を読み、それぞれの問いに対して最もよい答えを１から４のうちから一つえらべ。";
    expect(classifyInstruction(alt, "N3", { section: "reading" })).toBe("reading-short");
  });

  it("reading-mid: 「次の(1)から(3)」 / 「(1)と(2)」", () => {
    expect(classifyInstruction("次の(1)から(3)の文章を読み、問いに答えよ。", "N3", { section: "reading" })).toBe("reading-mid");
    expect(classifyInstruction("次の(1)と(2)の文章を読み、問いに答えよ。", "N3", { section: "reading" })).toBe("reading-mid");
  });

  it("reading-long: 「次の文章を読んで」", () => {
    expect(classifyInstruction("次の文章を読んで、問いに答えよ。", "N3", { section: "reading" })).toBe("reading-long");
    // N1/N2 + 文を読んで is the thematic (argumentative-essay) form.
    expect(classifyInstruction("次の文を読んで、問いに答えよ。", "N2", { section: "reading" })).toBe("reading-thematic");
    expect(classifyInstruction("次の文を読んで、問いに答えよ。", "N5", { section: "reading" })).toBeNull();
  });

  it("reading-thematic: N1/N2 long argumentative essay", () => {
    expect(classifyInstruction("次の長文を読んで、問いに答えよ。", "N1", { section: "reading" })).toBe("reading-thematic");
    expect(classifyInstruction("次の長文を読んで、問いに答えよ。", "N3", { section: "reading" })).toBeNull();
  });

  it("reading-integrated: 「AとB」 two passages", () => {
    expect(classifyInstruction("次のAとBの文章を読み、問いに答えよ。", "N3", { section: "reading" })).toBe("reading-integrated");
  });

  it("info-retrieval: notice / table pages", () => {
    expect(classifyInstruction("次のページは、レストランのメニューです。これを読んで、問いに答えよ。", "N3", { section: "reading" })).toBe("info-retrieval");
    expect(classifyInstruction("右のページを読んで、問いに答えよ。", "N2", { section: "reading" })).toBe("info-retrieval");
  });
});

describe("classifyInstruction — unknown → null", () => {
  it("returns null for instructions matching no known form", () => {
    expect(classifyInstruction("これは何ですか。", "N3", { section: "vocab" })).toBeNull();
    expect(classifyInstruction("", "N3")).toBeNull();
    expect(classifyInstruction(undefined as unknown as string, "N3")).toBeNull();
  });

  it("listening section classifies as the listening type", () => {
    expect(classifyInstruction("音声を確認してください", "N3", { section: "listening" })).toBe("listening");
  });

  it("no block hint falls through to a family priority", () => {
    // Same text, no hint: the reading family is tried first, then grammar, then vocab.
    const grammarText = "次の文の（　）に入れるのに最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(grammarText, "N3")).toBe("grammar-form");
    const vocabText = "次の語の使い方として最もよいものを１から４のうちから一つえらべ。";
    expect(classifyInstruction(vocabText, "N3")).toBe("usage");
  });
});

describe("the taxonomy tables are total and consistent", () => {
  it("every type maps to exactly one section and a stable stimulus flag", () => {
    for (const m of Object.keys(USES_STIMULUS)) {
      expect(SECTION_OF[m as keyof typeof SECTION_OF]).toBeTypeOf("string");
      expect(USES_STIMULUS[m as keyof typeof USES_STIMULUS]).toBeTypeOf("boolean");
    }
    // Grammar / reading types use a stimulus; vocab types never do.
    expect(USES_STIMULUS["text-grammar"]).toBe(true);
    expect(USES_STIMULUS["kanji-reading"]).toBe(false);
    expect(SECTION_OF["reading-mid"]).toBe("reading");
    expect(SECTION_OF["star-order"]).toBe("grammar");
  });

  it("option counts: 4 for printed types, 3-or-4 for listening", () => {
    expect(optionCountsOf("kanji-reading")).toEqual([4]);
    expect(optionCountsOf("grammar-form")).toEqual([4]);
    expect(optionCountsOf("listening")).toEqual([3, 4]);
    expect(optionCountsOf(null)).toEqual([4]); // legacy / untyped
  });
});

describe("contentHashOf — cross-source dedup", () => {
  it("the same content under different sources/spacing → the same hash", () => {
    const h1 = contentHashOf("毎朝、公園を散歩します。", ["散歩", "散歩する", "行きます", "行く"]);
    const h2 = contentHashOf("毎朝、 公園を散歩します。", ["行く", "行きます", "散歩", "散歩する"]); // reordered options
    expect(h1).toBe(h2);
  });

  it("a different option set → a different hash", () => {
    const a = contentHashOf("猫", ["ねこ", "くま", "さけ", "わか"]);
    const b = contentHashOf("猫", ["ねこ", "くま", "さけ", "ひょう"]);
    expect(a).not.toBe(b);
  });
});
