import { classifyInstruction, type MondaiType, type SectionKey } from "../mondai.js";
import { type AnswerKeyBlock } from "./answer-key.js";
import { cleanAnswerLine, cleanLine, isJunkLine, learnNoise } from "./clean.js";

/**
 * Block segmentation for JLPT exam import (NP-407 / plan §6 GĐ2).
 *
 * The raw pages are split into **blocks**: one 問題 at a time, each carrying
 * the sitting it belongs to, the paper part it was found under, the raw
 * instruction text, and the page range it spans. Each block is then
 * classified by `classifyInstruction` — a block that matches no known 問題
 * form is still kept, flagged `mondai: null`, so the AI / a reviewer can fix
 * it rather than losing it.
 *
 * Two real layouts (see `__fixtures__/`): the official collection puts the
 * instruction on the same line as `問題Ⅰ`; a Migii model test prints a bare
 * `問題 N:` line and the instruction on the next one — so a block's
 * classification uses the heading PLUS the first body lines.
 *
 * The answer section (after a `答案` / `解答` marker) stops the blocks and
 * comes back as `answerKey` — the compact key parser (`answer-key.ts`) reads
 * it, and its own `問題X` lines must not open new blocks. The answer region
 * keeps the circled marks ①②③④ (NFKC would fold them to 1..4 and make
 * `1①` unreadable), so it is cleaned differently from the question region.
 *
 * Sitting markers (in priority, last read wins): the official `YYYY年M月`
 * date, a Migii `EXAM ID: 6xx`, or a collection `N3-1` / `N2-40` label. Part
 * markers: `文字・語彙` / `文法` / `読解` / `聴解`.
 */

export interface Block {
  /** The sitting label (e.g. `2010-07`, `Migii 616`, `N3-1`). */
  sitting: string;
  /** The paper part the 問題 was found under. */
  sectionHint: SectionKey;
  /** The 問題 heading line, as printed. */
  instruction: string;
  /** The body (questions + options + passages) under the 問題, up to the next. */
  rawText: string;
  /** 1-based PDF pages the block spans. */
  pageFrom: number;
  pageTo: number;
  /** Classified 問題 type; `null` = unknown form, force a review. */
  mondai: MondaiType | null;
  /** A short reason when the block is kept with warnings. */
  note?: string;
}

export interface Segmented {
  blocks: Block[];
  /** The cleaned answer-section text, `""` when the paper has none. */
  answerKey: string;
  /** Per-paper answer sheets (`N2-1 解答` pages), by sitting label. */
  sheetKeys: Record<string, AnswerKeyBlock[]>;
}

// NFKC (cleanLine) turns Ⅰ..Ⅴ into I/II/III/IV/V and ①..⑩ into 1..10, so
// the heading class must match the NORMALISED forms.
const MONDAI_HEADING = /^問題\s*(?:\d{1,2}|I{1,3}|IV|V)\b/;
const ANSWER_MARK = /^(?:答案|解答|正答)(?:と説明)?\s*$/;
const SITTING_YEAR_MONTH = /(?<!\d)(\d{4})年\s*(\d{1,2})月/;
const SITTING_EXAMID = /^EXAM\s*ID\s*[:：]?\s*(\d+)/i;
// The label may be glued to the first line of the page (`N2 - 4 1 ふかふか…`).
const SITTING_NN_LABEL = /^(?:JLPT\s*)?(N[1-5])\s*[-－]\s*(\d{1,3})(?=\s|$)/;
/** `N2-1 解答` — the header of a per-paper answer sheet (collection PDFs). */
const SHEET_HEADER = /(N[1-5])\s*[-－]\s*(\d{1,3})\s*解答/;
/** `問題 7 12x3(36d)` — a section of a per-paper answer sheet (count x points). */
const SHEET_HEADING = /^問題\s*(\d{1,2})\s+(\d{1,3})\s*x\s*(\d{1,3})\s*\(\s*\d+\s*d?\s*\)/;
/** A bare in-paper page number (`N2 5`, `- 2 -`). */
const PAGE_FOOTER = /^(?:N[1-5]\s+\d{1,3}|-\s*\d{1,3}\s*-)$/;
const PART_LISTENING = /聴解/;
const PART_READING = /読解/;
const PART_VOCAB = /文字・語彙|文字語彙|言語知識|語彙・文法|文法・語彙/;
const PART_GRAMMAR = /文法/;
const CJK = /[぀-ヿ一-鿿]/;
const END_PUNCT = /[。．.!?、，,；;：:）)】」』…~\s]$/;

function partOf(line: string): SectionKey | null {
  if (PART_LISTENING.test(line)) return "listening";
  if (PART_READING.test(line)) return "reading";
  // `言語知識（文字・語彙・文法）` — the combined N5–N3 part counts as the
  // vocab part; a bare `文法` heading is the grammar part.
  if (PART_VOCAB.test(line)) return "vocab";
  if (PART_GRAMMAR.test(line)) return "grammar";
  return null;
}

function sittingOf(line: string): string | null {
  // A year-month inside a long passage line is a date in the text, not a paper label.
  const s1 = line.length <= 30 ? line.match(SITTING_YEAR_MONTH) : null;
  if (s1) return `${s1[1]}-${s1[2].padStart(2, "0")}`;
  const s2 = line.match(SITTING_EXAMID);
  if (s2) return `Migii ${s2[1]}`;
  const s3 = line.match(SITTING_NN_LABEL);
  if (s3) return `${s3[1]}-${s3[2]}`;
  return null;
}

