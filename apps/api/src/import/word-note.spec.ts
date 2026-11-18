import { describe, expect, it } from "vitest";
import { splitVariants, splitWordNote } from "./word-note.js";

// A tiny stand-in for the analyser: the reading of each word the cases use.
const READ: Record<string, string> = {
  成績が上がる: "せいせきがあがる",
  腕を上げる: "うでをあげる",
  例をあげる: "れいをあげる",
  手間がかかる: "てまがかかる",
  エンジンがかかる: "えんじんがかかる",
  皿を下げる: "さらをさげる",
  連絡を取る: "れんらくをとる",
};
const readingOf = async (t: string) => READ[t] ?? "";

describe("splitWordNote", () => {
  it("cuts a bracketed note", async () => {
    expect(await splitWordNote("成績が上がる(=よくなる高くなる)", "せいせきがあがる", readingOf)).toEqual({ word: "成績が上がる", note: "よくなる高くなる" });
    expect(await splitWordNote("手間がかかる(必要だ)", "てまがかかる", readingOf)).toEqual({ word: "手間がかかる", note: "必要だ" });
    expect(await splitWordNote("エンジンがかかる(=エンジンが動く)", "えんじんがかかる", readingOf)).toEqual({ word: "エンジンがかかる", note: "エンジンが動く" });
  });

  it("cuts a note whose brackets were lost, by the reading", async () => {
    expect(await splitWordNote("腕を上げる上手になる", "うでをあげる", readingOf)).toEqual({ word: "腕を上げる", note: "上手になる" });
    expect(await splitWordNote("例をあげる示す)", "れいをあげる", readingOf)).toEqual({ word: "例をあげる", note: "示す" });
    expect(await splitWordNote("連絡を取る連絡する)んらく", "れんらくをとる", readingOf)).toEqual({ word: "連絡を取る", note: "連絡するんらく" });
  });

  it("leaves a clean word alone", async () => {
    expect(await splitWordNote("皿を下げる", "さらをさげる", readingOf)).toEqual({ word: "皿を下げる", note: "" });
  });

  it("keeps a ・ that belongs to the note", async () => {
    const r = await splitWordNote("腕を上げる上手・器用", "うでをあげる", readingOf);
    expect(r).toEqual({ word: "腕を上げる", note: "上手・器用" });
  });

  it("flags what it cannot settle and does not touch it", async () => {
    const two = await splitWordNote("味がつく(= わる)・味をつける(=加える", "あじ が つ く・あじをつける(=くわえる", readingOf);
    expect(two.review).toMatch(/・/);
    expect(two.note).toBe("");
    expect(await splitWordNote("人気", "ひとけ", readingOf)).toEqual({ word: "人気", note: "" });
    const none = await splitWordNote("謎の言葉(=？)", "ふめい", readingOf);
    expect(none.review).toMatch(/không tách được/);
  });
});

describe("splitVariants", () => {
  it("splits two forms in one cell, reading split the same way", () => {
    expect(splitVariants("味がつく(= わる)・味をつける(=加える", "あじ が つ く・あじをつける(=くわえる")).toEqual([
      { front: "味がつく(= わる)", reading: "あじがつく" },
      { front: "味をつける(=加える", reading: "あじをつける" },
    ]);
  });
  it("is null for one word, a katakana compound, or columns that disagree", () => {
    expect(splitVariants("声をかける呼ぶ・誘う", "こえをかける")).toBeNull();
    expect(splitVariants("アイス・クリーム", "あいす・くりーむ")).toBeNull();
    expect(splitVariants("A・B", "え・び・し")).toBeNull();
  });
});
