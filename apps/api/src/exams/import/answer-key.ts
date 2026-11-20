/**
 * Answer-key parsing for JLPT exam import (NP-407 / plan §6 GĐ2).
 *
 * The answer key is where a wrong read is most expensive, so it is parsed
 * mark-preserving: the circled marks ①②③④ are the ANSWERS and must not be
 * NFKC-folded into 1..4 (that would make the printed `1①` — "question 1,
 * answer ①" — read as the ambiguous `11`).
 *
 * Two real layouts are seen:
 *  (a) compact — a line like `問題Ⅰ 4x1 ( 4 点)` followed by `1① 2④ 3① …`;
 *      the `Nx…` part is the question count × points per question → the
 *      section's total points.
 *  (b) a broken OCR grid from a collection: answers scattered across cells —
 *      we recover what we can, and the cells we cannot read come back as
 *      `null` so the draft forces a manual review, never a guess.
 *
 * Printed answer marks ①②③④ → 1..4. Anything that cannot be read with
 * certainty is `null` (the caller turns it into a review flag).
 */

import { cleanAnswerLine } from "./clean.js";

/** ①②③④ → 1..4; `null` when unrecognised. (Answer marks only, mark-preserved.) */
export function markToNumber(mark: string): number | null {
  const m = cleanAnswerLine(mark).match(/[①②③④]/);
  if (!m) return null;
  return "①②③④".indexOf(m[0]) + 1;
}

export interface AnswerKeyBlock {
  /** `問題Ⅰ` / `問題⑦` / `文法 問題1` — as printed. */
  heading: string;
  /** Number of questions the key covers (from `Nx…`). */
  questionCount: number;
  /** Points per question (from `Nxp`); 1 when absent. */
  pointsPerQuestion: number;
  /** Total points for the block; `null` when the key doesn't state it. */
  totalPoints: number | null;
  /** 1-indexed answers; `null` = unreadable → manual review. */
  answers: (number | null)[];
}

/**
 * The 問題 heading a compact key belongs to. The answer region is
 * mark-preserved, so the class matches both digits and the surviving circled
 * ①…⑩ / roman Ⅰ…Ⅴ.
 */
const HEADING = /^(?:文法|文字|語彙|読解|聴解)?\s*問題\s*(?:\d{1,2}|[①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤ])+/;
/** `4x1 ( 4 点)` → count 4, points-per 1, total 4. */
const XFORM = /(\d{1,3})x(\d{1,3})\s*(?:\(\s*(\d{1,4})\s*点\s*\))?/;
/**
 * One `number mark` pair: the printed question number (a bare digit) followed
 * by the answer mark ①②③④. The number and mark are separated by nothing or
 * a single space (OCR may drop it). The mark is a CIRCLED character — that is
 * what keeps `1①` distinct from a stray `1`.
 */
const ANS_PAIR = /(\d{1,2})\s?([①②③④])/g;

/**
 * Parse the compact answer-key form (a). `block` is the mark-preserved text of
 * one 問題's answer section: the heading line (`問題Ⅰ 4x1 ( 4 点)`) plus the
 * answer lines. Returns `null` when no 問題 heading is present.
 */
export function parseCompactKey(block: string): AnswerKeyBlock | null {
  const lines = block
    .split(/\n/)
    .map(cleanAnswerLine)
    .filter(Boolean);
  let heading: string | null = null;
  let questionCount = 0;
  let pointsPer = 1;
  let totalPoints: number | null = null;
  const answers: (number | null)[] = [];
  const parsePairs = (line: string) => {
    ANS_PAIR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ANS_PAIR.exec(line)) !== null) {
      answers[parseInt(m[1], 10) - 1] = markToNumber(m[2]);
    }
  };

  for (const line of lines) {
    if (heading === null) {
      const hm = line.match(HEADING);
      if (!hm) continue;
      heading = line;
      const x = line.match(XFORM);
      if (x) {
        questionCount = parseInt(x[1], 10);
        pointsPer = parseInt(x[2], 10);
        if (x[3]) totalPoints = parseInt(x[3], 10);
        else totalPoints = questionCount * pointsPer;
      }
      parsePairs(line); // `問題Ⅰ 3x1 ( 3 点) 1③ 2② 3③` — the key may start on the heading line
      continue;
    }
    parsePairs(line);
  }

  if (heading === null) return null;
  // Fill holes with null (unreadable → review), up to the declared count.
  const count = questionCount > 0 ? questionCount : answers.length;
  const out: (number | null)[] = Array(Math.max(count, answers.length)).fill(null);
  for (let i = 0; i < answers.length; i += 1) {
    // Copy only real values — a hole in the sparse array must keep its null.
    if (answers[i] !== undefined) out[i] = answers[i];
  }
  return { heading, questionCount: count, pointsPerQuestion: pointsPer, totalPoints, answers: out };
}

