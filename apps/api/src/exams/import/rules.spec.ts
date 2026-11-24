import { describe, expect, it } from "vitest";
import { markCloze, parseByRules } from "./rules.js";
import { validateParsed } from "./structure.js";
import { mondaiByNumber, mondaiNumberOf, PartTracker, sheetsOf } from "./mondai-table.js";

describe("official 問題 table (jlpt.jp 大問のねらい)", () => {
  it("N2 has one sheet of 14 numbered 問題", () => {
    expect(sheetsOf("N2")).toBe(1);
    expect(mondaiByNumber("N2", 0, 1)).toBe("kanji-reading");
    expect(mondaiByNumber("N2", 0, 3)).toBe("word-formation");
    expect(mondaiByNumber("N2", 0, 8)).toBe("star-order");
    expect(mondaiByNumber("N2", 0, 12)).toBe("reading-integrated");
    expect(mondaiByNumber("N2", 0, 13)).toBe("reading-thematic");
    expect(mondaiByNumber("N2", 0, 14)).toBe("info-retrieval");
    expect(mondaiByNumber("N2", 0, 15)).toBeNull();
  });
  it("N1 has 13, with 長文 at 10 and no 表記 / 語形成", () => {
    expect(mondaiByNumber("N1", 0, 2)).toBe("context");
    expect(mondaiByNumber("N1", 0, 10)).toBe("reading-long");
    expect(mondaiByNumber("N1", 0, 13)).toBe("info-retrieval");
  });
  it("N3-N5 restart numbering on the second sheet; N5 has no 用法", () => {
    const t = new PartTracker(sheetsOf("N3"));
    const parts = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 6, 7].map((n) => t.next(n));
    expect(parts).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1]);
    expect(mondaiByNumber("N3", 1, 6)).toBe("reading-long");
    expect(mondaiByNumber("N4", 1, 6)).toBe("info-retrieval");
    expect(mondaiByNumber("N5", 0, 5)).toBeNull();
    expect(mondaiByNumber("N5", 0, 4)).toBe("paraphrase");
  });
  it("reads the printed number, Arabic or Roman", () => {
    expect(mondaiNumberOf("問題 12 次の文章を読んで")).toBe(12);
    expect(mondaiNumberOf("問題Ⅲ ( )に入れる")).toBe(3);
    expect(mondaiNumberOf("次の文章を読んで")).toBeNull();
  });
});

describe("parseByRules", () => {
  it("reads N) prompt + 4 inline options, positions not printed numbers", () => {
    const raw = ["28 )地味", "1 あ 2 い 3 う 4 え", "29 )長引く", "1 かか", "2 きき", "3 くく", "4 けけ", "【文字・語彙】", "(配点 1 点)"].join("\n");
    const p = parseByRules({ rawText: raw, mondai: "usage" });
    expect(p?.questions).toEqual([
      { no: 1, printedNo: 28, prompt: "地味", options: ["あ", "い", "う", "え"] },
      { no: 2, printedNo: 29, prompt: "長引く", options: ["かか", "きき", "くく", "けけ"] },
    ]);
  });
  it("skips the example box, keeps a multi-line ★ prompt, and a number inside an option", () => {
    const raw = [
      "( 問題例 )", "あそこで ★ は山田さんです。", "1 . テレビ 2 . 見ている 3 . を 4 . 人",
      "45 )今日は早く帰ってきたんです。", "★ から。", "1 よくない 2 20 ％です 3 もの 4 体調が",
    ].join("\n");
    const p = parseByRules({ rawText: raw, mondai: "star-order" });
    expect(p?.questions).toHaveLength(1);
    expect(p?.questions[0].prompt).toBe("今日は早く帰ってきたんです。\n★ から。");
    expect(p?.questions[0].options).toEqual(["よくない", "20 ％です", "もの", "体調が"]);
  });
  it("accepts `1 )` (a space before the bracket) as question 1, not as option 1", () => {
    const p = parseByRules({ rawText: "1 )花を見る。\n1 はな 2 は 3 ひ 4 み", mondai: "kanji-reading" });
    expect(p?.questions[0]).toMatchObject({ prompt: "花を見る。", options: ["はな", "は", "ひ", "み"] });
  });
  it("leaves passages and unreadable questions to the AI", () => {
    expect(parseByRules({ rawText: "1)x\n1 a 2 b 3 c 4 d", mondai: "reading-long" })).toBeNull();
    expect(parseByRules({ rawText: "1)x\n1 a 2 b", mondai: "context" })).toBeNull();
  });
});

