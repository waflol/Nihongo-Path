import { classifyInstruction, isListeningMondai, SECTION_OF, type MondaiType, type SectionKey } from "../mondai.js";
import { listeningMondai } from "./listening.js";
import { mondaiByNumber, mondaiNumberOf, PartTracker, sheetsOf } from "./mondai-table.js";
import { type AnswerKeyBlock } from "./answer-key.js";
import { cleanAnswerLine, cleanLine, isJunkLine, learnNoise, noiseFragments, noiseKey, stripNoiseFragments } from "./clean.js";
import { isDrillBook, segmentDrillBook } from "./drill.js";

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
  /** The block's own answers, when the segmenter matched them itself (drill books). */
  key?: AnswerKeyBlock;
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
/** `＿＿＿の言葉の読み方として…` — the unnumbered opening 問題 of a collection paper. */
const UNLABELLED_FIRST = /^[_＿]{2,}の言葉の読み方として/;
// Not `\b`: NFKC turns `問題 2＿＿＿の言葉` into `問題 2___…`, and `_` is a word character.
const MONDAI_HEADING = /^問題\s*(?:\d{1,2}|I{1,3}|IV|V)(?![0-9A-Za-z])/;
/** `問題 1` alone — a title printed above that 問題's own instruction line (`問題 1 では…`). */
const BARE_MONDAI = /^問題\s*(?:\d{1,2}|I{1,3}|IV|V)\s*[:：]?$/;
const ANSWER_MARK = /^(?:答案|解答|正答)(?:と説明)?\s*$/;
// A date with a day (`2010年6月28日`, `…2011年11月18日付朝刊`) is a date in a passage, not a paper label.
const SITTING_YEAR_MONTH = /(?<!\d)(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d{1,2}\s*日)/;
/** `JLPT・N2・12/2025` — a sharer's running header naming the sitting as month/year. */
const SITTING_MONTH_SLASH = /^JLPT\s*[・･]\s*N[1-5]\s*[・･]\s*(\d{1,2})\s*\/\s*(\d{4})$/;
const SITTING_EXAMID = /^EXAM\s*ID\s*[:：]?\s*(\d+)/i;
// The label may be glued to the first line of the page (`N2 - 4 1 ふかふか…`).
const SITTING_NN_LABEL = /^(?:JLPT\s*)?(N[1-5])\s*[-－]\s*(\d{1,3})(?=\s|$)/;
/** `N2-1 解答` — the header of a per-paper answer sheet (collection PDFs). */
const SHEET_HEADER = /(N[1-5])\s*[-－]\s*(\d{1,3})\s*解答/;
/** `問題 7 12x3(36d)` — a section of a per-paper answer sheet (count x points). */
const SHEET_HEADING = /^問題\s*(\d{1,2})\s+(\d{1,3})\s*x\s*(\d{1,3})\s*\(\s*\d+\s*d?\s*\)/;
/** `問題 11` alone on its line — a section of a paper's own answer pages, which print no count. */
const SHEET_BARE_HEADING = /^問題\s*(\d{1,2})$/;
/** `2010年7月新日本語能力試験N2 答案` — the header of a paper's own answer pages. */
const KEY_HEADER = /(?:答案|解答|正答)\s*$/;
const DIGIT_ROW = /^\d{1,3}(?:\s+\d{1,3})*$/;
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
  const s0 = line.match(SITTING_MONTH_SLASH);
  if (s0) return `${s0[2]}-${s0[1].padStart(2, "0")}`;
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
const READING_FAMILY = new Set<string>([
  "text-grammar",
  "reading-short",
  "reading-mid",
  "reading-long",
  "reading-integrated",
  "reading-thematic",
  "info-retrieval",
]);

/** Question numbers run on by one (`60 61 62`): the top row of an answer group. */
const isRun = (v: number[]) => v.every((x, i) => i === 0 || x === v[i - 1] + 1);

/**
 * How many answer groups a page holds in the bare layout: a `問題N` line, the
 * row of its question numbers, then the row of answers (1–4), same length.
 */
export function bareKeyGroups(lines: string[]): number {
  const ls = lines.map(cleanLine).filter(Boolean);
  let n = 0;
  for (let i = 0; i + 2 < ls.length; i += 1) {
    if (!SHEET_BARE_HEADING.test(ls[i]) || !DIGIT_ROW.test(ls[i + 1]) || !DIGIT_ROW.test(ls[i + 2])) continue;
    const nums = ls[i + 1].split(/\s+/).map(Number);
    const ans = ls[i + 2].split(/\s+/).map(Number);
    if (isRun(nums) && ans.length === nums.length && ans.every((a) => a >= 1 && a <= 4)) n += 1;
  }
  return n;
}

/**
 * Both answer layouts: `問題 1 5x1(5d)` (count x points) and a bare `問題 1`
 * (the count is the length of its question-number row).
 */
