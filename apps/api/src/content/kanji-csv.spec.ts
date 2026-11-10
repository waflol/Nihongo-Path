import { describe, expect, it } from "vitest";
import { KanjiService } from "./kanji.service.js";

/** A tiny in-memory stand-in for the Mongoose model: just what export/import touch. */
function fakeModel(docs: Record<string, unknown>[]) {
  const store = new Map(docs.map((d) => [d.char as string, d]));
  return {
    store,
    find: () => ({ sort: () => ({ lean: () => ({ exec: async () => [...store.values()] }) }) }),
    bulkWrite: async (ops: { updateOne: { filter: { char: string }; update: { $set: Record<string, unknown> } } }[]) => {
      let upserted = 0;
      let matched = 0;
      for (const { updateOne: u } of ops) {
        const cur = store.get(u.filter.char);
        if (cur) {
          matched++;
          Object.assign(cur, u.update.$set);
        } else {
          upserted++;
          store.set(u.filter.char, { char: u.filter.char, ...u.update.$set });
        }
      }
      return { upsertedCount: upserted, matchedCount: matched };
    },
  };
}

const svc = (m: ReturnType<typeof fakeModel>) =>
  new KanjiService(m as never, {} as never, {} as never, {} as never);

const sample = {
  char: "学", level: "N5", rank: 5, status: "PUBLISHED", hanViet: "học", hanVietNorm: "hoc",
  onyomi: ["がく"], kunyomi: ["まな.ぶ"], strokeCount: 8, meanings: ["học tập", "nghiên cứu"],
  meaningsEn: ["study"], mnemonic: 'Đứa trẻ, "học" bài\nmỗi ngày', radicals: ["子"],
  words: [{ term: "学生", reading: "がくせい", meaning: "học sinh", chars: ["学", "生"] }],
  strokes: ["M1,2 L3,4", "M5,6"], source: "admin", strokeCredit: "KanjiVG", lang: "vi",
};

describe("kanji Excel / CSV backup", () => {
  it("round-trips every field through the Excel export → import into an empty database", async () => {
    const xlsx = await svc(fakeModel([sample, { ...sample, char: "校", words: [], strokes: [], mnemonic: "" }])).exportXlsx();
    expect([xlsx[0], xlsx[1]]).toEqual([0x50, 0x4b]); // a ZIP / xlsx container

    const target = fakeModel([]);
    const res = await svc(target).importFile(xlsx);
    expect(res).toMatchObject({ rows: 2, created: 2, updated: 0, skipped: 0 });
    const got = target.store.get("学") as Record<string, unknown>;
    expect(got).toMatchObject({
      level: "N5", rank: 5, status: "PUBLISHED", hanViet: "học", onyomi: ["がく"], kunyomi: ["まな.ぶ"],
      strokeCount: 8, meanings: ["học tập", "nghiên cứu"], mnemonic: sample.mnemonic, radicals: ["子"],
      strokes: sample.strokes, source: "admin", lang: "vi",
    });
    expect((got.words as { term: string; reading: string; meaning: string }[])[0]).toMatchObject({
      term: "学生", reading: "がくせい", meaning: "học sinh",
    });
  });

  it("updates existing kanji and ignores empty words/strokes cells", async () => {
    const m = fakeModel([{ ...sample }]);
    const res = await svc(m).importCsv("char,level,words,strokes,hanViet\n学,N4,,,Học\n");
    expect(res).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    const got = m.store.get("学") as Record<string, unknown>;
    expect(got.level).toBe("N4");
    expect(got.strokes).toEqual(sample.strokes); // not wiped
    expect(got.hanViet).toBe("học");
  });

  it("skips and reports invalid rows, keeps the good ones", async () => {
    const m = fakeModel([]);
    const res = await svc(m).importCsv("char,level,rank\n日,N9,1\n月,N5,x\n火,N5,3\n");
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(2);
    expect(res.errors.map((e) => e.char)).toEqual(["日", "月"]);
    expect([...m.store.keys()]).toEqual(["火"]);
  });

  it("rejects a CSV without a char column", async () => {
    await expect(svc(fakeModel([])).importCsv("level\nN5\n")).rejects.toThrow(/char/);
  });
});
