import { optionCountsOf, SECTION_OF, type MondaiType, type SectionKey } from "./mondai.js";

/**
 * The structure of a JLPT paper per level: its timed parts (試験科目) with their time, and in
 * each part the 大問 in printed order with the usual number of questions (小問数, a 目安 —
 * "the actual number may vary slightly from session to session").
 *
 * Sources (accessed 2026-11-27; jlpt.jp itself was under maintenance that day, so the tables
 * were read through search-engine copies of the official files):
 *  - Times: 「試験科目と問題の構成」 https://www.jlpt.jp/guideline/testsections.html — N1 聴解
 *    is 55 min from the 2nd test of 2022 (December).
 *  - N1 聴解 counts: 「N1の試験時間・問題数の目安の変更について」
 *    https://www.jlpt.jp/topics/202208051659676565.html — 課題理解 5, ポイント理解 6, 概要理解 5,
 *    即時応答 11, 統合理解 3 from December 2022; N1 言語知識・読解 unchanged.
 *  - Every other count: the official guidebook table, "New JLPT Guidebook Executive Summary"
 *    https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf (rows: kanji reading 6/5/8/9/12,
 *    orthography –/5/6/6/8, word formation N2 5, contextually-defined 7/7/11/10/10, paraphrases
 *    6/5/5/5/5, grammar form 10/12/13/15/16, sentence composition 5, text grammar 5, short
 *    passages 4/5/4/4/3, mid-size 9/9/6/4/2, information retrieval 2/2/2/2/1; listening totals
 *    37/32/28/28/24). Usage (5 at N2–N4, 6 at N1), long passages (N1 4, N3 4), integrated (N1 3,
 *    N2 2) and thematic (N1 4, N2 3) were read off the table's subtotals (vocabulary 25/32/35/35/35,
 *    reading 26/21/16/10/6) — re-check them against https://www.jlpt.jp/guideline/pdf/n1.pdf … n5.pdf
 *    when the site is back. The N3 figures match the official 2010-07 paper (plan §5.4).
 */

export interface JlptMondai {
  /** The 問題 number printed on the paper (restarts in each part). */
  no: number;
  mondai: MondaiType;
  section: SectionKey;
  /** The official name of the 大問. */
  nameJa: string;
  /** Usual number of questions (目安). */
  count: number;
  /** Options per question. */
  options: number;
}

export interface JlptPart {
  key: "language-reading" | "language" | "grammar-reading" | "listening";
  titleJa: string;
  titleVi: string;
  timeMin: number;
  mondai: JlptMondai[];
  /** Questions in the part (sum of the counts). */
  questions: number;
}

export interface JlptLevelStructure {
  level: "N1" | "N2" | "N3" | "N4" | "N5";
  parts: JlptPart[];
  totalMin: number;
  totalQuestions: number;
}

/** The official name of each 大問. */
export const MONDAI_NAME_JA: Record<MondaiType, string> = {
  "kanji-reading": "漢字読み",
  orthography: "表記",
  "word-formation": "語形成",
  context: "文脈規定",
  paraphrase: "言い換え類義",
  usage: "用法",
  "grammar-form": "文の文法1（文法形式の判断）",
  "star-order": "文の文法2（文の組み立て）",
  "text-grammar": "文章の文法",
  "reading-short": "内容理解（短文）",
  "reading-mid": "内容理解（中文）",
  "reading-long": "内容理解（長文）",
  "reading-integrated": "統合理解",
  "reading-thematic": "主張理解（長文）",
  "info-retrieval": "情報検索",
  listening: "聴解",
  "listening-task": "課題理解",
  "listening-point": "ポイント理解",
  "listening-summary": "概要理解",
  "listening-utterance": "発話表現",
  "listening-quick": "即時応答",
  "listening-integrated": "統合理解",
};

type Row = readonly (readonly [MondaiType, number])[];
type PartSpec = { key: JlptPart["key"]; timeMin: number; rows: Row };

const TITLES: Record<JlptPart["key"], { ja: string; vi: string }> = {
  "language-reading": { ja: "言語知識（文字・語彙・文法）・読解", vi: "Kiến thức ngôn ngữ (chữ, từ vựng, ngữ pháp) · Đọc hiểu" },
  language: { ja: "言語知識（文字・語彙）", vi: "Kiến thức ngôn ngữ (chữ, từ vựng)" },
  "grammar-reading": { ja: "言語知識（文法）・読解", vi: "Kiến thức ngôn ngữ (ngữ pháp) · Đọc hiểu" },
  listening: { ja: "聴解", vi: "Nghe hiểu" },
};

