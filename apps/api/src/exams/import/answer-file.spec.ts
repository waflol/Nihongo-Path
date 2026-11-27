import { describe, expect, it } from "vitest";
import { answerTemplate, headingOf, matchAnswerFile, mergeAnswers, parseAnswerFile, sittingKey, type AnswerFileDraft } from "./answer-file.js";

const q = (no: number, printedNo: number, options = 4) => ({ no, printedNo, options });
/** Two papers; 2010-07 問題1 spans blocks 1–2, 問題2 is block 3; 2010-12 restarts at 1. */
const drafts: AnswerFileDraft[] = [
  { id: "a", blockIndex: 0, sitting: "2010-07", heading: 1, open: true, questions: [q(1, 1), q(2, 2), q(3, 3)] },
  { id: "b", blockIndex: 1, sitting: "2010-07", heading: 1, open: true, questions: [q(1, 4), q(2, 5)] },
  { id: "c", blockIndex: 2, sitting: "2010-07", heading: 2, open: true, questions: [q(1, 6), q(2, 7, 3)] },
  { id: "d", blockIndex: 3, sitting: "2010-12", heading: 1, open: true, questions: [q(1, 1), q(2, 2)] },
  { id: "e", blockIndex: 4, sitting: "2010-12", heading: 2, open: false, questions: [q(1, 3)] },
];
const run = (text: string, list = drafts) => {
  const p = parseAnswerFile(text);
  const m = matchAnswerFile(p.rows, list);
  return { given: Object.fromEntries(m.given), matched: m.matched, problems: [...p.problems, ...m.problems] };
};

describe("answer file helpers", () => {
  it("normalises paper labels and reads the 問題 number", () => {
    expect(sittingKey("2010年7月")).toBe("2010-07");
    expect(sittingKey(" 2010-7 ")).toBe("2010-07");
    expect(sittingKey("7/2010")).toBe("2010-07");
    expect(sittingKey("Migii 616")).toBe("migii616");
    expect(headingOf("問題１ ＿＿の言葉の読み方として")).toBe(1);
    expect(headingOf("次の文を読んで")).toBeNull();
  });

  it("merges: blanks take the file's answer, set answers only with overwrite", () => {
    expect(mergeAnswers([0, 2, 0], [1, 3, 0, 4], false)).toEqual([1, 2, 0, 4]);
    expect(mergeAnswers([0, 2, 0], [1, 3, 0, 4], true)).toEqual([1, 3, 0, 4]);
  });
});

describe("the template", () => {
  it("lists every question in desk order and reads back to the same answers", () => {
    const answers: Record<string, number[]> = { a: [3, 0, 1], c: [0, 2] };
    const csv = answerTemplate(drafts, (id) => answers[id] ?? []);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe("de,khoi,dang,cau,dap_an");
    expect(lines[1]).toBe("2010-07,1,問題1,1,3");
    expect(lines[2]).toBe("2010-07,1,問題1,2,");
    expect(lines).toHaveLength(1 + 10);
    const r = run(csv);
    expect(r.problems).toEqual([]);
    expect(r.given).toEqual({ a: [3, 0, 1], c: [0, 2] });
  });

  it("finds the block by khoi even when Excel rewrote the paper label, else by de + dang + cau", () => {
    const r = run(["Đề;Khối;Dạng;Câu;Đáp án", "Jul-10;2;問題1;5;4", "2010-12;;;2;3", "2010年7月;;問題2;6;1"].join("\n"));
    expect(r.problems).toEqual([]);
    expect(r.given).toEqual({ b: [0, 4], d: [0, 3], c: [1, 0] });
  });

  it("says which rows it could not use", () => {
    const r = run(["de,khoi,dang,cau,dap_an", "2010-07,3,問題2,7,4", "2010-07,,,9,1", ",,,1,2", "2010-12,5,問題2,3,1", "2010-07,1,問題1,1,x"].join("\n"));
    expect(r.given).toEqual({});
    expect(r.problems).toEqual([
      'dòng 6: đáp án "x" không phải số',
      "dòng 2: câu 7 (khối 3) chỉ có 3 phương án, file ghi 4",
      "dòng 3: không tìm thấy câu 9 của đề 2010-07",
      "dòng 4: thiếu cột khoi hoặc de — lần nhập có 2 đề",
      "khối 5 đã xuất bản hoặc đã loại — bỏ qua đáp án của các khối này",
    ]);
  });
});

describe("the short layout", () => {
  it("reads paper by paper, 問題 by 問題, across blocks of the same 問題", () => {
    const r = run(["# đáp án", "[2010-07]", "問題1: 3 1 4 2 2", "問題２：1-", "Đề 2010-12", "問題1 21"].join("\n"));
    expect(r.problems).toEqual([]);
    expect(r.given).toEqual({ a: [3, 1, 4], b: [2, 2], c: [1, 0], d: [2, 1] });
    expect(r.matched).toBe(8);
  });

  it("skips a 問題 whose count does not match, rather than shifting answers", () => {
    const r = run(["[2010-07]", "問題1: 3 1 4 2", "問題3: 1 2"].join("\n"));
    expect(r.given).toEqual({});
    expect(r.problems).toEqual([
      "dòng 2: 問題1 của đề 2010-07 có 5 câu, file ghi 4 đáp án — bỏ qua dòng này",
      "dòng 3: đề 2010-07 không có 問題3",
    ]);
  });

  it("needs a paper label only when the job has several papers", () => {
    expect(run("問題1: 1 2").problems).toEqual(["dòng 1: chưa ghi đề — thêm một dòng [2010-07] phía trên (lần nhập có 2 đề)"]);
    expect(run("問題1: 1 2", drafts.slice(3)).given).toEqual({ d: [1, 2] });
  });

  it("flags a line it cannot read", () => {
    expect(run("[2010-07]\n問題1: a b c\nxin chào").problems).toEqual([
      "dòng 2: không đọc được đáp án sau 問題1",
      'dòng 3: không hiểu dòng này — dùng file mẫu, hoặc dạng "問題1: 3 1 4 2"',
    ]);
  });
});