export function parseSheetKey(lines: string[]): AnswerKeyBlock[] {
  const out: AnswerKeyBlock[] = [];
  const bare = new Set<AnswerKeyBlock>();
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
    const b = l.match(SHEET_BARE_HEADING);
    if (b) {
      cur = { heading: `問題${b[1]}`, questionCount: 0, pointsPerQuestion: 1, totalPoints: null, answers: [] };
      bare.add(cur);
      out.push(cur);
      nums = null;
      continue;
    }
    if (!cur || !DIGIT_ROW.test(l)) continue;
    const v = l.split(/\s+/).map(Number);
    // A row of a different length that runs on by one is a new number row (a stray page number came first).
    if (!nums || (v.length !== nums.length && isRun(v) && v.length > 1)) {
      nums = v;
    } else {
      for (let i = 0; i < nums.length; i += 1) cur.answers.push(v.length === nums.length && v[i] >= 1 && v[i] <= 4 ? v[i] : null);
      if (bare.has(cur)) cur.questionCount += nums.length;
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
  if (isDrillBook(pages)) return segmentDrillBook(pages, level);
  const noise = learnNoise(pages);
  const fragments = noiseFragments(noise);

  // Answer pages, kept out of the blocks:
  //  - "counted" sheets (`N2-1 解答` + `問題 N CxP(Td)`): named by the header on that page or the last one before it;
  //  - "bare" keys printed right after their paper (`2010年7月…N2 答案` + `問題N` / numbers / answers),
  //    running onto the next page without a header. Each closes the paper before it.
  const sheetLines: Record<string, string[]> = {};
  const sheetPage = new Map<number, "counted" | "bare">();
  let sheetSitting = "";
  pages.forEach((p, i) => {
    const lines = p.split(/\n/);
    const clean = lines.map(cleanLine);
    if (clean.some((l) => SHEET_HEADING.test(l))) {
      for (const l of clean) {
        const hd = l.match(SHEET_HEADER);
        if (hd) sheetSitting = `${hd[1]}-${Number(hd[2])}`;
      }
      sheetPage.set(i + 1, "counted");
      (sheetLines[sheetSitting || "unknown"] ??= []).push(...lines);
      return;
    }
    const groups = bareKeyGroups(clean);
    if (groups >= 2 || (groups >= 1 && (keyHeaderLabel(clean) !== null || sheetPage.get(i) === "bare"))) {
      sheetPage.set(i + 1, "bare");
    }
  });
  const sheetKeys: Record<string, AnswerKeyBlock[]> = {};
  for (const [name, lines] of Object.entries(sheetLines)) sheetKeys[name] = parseSheetKey(lines);

  const rawLines: RawLine[] = [];
  pages.forEach((p, i) => {
    if (sheetPage.get(i + 1) === "counted") return;
    p.split(/\n/).forEach((raw) => rawLines.push({ raw, page: i + 1 }));
  });

  // Papers in reading order: a bare key ends one, the next text opens another.
  let paper = 0;
  let afterKey = false;
  const blockPaper: number[] = [];
  const bareKeys = new Map<number, { label: string | null; lines: string[] }>();

  const blocks: Block[] = [];
  const answerLines: string[] = [];
  let inAnswers = false;
  let sitting = "";
  let part: SectionKey = "vocab";
  let current: { instruction: string; body: string[]; pageFrom: number; pageTo: number; part: SectionKey } | null =
    null;

  // N3–N5 print two sheets whose 問題 numbering restarts; one tracker per paper.
  const tracker = new PartTracker(sheetsOf(level));

  const flush = () => {
    if (!current) return;
    // The instruction sentence can wrap onto the next line (`…最もよいものを、` / `1・2・3・4から一つ選びなさい。`).
    if (!/[。]$/.test(current.instruction) && current.body[0] && /^(?:1\s*[・･]\s*2\s*[・･]\s*3\s*[・･]\s*4\s*から|.{0,12}選びなさい)/.test(current.body[0].trim())) {
      current.instruction = `${current.instruction} ${current.body.shift()!.trim()}`;
    }
    const rawText = current.body.join("\n").trim();
    const head = current.body.slice(0, 3).join(" ");
    // A bare `問題 N:` heading (Migii) needs the first body lines to classify.
    const byText = classifyInstruction(current.instruction + " " + head, level, {
      section: current.part,
    });
    // The official layout names the type of every 問題 NUMBER (jlpt.jp 大問のねらい):
    // it fills in a type the (possibly OCR-damaged) instruction could not give.
    const no = mondaiNumberOf(current.instruction);
    let mondai = byText;
    let note: string | undefined;
    let section: SectionKey = current.part;
    if (current.part === "listening" || isListeningMondai(byText)) {
      // 聴解 restarts at 問題 1 and has its own layout (and the written sheets' tracker must not see it).
      // Only inside a 聴解 part does the number follow that layout; a lone 音声 問題 (Migii) has its own numbering.
      const heard = listeningMondai(current.instruction + " " + head, level, current.part === "listening" ? no : null);
      mondai = heard.mondai;
      note = heard.note;
      section = "listening";
    } else if (no !== null && sheetsOf(level) > 0) {
      const byNo = mondaiByNumber(level, tracker.next(no), no);
      // N1/N2 print 語形成, 文脈規定 and 文法形式の判断 with the SAME instruction
      // (`( )に入れるのに最もよいもの`): only the number tells them apart.
      // From 問題 9 (N2) / 7 (N1) on, every passage block opens with a near-identical
      // 「次の文章を読んで…」: the instruction cannot tell 文章の文法 / 短文 / 中文 / 統合 / 主張 /
      // 情報検索 apart, but the printed NUMBER can — so the number wins inside that family.
      const sameFamily = sheetsOf(level) === 1 && !!byText && READING_FAMILY.has(byText) && READING_FAMILY.has(byNo ?? "");
      const sameBlank = byText === "context" && (byNo === "word-formation" || byNo === "grammar-form");
      if (byNo && (!byText || sameFamily || sameBlank)) {
        mondai = byNo;
        section = SECTION_OF[byNo];
      } else if (byNo && byText && byNo !== byText) {
        note = `dạng theo lời dẫn (${byText}) khác dạng theo số 問題 ${no} của ${level} (${byNo}) — kiểm tra lại`;
      }
    }
    blockPaper.push(paper);
    blocks.push({
      sitting,
      sectionHint: section,
      instruction: current.instruction,
      rawText,
      pageFrom: current.pageFrom,
      pageTo: current.pageTo,
      mondai,
      note: note ?? (mondai ? undefined : "không nhận dạng được dạng 問題 — cần duyệt tay"),
    });
    current = null;
  };

  for (const { raw, page } of rawLines) {
    if (inAnswers) {
      const a = cleanAnswerLine(raw);
      if (a && !isJunkLine(a)) answerLines.push(a);
      continue;
    }
    if (sheetPage.get(page) === "bare") {
      if (!afterKey) flush();
      afterKey = true;
      const k = bareKeys.get(paper) ?? { label: null, lines: [] };
      k.label ??= keyHeaderLabel([cleanLine(raw)]);
      k.lines.push(raw);
      bareKeys.set(paper, k);
      continue;
    }
    let n = cleanLine(raw);
    if (!n || noise.has(n) || noise.has(noiseKey(n)) || isJunkLine(n) || PAGE_FOOTER.test(n)) {
      // A running header is noise, but one that names the paper (`JLPT・N2・12/2025`) still names it.
      if (n && !sitting && !afterKey && (noise.has(n) || noise.has(noiseKey(n)))) sitting = sittingOf(n) ?? "";
      continue;
    }
    n = stripNoiseFragments(n, fragments);
    if (!n) continue;

    if (afterKey) {
      // What follows a paper's key is the next paper, until its own header (if any) names it.
      afterKey = false;
      paper += 1;
      sitting = "";
      part = "vocab";
      tracker.reset();
    }

    const sittingLine = sittingOf(n);
    if (sittingLine) {
      if (sitting !== sittingLine) {
        flush(); // a new paper starts: close the previous block
        tracker.reset();
        part = "vocab";
      }
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
      // `問題 1` printed as a title above `問題 1 では…`: one block, not an empty one and then the real one.
      if (current && current.body.length === 0 && BARE_MONDAI.test(current.instruction) && mondaiNumberOf(current.instruction) === mondaiNumberOf(n)) {
        current.instruction = n;
        continue;
      }
      flush();
      current = { instruction: n, body: [], pageFrom: page, pageTo: page, part };
      continue;
    }

    // The paper's FIRST 問題 (kanji reading) is printed without the words `問題1`: its
    // instruction opens straight under the part banner. Open the block ourselves.
    if (UNLABELLED_FIRST.test(n) && (!current || current.body.length > 0)) {
      flush();
      current = { instruction: `問題1 ${n}`, body: [], pageFrom: page, pageTo: page, part };
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

  // A bare key belongs to the paper before it: the paper's own label names the key, and a
  // paper whose header was not read (a lost first page) takes the label the key prints.
  for (const [pi, k] of bareKeys) {
    const own = blocks.filter((_, bi) => blockPaper[bi] === pi);
    const label = own.find((b) => b.sitting)?.sitting || k.label || `#${pi + 1}`;
    for (const b of own) b.sitting ||= label;
    sheetKeys[label] = parseSheetKey(k.lines);
  }
  for (const b of blocks) b.sitting ||= "unknown";
  return { blocks, answerKey: answerLines.join("\n"), sheetKeys };
}

/** The paper an answer-page header names (`2010年7月新日本語能力試験N2 答案` → `2010-07`), or `null`. */
function keyHeaderLabel(lines: string[]): string | null {
  for (const l of lines) {
    if (l.length > 40 || !KEY_HEADER.test(l)) continue;
    const s = sittingOf(l);
    if (s) return s;
  }
  return null;
}