const SPEC: Record<JlptLevelStructure["level"], PartSpec[]> = {
  N1: [
    {
      key: "language-reading",
      timeMin: 110,
      rows: [
        ["kanji-reading", 6],
        ["context", 7],
        ["paraphrase", 6],
        ["usage", 6],
        ["grammar-form", 10],
        ["star-order", 5],
        ["text-grammar", 5],
        ["reading-short", 4],
        ["reading-mid", 9],
        ["reading-long", 4],
        ["reading-integrated", 3],
        ["reading-thematic", 4],
        ["info-retrieval", 2],
      ],
    },
    {
      key: "listening",
      timeMin: 55,
      rows: [
        ["listening-task", 5],
        ["listening-point", 6],
        ["listening-summary", 5],
        ["listening-quick", 11],
        ["listening-integrated", 3],
      ],
    },
  ],
  N2: [
    {
      key: "language-reading",
      timeMin: 105,
      rows: [
        ["kanji-reading", 5],
        ["orthography", 5],
        ["word-formation", 5],
        ["context", 7],
        ["paraphrase", 5],
        ["usage", 5],
        ["grammar-form", 12],
        ["star-order", 5],
        ["text-grammar", 5],
        ["reading-short", 5],
        ["reading-mid", 9],
        ["reading-integrated", 2],
        ["reading-thematic", 3],
        ["info-retrieval", 2],
      ],
    },
    {
      key: "listening",
      timeMin: 50,
      rows: [
        ["listening-task", 5],
        ["listening-point", 6],
        ["listening-summary", 5],
        ["listening-quick", 12],
        ["listening-integrated", 4],
      ],
    },
  ],
  N3: [
    {
      key: "language",
      timeMin: 30,
      rows: [
        ["kanji-reading", 8],
        ["orthography", 6],
        ["context", 11],
        ["paraphrase", 5],
        ["usage", 5],
      ],
    },
    {
      key: "grammar-reading",
      timeMin: 70,
      rows: [
        ["grammar-form", 13],
        ["star-order", 5],
        ["text-grammar", 5],
        ["reading-short", 4],
        ["reading-mid", 6],
        ["reading-long", 4],
        ["info-retrieval", 2],
      ],
    },
    {
      key: "listening",
      timeMin: 40,
      rows: [
        ["listening-task", 6],
        ["listening-point", 6],
        ["listening-summary", 3],
        ["listening-utterance", 4],
        ["listening-quick", 9],
      ],
    },
  ],
  N4: [
    {
      key: "language",
      timeMin: 25,
      rows: [
        ["kanji-reading", 9],
        ["orthography", 6],
        ["context", 10],
        ["paraphrase", 5],
        ["usage", 5],
      ],
    },
    {
      key: "grammar-reading",
      timeMin: 55,
      rows: [
        ["grammar-form", 15],
        ["star-order", 5],
        ["text-grammar", 5],
        ["reading-short", 4],
        ["reading-mid", 4],
        ["info-retrieval", 2],
      ],
    },
    {
      key: "listening",
      timeMin: 35,
      rows: [
        ["listening-task", 8],
        ["listening-point", 7],
        ["listening-utterance", 5],
        ["listening-quick", 8],
      ],
    },
  ],
  N5: [
    {
      key: "language",
      timeMin: 20,
      rows: [
        ["kanji-reading", 12],
        ["orthography", 8],
        ["context", 10],
        ["paraphrase", 5],
      ],
    },
    {
      key: "grammar-reading",
      timeMin: 40,
      rows: [
        ["grammar-form", 16],
        ["star-order", 5],
        ["text-grammar", 5],
        ["reading-short", 3],
        ["reading-mid", 2],
        ["info-retrieval", 1],
      ],
    },
    {
      key: "listening",
      timeMin: 30,
      rows: [
        ["listening-task", 7],
        ["listening-point", 6],
        ["listening-utterance", 5],
        ["listening-quick", 6],
      ],
    },
  ],
};

function build(level: JlptLevelStructure["level"]): JlptLevelStructure {
  const parts = SPEC[level].map((p): JlptPart => {
    const mondai = p.rows.map(([m, count], i) => ({
      no: i + 1,
      mondai: m,
      section: SECTION_OF[m],
      nameJa: MONDAI_NAME_JA[m],
      count,
      options: optionCountsOf(m)[0],
    }));
    return { key: p.key, titleJa: TITLES[p.key].ja, titleVi: TITLES[p.key].vi, timeMin: p.timeMin, mondai, questions: mondai.reduce((n, x) => n + x.count, 0) };
  });
  return {
    level,
    parts,
    totalMin: parts.reduce((n, p) => n + p.timeMin, 0),
    totalQuestions: parts.reduce((n, p) => n + p.questions, 0),
  };
}

/** Easiest first, as a learner climbs: N5 … N1. */
export const JLPT_STRUCTURE: readonly JlptLevelStructure[] = (["N5", "N4", "N3", "N2", "N1"] as const).map(build);
