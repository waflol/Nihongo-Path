import { describe, expect, it } from "vitest";
import { parseMaziiKanjiHtml } from "./mazii-kanji.js";

const span = (k: string, t: string) => `<span class="txt-item txt-${k} japanese-char mx-1 ng-star-inserted">${t}</span>`;

describe("parseMaziiKanjiHtml", () => {
  it("extracts multiple Hán Việt readings and on/kun from page HTML", () => {
    const html = `<h1 class="x">行 - HÀNH, HẠNH, HÀNG, HẠNG</h1><p class="han-viet-word box-section"><img alt="x"> HÀNH, HẠNH, HÀNG, HẠNG<img alt="y"></p>${span("kun", "い.く")}${span("kun", "ゆ.く")}${span("on", "コウ")}${span("on", "ギョウ")}${span("kun", "い.く")}`;
    expect(parseMaziiKanjiHtml("行", html)).toEqual({
      hanViet: "hành/hạnh/hàng/hạng",
      onyomi: ["コウ", "ギョウ"],
      kunyomi: ["い.く", "ゆ.く"],
    });
  });
  it("returns null for a different or missing entry", () => {
    expect(parseMaziiKanjiHtml("学", "<h1>行 - HÀNH</h1>")).toBeNull();
    expect(parseMaziiKanjiHtml("学", "<html></html>")).toBeNull();
  });
});
