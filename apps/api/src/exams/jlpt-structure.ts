import { optionCountsOf, SECTION_OF, type MondaiType, type SectionKey } from "./mondai.js";

/**
 * The structure of a JLPT paper per level: its timed parts (試験科目) with their time, and in
 * each part the 大問 in printed order with the usual number of questions (小問数, a 目安 —
 * "the actual number may vary slightly from session to session").
 *
 * Source: the N5–N1 「Cấu trúc đề thi」 tables (Dungmori) the product owner gave on 2026-11-27 —
 * times and counts follow them. Where they differ from the jlpt.jp announcements read the same
 * day (through search-engine copies): N1 聴解 is 60 min here (jlpt.jp: 55 from December 2022),
 * and N2 即時応答 / 統合理解 are 11 / 3 (official guidebook table: 12 / 4). The N2 table labels
 * 聴解 問題4 「発語表現」 but describes 即時応答, which is what N2 has.
 *
 * This is the one source of the counts: the structure page, the import (a 聴解 問題 that prints
 * nothing, and the reviewer's "usual count") and the assembled exam's times all read it.
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
        ["text-grammar", 4],
        ["reading-short", 4],
        ["reading-mid", 8],
        ["reading-long", 3],
        ["reading-integrated", 2],
        ["reading-thematic", 3],
        ["info-retrieval", 2],
      ],
    },
    {
      key: "listening",
      timeMin: 60,
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
        ["word-formation", 3],
        ["context", 7],
        ["paraphrase", 5],
        ["usage", 5],
        ["grammar-form", 12],
        ["star-order", 5],
        ["text-grammar", 4],
        ["reading-short", 5],
        ["reading-mid", 8],
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
        ["listening-quick", 11],
        ["listening-integrated", 3],
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
        ["text-grammar", 4],
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

/** The usual number of questions of a 大問 at a level; `undefined` when the level does not print it. */
export function usualCountOf(level: string | undefined, mondai: string | null | undefined): number | undefined {
  const found = JLPT_STRUCTURE.find((s) => s.level === level?.trim().toUpperCase());
  return found?.parts.flatMap((p) => p.mondai).find((m) => m.mondai === mondai)?.count;
}
