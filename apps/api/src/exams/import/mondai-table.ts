import { type MondaiType } from "../mondai.js";

/**
 * The official 大問 layout of each JLPT level — which 問題 number is which
 * type (source: 国際交流基金・日本語教育協会 「試験科目と問題の構成 / 大問のねらい」,
 * jlpt.jp/guideline/pdf/n1.pdf … n5.pdf). A paper prints `問題 <n> <instruction>`;
 * the NUMBER alone tells the type when the instruction is damaged by OCR.
 *
 *  - N1, N2: ONE sheet "言語知識（文字・語彙・文法）・読解", numbered 1…13 / 1…14.
 *  - N3, N4, N5: TWO sheets — 文字・語彙 (1…5 / 1…5 / 1…4) and then
 *    文法・読解 whose numbering RESTARTS at 1. `partOf` below tells them apart
 *    by the number going back down within one paper.
 *
 * Listening (聴解) is numbered separately and is not in this table.
 */
type Row = readonly MondaiType[];

const N1: Row[] = [
  [
    "kanji-reading", //  1 漢字読み
    "context", //        2 文脈規定
    "paraphrase", //     3 言い換え類義
    "usage", //          4 用法
    "grammar-form", //   5 文の文法1（文法形式の判断）
    "star-order", //     6 文の文法2（文の組み立て）
    "text-grammar", //   7 文章の文法
    "reading-short", //  8 内容理解（短文）
    "reading-mid", //    9 内容理解（中文）
    "reading-long", //  10 内容理解（長文）
    "reading-integrated", // 11 統合理解
    "reading-thematic", //   12 主張理解（長文）
    "info-retrieval", //     13 情報検索
  ],
];

const N2: Row[] = [
  [
    "kanji-reading", //  1
    "orthography", //    2 表記
    "word-formation", // 3 語形成
    "context", //        4
    "paraphrase", //     5
    "usage", //          6
    "grammar-form", //   7
    "star-order", //     8
    "text-grammar", //   9
    "reading-short", // 10
    "reading-mid", //   11
    "reading-integrated", // 12 統合理解
    "reading-thematic", //   13 主張理解（長文）
    "info-retrieval", //     14
  ],
];

const N3: Row[] = [
  ["kanji-reading", "orthography", "context", "paraphrase", "usage"],
  ["grammar-form", "star-order", "text-grammar", "reading-short", "reading-mid", "reading-long", "info-retrieval"],
];

const N4: Row[] = [
  ["kanji-reading", "orthography", "context", "paraphrase", "usage"],
  ["grammar-form", "star-order", "text-grammar", "reading-short", "reading-mid", "info-retrieval"],
];

const N5: Row[] = [
  ["kanji-reading", "orthography", "context", "paraphrase"],
  ["grammar-form", "star-order", "text-grammar", "reading-short", "reading-mid", "info-retrieval"],
];

export const OFFICIAL_MONDAI: Record<string, Row[]> = { N1, N2, N3, N4, N5 };

/** The Roman numerals NFKC leaves in a `問題Ⅲ` heading. */
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

/** The 問題 number a heading prints (`問題 12 …` → 12, `問題Ⅲ` → 3); `null` when there is none. */
export function mondaiNumberOf(instruction: string): number | null {
  const m = (instruction ?? "").normalize("NFKC").match(/問題\s*(\d{1,2}|I{1,3}|IV|V)(?![A-Za-z0-9])/);
  if (!m) return null;
  return /^\d/.test(m[1]) ? Number(m[1]) : (ROMAN[m[1]] ?? null);
}

/**
 * Walks a paper's blocks in order and tells each its sheet (1 or 2). A level
 * with two sheets (N3–N5) restarts at 問題 1 for 文法・読解: the number going
 * back down (or repeating) means the second sheet began. One tracker per
 * sitting; `reset()` on a new paper.
 */
export class PartTracker {
  private part = 0;
  private last = 0;

  constructor(private readonly sheets: number) {}

  next(no: number): number {
    if (this.sheets > 1 && no <= this.last && this.part < this.sheets - 1) this.part += 1;
    this.last = no;
    return this.part;
  }

  reset(): void {
    this.part = 0;
    this.last = 0;
  }
}

/** Number of printed sheets for a level (1 for N1/N2, 2 for N3–N5); `0` for an unknown level. */
export function sheetsOf(level?: string): number {
  return OFFICIAL_MONDAI[(level ?? "").trim().toUpperCase()]?.length ?? 0;
}

/**
 * The type of 問題 `no` on sheet `part` of `level`, or `null` when the level
 * or number is outside the official layout (a non-JLPT numbering — the
 * instruction text then decides).
 */
export function mondaiByNumber(level: string | undefined, part: number, no: number): MondaiType | null {
  const sheets = OFFICIAL_MONDAI[(level ?? "").trim().toUpperCase()];
  return sheets?.[part]?.[no - 1] ?? null;
}
