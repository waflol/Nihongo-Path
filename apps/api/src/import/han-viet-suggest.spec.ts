import { afterEach, describe, expect, it } from "vitest";
import { checkHanViet, correctHanViet, setKanjiHanViet, suggestHanViet } from "./han-viet-suggest.js";

describe("Hán Việt from the kanji admin data", () => {
  afterEach(() => setKanjiHanViet({}));

  it("fills a blank cell kanji by kanji from the kanji data", () => {
    setKanjiHanViet({ 洗: "tẩy", 練: "luyện" });
    expect(suggestHanViet("洗練")).toBe("TẨY LUYỆN");
  });

  it("the kanji data wins over the bundled table", () => {
    setKanjiHanViet({ 学: "học/hạc" });
    expect(suggestHanViet("学")).toBe("HỌC");
    expect(checkHanViet("学", "hạc")).toBeNull(); // an alternative reading is fine
  });

  it("corrects a wrong syllable, keeps a valid alternative", () => {
    setKanjiHanViet({ 行: "hành/hạnh/hàng", 動: "động" });
    expect(correctHanViet("行動", "hạnh dộng")).toBe("HẠNH ĐỘNG"); // 行 kept, 動 fixed
    expect(correctHanViet("行動", "xyz động")).toBe("HÀNH ĐỘNG"); // 行 wrong → main reading
  });

  it("rebuilds the reading when the syllable count is wrong", () => {
    setKanjiHanViet({ 洗: "tẩy", 練: "luyện" });
    expect(correctHanViet("洗練", "tẩy")).toBe("TẨY LUYỆN");
  });

  it("cannot decide when a kanji is unknown or the word has none", () => {
    setKanjiHanViet({ 洗: "tẩy" });
    expect(correctHanViet("洗練", "tẩy luyện")).toBeNull();
    expect(correctHanViet("ねこ", "mèo")).toBeNull();
  });
});