/**
 * The answer sheet of one paper in a collection PDF: per 問題, a row of
 * question numbers over a row of answers (`問題 1 5x1(5d)` = 5 questions x 1
 * point). Returns the key blocks in printed order; an unreadable row → `null`s.
 */
export function parseSheetKey(lines: string[]): AnswerKeyBlock[] {
  const out: AnswerKeyBlock[] = [];
  let cur: AnswerKeyBlock | null = null;
  let nums: number[] | null = null;
  for (const raw of lines) {
    const l = cleanLine(raw);
    const h = l.match(SHEET_HEADING);
    if (h) {
      const count = Number(h[2]);
      const points = Number(h[3]);
      cur = { heading: `問題${h[1]}`, questionCount: count, pointsPerQuestion: points, totalPoints: count * points, answers: [] };
      out.push(cur);
      nums = null;
      continue;
    }
    if (!cur || !/^\d{1,3}(?:\s+\d{1,3})*$/.test(l)) continue;
    const v = l.split(/\s+/).map(Number);
    if (!nums) {
      nums = v;
    } else {
      for (let i = 0; i < nums.length; i += 1) cur.answers.push(v.length === nums.length && v[i] >= 1 && v[i] <= 4 ? v[i] : null);
      nums = null;
    }
  }
  for (const k of out) {
    while (k.answers.length < k.questionCount) k.answers.push(null);
    k.answers.length = k.questionCount;
  }
  return out;
}

interface RawLine {
  raw: string;
  page: number;
}

/**
 * Segment the raw pages into 問題 blocks + the answer key. `pages` are the
 * page texts as extracted (one string per page). The question region is
 * NFKC-cleaned, noise-stripped, and broken CJK lines re-joined; the answer
 * region keeps its circled marks.
 */
export function segmentBlocks(pages: string[], level?: string): Segmented {
  const noise = learnNoise(pages);

  // Per-paper answer sheets: a page with `問題 N CxP(Td)` lines is a sheet page;
  // its paper is named by the `N2-1 解答` header on that page or the last one before it.
  const sheetLines: Record<string, string[]> = {};
  const sheetPage = new Set<number>();
  let sheetSitting = "";
  pages.forEach((p, i) => {
    const lines = p.split(/\n/);
    const isSheet = lines.some((l) => SHEET_HEADING.test(cleanLine(l)));
    if (!isSheet) return;
    for (const l of lines) {
      const hd = cleanLine(l).match(SHEET_HEADER);
      if (hd) sheetSitting = `${hd[1]}-${Number(hd[2])}`;
    }
    sheetPage.add(i + 1);
    (sheetLines[sheetSitting || "unknown"] ??= []).push(...lines);
  });
  const sheetKeys: Record<string, AnswerKeyBlock[]> = {};
  for (const [name, lines] of Object.entries(sheetLines)) sheetKeys[name] = parseSheetKey(lines);

  const rawLines: RawLine[] = [];
  pages.forEach((p, i) => {
    if (sheetPage.has(i + 1)) return;
    p.split(/\n/).forEach((raw) => rawLines.push({ raw, page: i + 1 }));
  });

  const blocks: Block[] = [];
  const answerLines: string[] = [];
  let inAnswers = false;
  let sitting = "";
  let part: SectionKey = "vocab";
  let current: { instruction: string; body: string[]; pageFrom: number; pageTo: number; part: SectionKey } | null =
    null;

  const flush = () => {
    if (!current) return;
    const rawText = current.body.join("\n").trim();
    const head = current.body.slice(0, 3).join(" ");
    // A bare `問題 N:` heading (Migii) needs the first body lines to classify.
    const mondai = classifyInstruction(current.instruction + " " + head, level, {
      section: current.part,
    });
    blocks.push({
      sitting: sitting || "unknown",
      sectionHint: current.part,
      instruction: current.instruction,
      rawText,
      pageFrom: current.pageFrom,
      pageTo: current.pageTo,
      mondai,
      note: mondai ? undefined : "không nhận dạng được dạng 問題 — cần duyệt tay",
    });
    current = null;
  };

  for (const { raw, page } of rawLines) {
    if (inAnswers) {
      const a = cleanAnswerLine(raw);
      if (a && !isJunkLine(a)) answerLines.push(a);
      continue;
    }
    let n = cleanLine(raw);
    if (!n || noise.has(n) || isJunkLine(n) || PAGE_FOOTER.test(n)) continue;

    const sittingLine = sittingOf(n);
    if (sittingLine) {
      if (sitting !== sittingLine) flush(); // a new paper starts: close the previous block
      sitting = sittingLine;
      // Drop the label itself (it may share its line with the page's first text).
      if (SITTING_NN_LABEL.test(n)) {
        n = n.replace(SITTING_NN_LABEL, "").trim();
        if (!n) continue;
      }
    }
    const p = partOf(n);
    if (p) part = p;

    if (ANSWER_MARK.test(n)) {
      inAnswers = true;
      flush();
      continue;
    }

    if (MONDAI_HEADING.test(n)) {
      flush();
      current = { instruction: n, body: [], pageFrom: page, pageTo: page, part };
      continue;
    }

    // A passage line broken across lines: this line starts in CJK and the
    // previous BODY line ended in CJK without punctuation → re-join it.
    const prevBody = current ? current.body[current.body.length - 1] : undefined;
    if (current && prevBody !== undefined && CJK.test(n[0]) && CJK.test(prevBody.slice(-1)) && !END_PUNCT.test(prevBody.slice(-1))) {
      current.body[current.body.length - 1] = prevBody + n;
    } else {
      current?.body.push(n);
    }
    if (current) current.pageTo = page;
  }
  flush();
  return { blocks, answerKey: answerLines.join("\n"), sheetKeys };
}
