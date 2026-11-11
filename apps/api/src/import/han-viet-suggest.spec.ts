import { afterEach, describe, expect, it } from "vitest";
import { checkHanViet, correctHanViet, correctHanVietPartial, fixKi, harmonizeHanViet, setKanjiHanViet, suggestHanViet } from "./han-viet-suggest.js";

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

describe("ký → kí", () => {
  it("always rewrites a lone ký syllable, keeping case and tone family", () => {
    expect(fixKi("ký")).toBe("kí");
    expect(fixKi("KÝ")).toBe("KÍ");
    expect(fixKi("kỳ")).toBe("kì");
    expect(fixKi("kỵ")).toBe("kị");
    expect(fixKi("kính")).toBe("kính"); // other syllables untouched
    expect(fixKi("lý")).toBe("lý");
  });
  it("overrides the kanji table's ký and treats both spellings as the same reading", () => {
    setKanjiHanViet({ 寄: "ký", 附: "phụ" });
    expect(checkHanViet("寄附", "ký phụ")).toBeNull();
    expect(checkHanViet("寄附", "kí phụ")).toBeNull();
    expect(suggestHanViet("寄附")).toBe("KÍ PHỤ");
    expect(correctHanViet("寄附", "kí phụ")).toBe("KÍ PHỤ");
    expect(harmonizeHanViet("寄附", "ký phụ")).toBe("kí phụ");
    expect(harmonizeHanViet("寄附", "KÝ PHỤ")).toBe("KÍ PHỤ");
  });
  it("applies even when the kanji is not in the table or the count differs", () => {
    setKanjiHanViet({});
    expect(harmonizeHanViet("寄附", "ký phụ")).toBe("kí phụ");
    expect(harmonizeHanViet("寄附", "KÝ")).toBe("KÍ");
  });
});

describe("correctHanVietPartial", () => {
  it("fixes the syllables the table knows and keeps those of unknown kanji", () => {
    setKanjiHanViet({ 置: "trí" });
    expect(correctHanVietPartial("措置", "thố bị")).toBe("thố TRÍ"); // 措 unknown: kept; 置 → TRÍ
    expect(correctHanVietPartial("措置", "thố")).toBeNull(); // cannot line the syllables up
    expect(correctHanVietPartial("ねこ", "mèo")).toBeNull();
  });
});
