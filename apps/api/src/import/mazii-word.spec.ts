import { describe, expect, it } from "vitest";
import { labelToParts, parseMaziiWord, parseMaziiWordHtml } from "./mazii-word.js";

const entry = (word: string, extra: Record<string, unknown>) => ({ word, phonetic: "x", pronunciation: [], synsets: [], means: [], ...extra });

describe("parseMaziiWord", () => {
  it("乱暴: な-adjective, noun and する-noun from the sense tags, in order", () => {
    const r = parseMaziiWord("乱暴", {
      found: true,
      data: [entry("乱暴", { phonetic: "らんぼう", means: [{ mean: "bạo loạn", kind: "adj-na, n, vs" }, { mean: "thô lỗ", kind: "adj-na, n, vs" }] })],
    });
    expect(r?.parts).toEqual(["adjective-na", "noun", "noun-suru"]);
    expect(r?.readings).toEqual(["らんぼう"]);
    expect(r?.means).toEqual(["bạo loạn", "thô lỗ"]);
  });

  it("verbs and い-adjectives", () => {
    expect(parseMaziiWord("引き合う", { data: [entry("引き合う", { means: [{ mean: "a", kind: "v5u, vi" }] })] })?.parts).toEqual(["verb"]);
    expect(parseMaziiWord("ありがたい", { data: [entry("ありがたい", { means: [{ mean: "a", kind: "adj-i" }] })] })?.parts).toEqual(["adjective"]);
  });

  it("a fuzzy hit for another word is not found", () => {
    expect(parseMaziiWord("引き合う", { data: [entry("引き合い", { means: [{ mean: "a", kind: "n" }] })] })).toBeNull();
    expect(parseMaziiWord("x", { found: false })).toBeNull();
  });

  it("no sense tags: falls back to the entry's part of speech; null senses are fine", () => {
    const r = parseMaziiWord("猫", { data: [entry("猫", { means: null, synsets: [{ pos: "noun", base_form: "猫" }] })] });
    expect(r?.parts).toEqual(["noun"]);
  });
});

const page = (head: string, blocks: string) =>
  `<h1 _ngcontent-x="" class="main-word japanese-char mb-0"> ${head} </h1><span class="phonetic-word japanese-char "><img alt="a"> ねこ <img alt="b"></span><p class="han-viet-word "> MIÊU</p>${blocks}`;
const block = (type: string, means: string[]) =>
  `<div class="mean-detail-range box-section "><div class="header-mean-detail"><div class="type-word"><img alt="kind"> ${type} </div></div>${means.map((m) => `<h4 class="mean-word h6 mb-0">${m}</h4>`).join("")}</div>`;

describe("parseMaziiWordHtml", () => {
  it("reads headword, reading, .type-word and .mean-word", () => {
    const r = parseMaziiWordHtml("猫", page("猫", block("Danh từ", ["Mèo"])));
    expect(r).toMatchObject({ readings: ["ねこ"], means: ["Mèo"], parts: ["noun"], han: "MIÊU" });
  });
  it("a kana word opens its kanji entry", () => {
    expect(parseMaziiWordHtml("ねこ", page("猫", block("Danh từ", ["Mèo"])))?.means).toEqual(["Mèo"]);
    expect(parseMaziiWordHtml("いぬ", page("猫", block("Danh từ", ["Mèo"])))).toBeNull();
  });
  it("an empty app shell is undefined, a page for another word is null", () => {
    expect(parseMaziiWordHtml("乱暴", "<app-root></app-root>")).toBeUndefined();
    expect(parseMaziiWordHtml("猫", page("犬", block("Danh từ", ["Chó"])))).toBeNull();
  });
});

describe("parseMaziiWordHtml: several readings", () => {
  const list = (head: string, rs: string[]) =>
    `<button class="content-item-word btn selected "><span><div><p class="txt-word japanese-char ">${head}</p></div></span><div class="box-phonetic-list ">${rs.map((r) => `<button type="button" class="btn phonetic-item japanese-char ">${r}</button>`).join("")}</div></button>`;
  it("年月 has としつき and ねんげつ", () => {
    const r = parseMaziiWordHtml("年月", page("年月", block("Danh từ", ["Năm tháng"])).replace("ねこ", "としつき") + list("年月", ["としつき", "ねんげつ"]) + list("年月日", ["ねんがっぴ"]));
    expect(r?.readings).toEqual(["としつき", "ねんげつ"]);
  });
});

describe("labelToParts", () => {
  it("maps Mazii's Vietnamese labels", () => {
    expect(labelToParts("Danh từ")).toEqual(["noun"]);
    expect(labelToParts("Tính từ đuôi な, Danh từ, Danh động từ")).toEqual(["adjective-na", "noun", "noun-suru"]);
    expect(labelToParts("Động từ suru - cổ, tự động từ")).toEqual(["verb"]);
    expect(labelToParts("Tính từ đuôi い")).toEqual(["adjective"]);
    expect(labelToParts("Động từ nhóm 1")).toEqual(["verb"]);
    expect(labelToParts("Cụm từ")).toEqual(["phrase"]);
  });
});

describe("parseMaziiWord with a kana word", () => {
  it("matches entries read as the word", () => {
    const r = parseMaziiWord("ありがたい", { data: [entry("有難い", { phonetic: "ありがたい", means: [{ mean: "biết ơn", kind: "adj-i" }] }), entry("別", { phonetic: "べつ" })] });
    expect(r).toMatchObject({ parts: ["adjective"], means: ["biết ơn"] });
  });
  it("a kanji word never matches by reading alone", () => {
    expect(parseMaziiWord("有難い", { data: [entry("別", { phonetic: "有難い" })] })).toBeNull();
  });
});