/**
 * The 問題 marker a compact-key heading carries, NFKC-normalised (so the
 * mark-preserved ①/Ⅰ becomes `1`/`I`, matching the segmented block's
 * instruction, which is already NFKC-cleaned). `""` when the heading has no
 * marker.
 */
export function keyMarker(heading: string): string {
  const m = heading.normalize("NFKC").match(/問題\s*([0-9]{1,2}|I{1,3}|IV|V)/);
  return m ? m[1] : "";
}

/**
 * The 問題 marker of a segmented block's instruction (already NFKC-cleaned):
 * the token after `問題`. `""` when there is none. Used to line a block up
 * with the matching key block.
 */
export function blockMarker(instruction: string): string {
  const m = (instruction ?? "").match(/問題\s*([0-9]{1,2}|I{1,3}|IV|V)/);
  return m ? m[1] : "";
}

/**
 * Split the whole 答案 section into one compact key per 問題, in order. A
 * paper's key lists `問題Ⅰ … 問題Ⅲ` back to back (one 問題 block per
 * section); `segmentBlocks` produces the same 問題s in the same order, so the
 * i-th split key aligns with the i-th block. A line that starts with the
 * 問題 heading opens a new section; everything until the next is that
 * section's answers.
 */
export function splitCompactKey(answerKey: string): AnswerKeyBlock[] {
  const lines = (answerKey ?? "")
    .split(/\n/)
    .map(cleanAnswerLine)
    .filter(Boolean);
  const blocks: AnswerKeyBlock[] = [];
  let currentLines: string[] = [];
  const flush = () => {
    if (currentLines.length === 0) return;
    const parsed = parseCompactKey(currentLines.join("\n"));
    if (parsed) blocks.push(parsed);
    currentLines = [];
  };
  for (const line of lines) {
    const isHeading = /^(?:文法|文字|語彙|読解|聴解)?\s*問題\s*(?:\d{1,2}|[①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤ])/.test(line);
    if (isHeading && currentLines.length > 0) flush();
    currentLines.push(line);
  }
  flush();
  return blocks;
}

/**
 * Parse the broken-OCR-grid form (b): a table of question numbers down the
 * left and scattered marks. Best-effort — any cell we cannot match is `null`.
 * `cells` are raw grid cells (NFKC-folding is NOT applied, so circled marks
 * survive); each is a `number+mark`, a bare `mark`, or a bare `number`.
 */
export function parseBrokenGrid(cells: string[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (const raw of cells) {
    const cell = cleanAnswerLine(raw);
    const nm = cell.match(/^(\d{1,2})\s*([①②③④])\s*$/);
    if (nm) {
      out[parseInt(nm[1], 10) - 1] = markToNumber(nm[2]);
      continue;
    }
    const only = cell.match(/^([①②③④])$/);
    if (only) {
      // Positional: the next unfilled slot — existing holes first, else the
      // end of the list (the first bare mark sits at the first question).
      let slot = out.findIndex((v) => v === undefined || v === null);
      if (slot < 0) slot = out.length;
      out[slot] = markToNumber(only[1]);
      continue;
    }
    const num = cell.match(/^(\d{1,2})$/);
    if (num) out[parseInt(num[1], 10) - 1] ??= null;
    // Anything else: leave the slot undefined → null.
  }
  // Densify the holes (a question number that only printed a bare number, or
  // was never seen) so the array has no gaps.
  for (let i = 0; i < out.length; i += 1) out[i] ??= null;
  return out;
}