describe("parseByRules — printed variants seen in a 34-paper collection", () => {
  it("no bracket after the number, `2.物語` options, glued `3.` marker and a number glued to 「", () => {
    const raw = [
      "11 部屋に入るときは、ドアを( )してください。", "1 プラス 2.ノック 3.サイン 4.カープ",
      "12 子供を( )様に育てるのは難しい。", "1 なぐらない 2.あまやかさない3.いじめない 4.しつけない",
      "15「お茶のおかわりは?」「もう、( )。」", "1 おまたせ 2.おかまいなく", "3.かしこまりました 4.ごえんりょなく",
    ].join("\n");
    const p = parseByRules({ rawText: raw, mondai: "context" });
    expect(p?.questions.map((q) => q.options)).toEqual([
      ["プラス", "ノック", "サイン", "カープ"],
      ["なぐらない", "あまやかさない", "いじめない", "しつけない"],
      ["おまたせ", "おかまいなく", "かしこまりました", "ごえんりょなく"],
    ]);
  });
  it("options that all start `1.` `2.` on their own line", () => {
    const p = parseByRules({ rawText: "6 この切符は、ゆうこうです。\n1.有好 2.優好 3.優効 4.有効", mondai: "orthography" });
    expect(p?.questions[0].options).toEqual(["有好", "優好", "優効", "有効"]);
  });
  it("drops page furniture inside a block", () => {
    const raw = "16 今週は忙しかった。\n1 のろのろ 2 のんびり 3 ぐるぐる 4 ぐっすりページ 4\nN2\n言語知識(文字・語彙・文法)・読解\n17 走るといい。\n1 あ 2 い 3 う 4 え";
    const p = parseByRules({ rawText: raw, mondai: "context" });
    expect(p?.questions).toHaveLength(2);
    expect(p?.questions[0].options[3]).toBe("ぐっすり");
  });
});

describe("parseByRules — 文章の文法 (cloze)", () => {
  const rawText = [
    "もくぜんかつやくオリンピックを目前にして、スポーツ選手たちの活躍がテレビなどで放送されている。",
    "しちょうしゃそれは視聴者をワクワク、ドキドキ、ハラハラさせて楽しませ、夢を与えてくれるものです。",
    "50 、私は楽しむよりも、選手たちの気持ちや体調が気になって 51",
    "のです。プレッシャーから押しつぶされそうになりがちな気持ちと戦っているせいか、疲れ 52 に見える人もいます。",
    "ファンへのサービスに気をつかわなくてもいいようにそっとしてあげられたら、と 54 のです。",
    "50)1 それで 2 そこで 3 それに 4 しかし",
    "51)1 心配することはない 2 心配ではいられない",
    "3 心配でならない 4 心配してはならない",
    "52)1 ぎみ 2 っぽい 3 がち 4 げ",
    "53)1 抜きで 2 かなわないが 3 まだしも 4 しょうがない",
    "54)1 思ってばかりいられない 2 思わねばならない",
    "3 思ってはならない 4 思わずにはいられない",
    "N2",
    "言語知識(文字・語彙・文法)・読解",
    "【読解】",
    "(配点 3点)",
  ].join("\n");

  it("reads the passage as one cloze stimulus and each blank as a question", () => {
    const parsed = parseByRules({ rawText, mondai: "text-grammar" })!;
    expect(parsed.stimuli).toHaveLength(1);
    expect(parsed.stimuli[0].kind).toBe("cloze");
    expect(parsed.stimuli[0].body).not.toContain("【読解】");
    expect(parsed.questions).toHaveLength(5);
    expect(parsed.questions.map((q) => [q.no, q.printedNo])).toEqual([[1, 50], [2, 51], [3, 52], [4, 53], [5, 54]]);
    expect(parsed.questions[1].options).toEqual(["心配することはない", "心配ではいられない", "心配でならない", "心配してはならない"]);
    expect(validateParsed(parsed, rawText, [4])).toEqual([]);
  });

  it("marks the blanks as [n] after validation", () => {
    const marked = markCloze(parseByRules({ rawText, mondai: "text-grammar" })!);
    expect(marked.stimuli[0].body).toContain("[50] 、私は");
    expect(marked.stimuli[0].body).toContain("気になって [51]");
    expect(marked.questions[0].prompt).toBe("[50]");
  });
});

describe("parseByRules — 読解 (passages + 55)… questions)", () => {
  const rawText = [
    "日本の観光地では、猿が人から食べ物を取る問題が起きている。",
    "建物の屋根の上にも猿たちがいる。",
    "55)「その中」は何を指しているか。",
    "1 建物 2 観光客 3 彫刻 4 猿たち",
    "56)この文章の内容に合うのはどれか。",
    "1 猿は人を恐れる",
    "2 猿は夜に活動する 3 猿は屋根にいる 4 猿は食べない",
    "次に、古い町の歴史について述べる。",
    "町は川のそばに作られた。",
    "57)町が作られた場所はどこか。",
    "1 山 2 海 3 川 4 谷",
    "＊注：町は小さい。",
  ].join("\n");

  it("splits passages, links questions, keeps a trailing footnote as notes", () => {
    const parsed = parseByRules({ rawText, mondai: "reading-mid" })!;
    expect(parsed.stimuli).toHaveLength(2);
    expect(parsed.stimuli[1].notes).toBe("＊注：町は小さい。");
    expect(parsed.questions.map((q) => q.stimulusKey)).toEqual(["s1", "s1", "s2"]);
    expect(parsed.questions[1].options).toHaveLength(4);
    expect(parsed.questions.map((q) => q.printedNo)).toEqual([55, 56, 57]); // the printed numbers are kept
    expect(parsed.questions[0].prompt).toBe("「その中」は何を指しているか。");
    expect(validateParsed(parsed, rawText, [4])).toEqual([]);
  });

  it("leaves the A/B integrated form to the AI", () => {
    expect(parseByRules({ rawText, mondai: "reading-integrated" })).toBeNull();
  });
});
