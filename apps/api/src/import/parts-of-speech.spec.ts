import { describe, expect, it } from "vitest";
import { derivePartsOfSpeech, parsePartsOfSpeech, primaryPos } from "./parts-of-speech.js";

describe("parsePartsOfSpeech", () => {
  it("reads a single label in Vietnamese, Japanese or English", () => {
    expect(parsePartsOfSpeech("Danh từ").parts).toEqual(["noun"]);
    expect(parsePartsOfSpeech("動詞").parts).toEqual(["verb"]);
    expect(parsePartsOfSpeech("na-adjective").parts).toEqual(["adjective-na"]);
    expect(parsePartsOfSpeech("Tính từ い").parts).toEqual(["adjective"]);
    expect(parsePartsOfSpeech("Cụm từ").parts).toEqual(["phrase"]);
  });

  it("売り買い: noun that takes する", () => {
    for (const raw of ["Danh từ, Danh từ + する", "danh động từ", "名詞, サ変", "noun, noun+suru"]) {
      expect(parsePartsOfSpeech(raw).parts).toEqual(["noun", "noun-suru"]);
    }
  });

  it("乱暴: な-adjective, noun and noun that takes する, in source order", () => {
    expect(parsePartsOfSpeech("Tính từ đuôi な, Danh từ, Danh từ + suru").parts).toEqual(["adjective-na", "noun", "noun-suru"]);
    expect(parsePartsOfSpeech("Tính từ な / Danh từ / する動詞").parts).toEqual(["adjective-na", "noun", "noun-suru"]);
  });

  it("a する label alone still implies the noun", () => {
    expect(parsePartsOfSpeech("danh từ làm trợ từ cho động từ suru").parts).toEqual(["noun", "noun-suru"]);
  });

  it("does not mistake a plain verb for a する-noun", () => {
    expect(parsePartsOfSpeech("Động từ").parts).toEqual(["verb"]);
  });

  it("drops duplicates and reports labels it cannot read", () => {
    const r = parsePartsOfSpeech("Danh từ, danh từ, xyz");
    expect(r.parts).toEqual(["noun"]);
    expect(r.unknown).toEqual(["xyz"]);
  });

  it("blank → nothing", () => {
    expect(parsePartsOfSpeech("  ")).toEqual({ parts: [], unknown: [] });
    expect(parsePartsOfSpeech(undefined)).toEqual({ parts: [], unknown: [] });
  });
});

describe("primaryPos", () => {
  it("is the first part that is not the する flag", () => {
    expect(primaryPos(["adjective-na", "noun", "noun-suru"])).toBe("adjective-na");
    expect(primaryPos(["noun", "noun-suru"])).toBe("noun");
    expect(primaryPos([])).toBe("");
  });
});

describe("derivePartsOfSpeech", () => {
  const noun = (d: string) => [{ pos: "名詞", pos_detail_1: d }];
  it("adds する to a サ変 noun, keeping the stored primary part first", () => {
    expect(derivePartsOfSpeech("誤解", "noun", noun("サ変接続"))).toEqual(["noun", "noun-suru"]);
    expect(derivePartsOfSpeech("誤解", "", noun("サ変接続"))).toEqual(["noun", "noun-suru"]);
  });
  it("adds な-adjective to a stem that is stored as a noun", () => {
    expect(derivePartsOfSpeech("乱暴", "noun", noun("形容動詞語幹"))).toEqual(["noun", "adjective-na"]);
  });
  it("adds nothing when the word is not special or not a single kanji noun", () => {
    expect(derivePartsOfSpeech("猫", "noun", noun("一般"))).toBeNull();
    expect(derivePartsOfSpeech("乱暴", "adjective-na", noun("形容動詞語幹"))).toBeNull();
    expect(derivePartsOfSpeech("買い物", "noun", noun("サ変接続"))).toBeNull();
    expect(derivePartsOfSpeech("誤解", "noun", [...noun("サ変接続"), ...noun("一般")])).toBeNull();
  });
});
