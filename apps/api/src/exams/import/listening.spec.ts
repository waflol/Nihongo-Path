import { describe, expect, it } from "vitest";
import { optionCountsOf } from "../mondai.js";
import { listeningMondai, parseListening } from "./listening.js";

// Self-authored text in the layout of a 聴解 booklet (the repo is public: no real exam content).
const TASK = "問題1では、まず質問を聞いてください。それから話を聞いて、問題用紙の1から4の中か";
const POINT = "問題2では、まず質問を聞いてください。そのあと、問題用紙を見てください。読む時間があ";
const SUMMARY = "問題3では、問題用紙に何も印刷されていません。この問題は、全体としてどんな内容か";
const QUICK = "問題4では、問題用紙に何も印刷されていません。まず文を聞いてください。";
const INTEGRATED = "問題5では、長めの話を聞きます。この問題には練習はありません。";

describe("listeningMondai", () => {
  it("names each 聴解 form from its wording", () => {
    expect(listeningMondai(TASK, "N2", 1).mondai).toBe("listening-task");
    expect(listeningMondai(POINT + "ります。それから話を聞いて", "N2", 2).mondai).toBe("listening-point");
    expect(listeningMondai(SUMMARY, "N2", 3).mondai).toBe("listening-summary");
    expect(listeningMondai(QUICK + "それから、それに対する返事を聞いて", "N2", 4).mondai).toBe("listening-quick");
    expect(listeningMondai(INTEGRATED, "N2", 5).mondai).toBe("listening-integrated");
    expect(listeningMondai("問題4では、絵を見ながら質問を聞いてください。やじるし(→)の人は何と言いますか。", "N3", 4).mondai).toBe(
      "listening-utterance",
    );
    expect(listeningMondai("もんだい2では、まずしつもんをきいてください。そのあと、もんだいようしを見てください。よむじかんがあります。", "N5", 2).mondai).toBe(
      "listening-point",
    );
  });

  it("falls back on the 問題 number when OCR damaged the wording, and says when the two disagree", () => {
    expect(listeningMondai("問題4では、ーーー", "N3", 4).mondai).toBe("listening-utterance");
    expect(listeningMondai("問題4では、ーーー", "N2", 4).mondai).toBe("listening-quick");
    expect(listeningMondai("?", "N2", null).mondai).toBe("listening");
    const r = listeningMondai(INTEGRATED, "N2", 3);
    expect(r.mondai).toBe("listening-integrated");
    expect(r.note).toMatch(/khác dạng theo số 問題 3/);
  });

  it("gives 即時応答 and 発話表現 three options", () => {
    expect(optionCountsOf("listening-quick")).toEqual([3]);
    expect(optionCountsOf("listening-utterance")).toEqual([3]);
    expect(optionCountsOf("listening-task")).toEqual([4]);
    expect(optionCountsOf("listening")).toEqual([3, 4]);
  });
});

describe("parseListening", () => {
  it("reads one question per 番 with its printed options, and flags a 番 whose options are pictures", () => {
    const r = parseListening(
      {
        instruction: TASK + " ",
        rawText: ["ら、最もよいものを一つ選んでください。", "１番", "1 本を返す", "2 席を取る", "3 傘を買う", "4 駅へ行く", "2番", "3 番", "1 窓を開ける", "2 電気を消す", "3 水を飲む", "4 鍵をかける", "12"].join("\n"),
        mondai: "listening-task",
      },
      "N2",
    );
    expect(r.instruction).toBe(TASK + "ら、最もよいものを一つ選んでください。");
    expect(r.parsed.questions.map((q) => [q.no, q.printedNo, q.prompt, q.options])).toEqual([
      [1, 1, "1番", ["本を返す", "席を取る", "傘を買う", "駅へ行く"]],
      [2, 2, "2番", ["1", "2", "3", "4"]],
      [3, 3, "3番", ["窓を開ける", "電気を消す", "水を飲む", "鍵をかける"]],
    ]);
    expect(r.issues).toEqual([expect.stringMatching(/^2番: không đọc được phương án/)]);
  });

  it("joins an option wrapped onto the next line", () => {
    const r = parseListening({ instruction: POINT, rawText: ["1番", "1 長い説明が", "次の行に続く", "2 い", "3 う", "4 え"].join("\n"), mondai: "listening-point" }, "N2");
    expect(r.parsed.questions[0].options[0]).toBe("長い説明が次の行に続く");
    expect(r.issues).toEqual([]);
  });

  it("makes the official number of heard-only questions when nothing is printed", () => {
    const summary = parseListening({ instruction: SUMMARY, rawText: "―メモー", mondai: "listening-summary" }, "N2");
    expect(summary.parsed.questions).toHaveLength(5);
    expect(summary.parsed.questions[4]).toEqual({ no: 5, printedNo: 5, prompt: "5番", options: ["1", "2", "3", "4"] });
    const quick = parseListening({ instruction: QUICK, rawText: "一メモー", mondai: "listening-quick" }, "N2", 12);
    expect(quick.parsed.questions).toHaveLength(12); // the printed key's count wins
    expect(quick.parsed.questions[0].options).toEqual(["1", "2", "3"]);
    expect(quick.issues).toEqual([]);
  });

  it("groups the two 質問 of one talk under a shared listening passage", () => {
    const r = parseListening(
      {
        instruction: INTEGRATED,
        rawText: [
          "1 番問題用紙に何も印刷されていません。まず話を聞いてください。",
          "ーメモー",
          "2 番まず話を聞いてください。それから、二つの質問を聞いてください。",
          "質問1",
          "1 赤い車",
          "2 青い車",
          "3 白い車",
          "4 黒い車質問2",
          "1 赤い車",
          "2 青い車",
          "3 白い車",
          "4 黒い車",
        ].join("\n"),
        mondai: "listening-integrated",
      },
      "N2",
    );
    expect(r.parsed.stimuli).toEqual([{ key: "s2", kind: "listening", body: "まず話を聞いてください。それから、二つの質問を聞いてください。" }]);
    expect(r.parsed.questions.map((q) => [q.prompt, q.options.join("/"), q.stimulusKey ?? "", q.groupOrder ?? 0])).toEqual([
      ["1番", "1/2/3/4", "", 0],
      ["2番 質問1", "赤い車/青い車/白い車/黒い車", "s2", 1],
      ["2番 質問2", "赤い車/青い車/白い車/黒い車", "s2", 2],
    ]);
    expect(r.issues).toEqual([]);
  });

  it("says which 番 is missing, and when the count differs from the key", () => {
    const r = parseListening({ instruction: TASK, rawText: ["1番", "3番"].join("\n"), mondai: "listening-task" }, "N2", 3);
    expect(r.issues).toEqual(
      expect.arrayContaining([expect.stringMatching(/^thiếu 2番/), expect.stringMatching(/số câu đọc được \(2\) khác bảng đáp án \(3\)/)]),
    );
  });

  it("reads picture labels printed side by side as one question each (発話表現)", () => {
    const r = parseListening(
      { instruction: "問題4では、絵を見ながら質問を聞いてください。やじるし(→)の人は何と言いますか。", rawText: "1 番 2 番\n3 番 4 番", mondai: "listening-utterance" },
      "N3",
    );
    expect(r.parsed.questions.map((q) => [q.prompt, q.options.length])).toEqual([
      ["1番", 3],
      ["2番", 3],
      ["3番", 3],
      ["4番", 3],
    ]);
    expect(r.issues).toEqual([expect.stringMatching(/^発話表現/)]);
  });
});
