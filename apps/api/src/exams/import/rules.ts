import { type MondaiType } from "../mondai.js";
import { type ParsedBlock, type ParsedQuestion } from "./structure.js";

/**
 * Rule-based reading of the sentence-level 問題 (NP-407): the forms that print
 * as `<n>）prompt` + `1 … 2 … 3 … 4 …`. They are regular enough to read exactly
 * with no AI — which is cheaper, faster, never invents text, and does not depend
 * on a model being up. Passages (reading, cloze) still go to the AI.
 */
export const RULE_TYPES: ReadonlySet<MondaiType> = new Set<MondaiType>([
  "kanji-reading",
  "orthography",
  "word-formation",
  "context",
  "paraphrase",
  "usage",
  "grammar-form",
  "star-order",
]);

/** `45 ）prompt` / `3)prompt` — NFKC leaves a space before the bracket in some PDFs. */
const Q_BRACKET = /^(\d{1,3})\s*[)）]\s*(.*)$/;
/**
 * A question number in front of its prompt, in the styles OCR writes it: boxed `[12]` /
 * `【12】`, `(12)` / `(12).`, or `12.` / `12)`. The first two can only be a question; a
 * dotted or bracketed digit may also be an option (`1. 実 2. 真`, `1) も`), decided by the caller.
 */
const Q_MARK = /^(?:[[【](\d{1,3})[\]】]|\((\d{1,3})\)[.．]?|(\d{1,3})\s*[.．)）](?!\d))\s*(.*)$/;
/** `12 prompt` — papers that print the number without a bracket. */
const NUM_LINE = /^(\d{1,2})(?:\s+|(?=[「『（(]))(\S.*)$/;
/** An option the OCR printed as a bullet (`• 前`), losing its number. */
const BULLET = /^[•●◦‣∙▪]\s*(\S.*)$/;
/** Page furniture that lands inside a block: part banners, scoring notes, page footers. A bare `[12]` is a question number, not furniture. */
const FURNITURE = /^(?:[【[](?!\d{1,3}[】\]]$).*[】\]]|\(\s*配点.*\)|\(\s*解答.*|ページ\s*\d+|N[1-5]|言語知識.*|\d{1,3})$/;
const TRAILING_PAGE = /\s*ページ\s*\d+$/;
/** The worked example of a 問題 (`(問題例)` … `(解答用紙) (例) 1 ● 3 4`) — not a question. */
const EXAMPLE_START = /^\(?\s*(?:問題例|例題)\s*\)?$/;
const EXAMPLE_END = /解答用紙/;

/**
 * An option marker: `1 text`, `2.text`, `3 . text`, `1) text`, or `3.text` glued to the end of the
 * previous option (`…さない3.いじめない`). A `.` followed by a digit (`3.5`) is a decimal.
 */
const markerRe = () =>
  /(?:(?<=^|\s)([1-4])(?:\s*[.．)）](?!\d)\s*|\s+)|(?<=[^\d.\s])([1-4])[.．](?!\d)\s*)/g;

/** `しょうご 2 しょうごう 3 そうご 4` — option numbers inside a "prompt" mean the lines were misread. */
function looksLikeOptions(text: string): boolean {
  return (text.match(/(?:^|\s)[1-4](?=\s|[.．)）]|$)/g) ?? []).length >= 3;
}

/** How many of the option markers 1, 2, 3, 4 appear, IN ORDER, in `text`. */
function markerCount(text: string): number {
  let expect = 1;
  const marker = markerRe();
  for (let m = marker.exec(text); m !== null && expect <= 4; m = marker.exec(text)) {
    if (Number(m[1] ?? m[2]) === expect) expect += 1;
  }
  return expect - 1;
}

/**
 * Split `1 a 2 b 3 c 4 d` (possibly over several lines) into the four option
 * texts, taking each digit only in sequence so a number INSIDE an option
 * (`20 ％`) is not mistaken for the next marker.
 */
function splitOptions(text: string): string[] | null {
  let expect = 1;
  const marker = markerRe();
  const starts: { at: number; end: number }[] = [];
  for (let m = marker.exec(text); m !== null && expect <= 4; m = marker.exec(text)) {
    if (Number(m[1] ?? m[2]) === expect) {
      starts.push({ at: m.index, end: m.index + m[0].length });
      expect += 1;
    }
  }
  if (starts.length !== 4) return null;
  const out = starts.map((st, i) => text.slice(st.end, i + 1 < 4 ? starts[i + 1].at : text.length).trim());
  return out.every((o) => o.length > 0) ? out : null;
}

interface Group {
  /** The number printed in front of the question (`45 )…`). */
  printed?: number;
  /** Opened by a printed `N)` marker (so it is certainly a question, not stray text). */
  bracketed?: boolean;
  prompt: string[];
  options: string[];
  count: number;
}

/**
 * Read a block by rules. Returns `null` when the block is not a rule form or
 * no question could be read (the caller then asks the AI). Questions are
 * numbered by POSITION (1..n); the printed number is only used to find them.
 *
 * Two printed styles are understood: `45 ）prompt` and a bare `45 prompt`. In the
 * bare style a line starting with the NEXT expected option digit is an option;
 * any other `<n> text` line opens a question.
 */
export function parseByRules(block: { rawText: string; mondai: string | null }): ParsedBlock | null {
  if (block.mondai === "text-grammar") return parseCloze(block.rawText);
  const readingKind = READING_KIND[block.mondai ?? ""];
  if (readingKind) return parseReading(block.rawText, readingKind);
  if (!block.mondai || !RULE_TYPES.has(block.mondai as MondaiType)) return null;

  // The example box (問題例 / 解答の仕方) is fenced by two rule lines of underscores, or
  // (OCR text) runs from `(問題例)` to the `(解答用紙)` line.
  const lines: string[] = [];
  let inExample = false;
  let inWorked = false;
  for (const raw of block.rawText.split("\n")) {
    const l = raw.trim();
    if (/^_{5,}$/.test(l)) {
      inExample = !inExample;
      continue;
    }
    if (EXAMPLE_START.test(l)) inWorked = true;
    if (inWorked) {
      // The example's own steps are numbered 1, 2; the first real question (≥ 5) ends it too.
      const no = /^[[【(]?\s*(\d{1,3})(?!\d)/.exec(l);
      if (no && Number(no[1]) >= 5) inWorked = false;
      else {
        if (EXAMPLE_END.test(l)) inWorked = false;
        continue;
      }
    }
    if (inExample || !l || FURNITURE.test(l)) continue;
    lines.push(l.replace(TRAILING_PAGE, ""));
  }

  const groups: Group[] = [];
  for (let line of lines) {
    const cur = groups[groups.length - 1];
    if (cur && cur.count < 4 && cur.prompt.length > 0) {
      // Options the OCR wrote as bullets (`• 前`) or glued to their number (`1集`): give the number back.
      const bullet = line.match(BULLET);
      if (bullet) line = `${cur.count + 1} ${bullet[1]}`;
      const glued = line.match(/^([1-4])([^\s\d.．)）].*)$/);
      if (glued && Number(glued[1]) === cur.count + 1) line = `${glued[1]} ${glued[2]}`;
    }
    const qm = line.match(Q_MARK);
    if (qm) {
      const no = Number(qm[1] ?? qm[2] ?? qm[3]);
      const boxed = qm[3] === undefined;
      // `1. 実 2. 真 …` on one line, or the next option number while a question waits for its options.
      const option = !boxed && (markerCount(line) >= 2 || (!!cur && cur.prompt.length > 0 && cur.count < 4 && no === cur.count + 1));
      if (!option) {
        groups.push({ bracketed: true, printed: no, prompt: qm[4] ? [qm[4]] : [], options: [], count: 0 });
        continue;
      }
      if (cur && cur.count < 4 && no === cur.count + 1) {
        cur.options.push(line);
        cur.count = markerCount(cur.options.join(" "));
        continue;
      }
    }
    // `1.有好 2.優好` (number + dot, no space) can only be an option line.
    const nl = line.match(NUM_LINE) ?? line.match(/^([1-4])[.．](?!\d)\s*(\S.*)$/);
    if (nl && cur && cur.count < 4 && Number(nl[1]) === cur.count + 1) {
      cur.options.push(line);
      cur.count = markerCount(cur.options.join(" "));
      continue;
    }
    if (nl && !(cur && cur.count > 0 && cur.count < 4)) {
      groups.push({ printed: Number(nl[1]), prompt: [nl[2]], options: [], count: 0 });
      continue;
    }
    if (!cur) continue; // text before the first question (instruction tail, banners)
    if (cur.count > 0) {
      cur.options.push(line); // a wrapped option
      cur.count = markerCount(cur.options.join(" "));
    } else {
      cur.prompt.push(line);
    }
  }

  const questions: ParsedQuestion[] = [];
  for (const g of groups) {
    const options = splitOptions(g.options.join(" "));
    const prompt = g.prompt.join("\n").trim();
    if (!options || !prompt) {
      // A question that certainly exists but cannot be read → the whole block goes to the AI, never a short draft.
      if (g.bracketed) return null;
      continue;
    }
    // An option row read as a prompt, or the next question swallowed by an option: the lines were
    // misread (an unknown numbering style) — the AI gets the block rather than a draft that looks fine.
    if (looksLikeOptions(prompt) || options.some((o) => /[[【(]\d{1,3}[\]】)][.．]?\s*\S{2}/.test(o))) return null;
    questions.push({ no: questions.length + 1, ...(g.printed ? { printedNo: g.printed } : {}), prompt, options });
  }
  return questions.length > 0 ? { stimuli: [], questions } : null;
}

/** Furniture that can sit inside a passage; unlike FURNITURE a bare number may be a blank marker. */
const PASSAGE_FURNITURE = /^(?:[【\[].*[】\]]|\(\s*配点.*\)|\(\s*解答.*|ページ\s*\d+|N[1-5]|言語知識.*)$/;
/** `50)1 それで 2 そこで …` — the answer line of one blank. */
const CLOZE_ANSWER = /^(\d{1,2})\s*[)）]\s*(1(?:\s|[.．]).*)$/;
const OPTIONS_TAIL = /^1\s*[・･]\s*2\s*[・･]\s*3\s*[・･]\s*4\s*から.*$/;

/**
 * 文章の文法: ONE passage with numbered blanks (`50 `…`54 `) followed by one
 * answer line per blank (`50)1 … 2 … 3 … 4 …`). The passage becomes a `cloze`
 * stimulus; each blank is a question whose prompt is its printed number (turned
 * into `[50]` by {@link markCloze} once the text has been validated against the block).
 */
function parseCloze(rawText: string): ParsedBlock | null {
  const passage: string[] = [];
  const answers: { no: number; text: string }[] = [];
  for (const raw of rawText.split("\n")) {
    const l = raw.trim().replace(TRAILING_PAGE, "");
    if (!l || PASSAGE_FURNITURE.test(l) || OPTIONS_TAIL.test(l)) continue;
    const a = l.match(CLOZE_ANSWER);
    if (a) {
      answers.push({ no: Number(a[1]), text: a[2] });
      continue;
    }
    const last = answers[answers.length - 1];
    if (last && markerCount(last.text) < 4) last.text += " " + l; // a wrapped option line
    else if (!last) passage.push(l);
  }
  const questions: ParsedQuestion[] = [];
  for (const a of answers) {
    const options = splitOptions(a.text);
    if (!options) return null; // unreadable → the AI gets the block
    questions.push({ no: questions.length + 1, printedNo: a.no, prompt: String(a.no), options, stimulusKey: "s1", groupOrder: questions.length + 1 });
  }
  if (questions.length === 0 || passage.length === 0) return null;
  return { stimuli: [{ key: "s1", kind: "cloze", body: passage.join("\n") }], questions };
}

/** Turn the printed blank numbers inside a cloze passage into `[n]` (after validation). */
export function markCloze(parsed: ParsedBlock): ParsedBlock {
  const stimuli = parsed.stimuli.map((st) => {
    if (st.kind !== "cloze") return st;
    let body = st.body;
    for (const q of parsed.questions) {
      if (q.stimulusKey !== st.key || !/^\d{1,2}$/.test(q.prompt)) continue;
      body = body.replace(new RegExp(`(?<=^|\\s)${q.prompt}(?=\\s|$|[、。])`, "m"), `[${q.prompt}]`);
    }
    return { ...st, body };
  });
  const questions = parsed.questions.map((q) => (/^\d{1,2}$/.test(q.prompt) ? { ...q, prompt: `[${q.prompt}]` } : q));
  return { stimuli, questions };
}

/** Reading forms read by rules → the stimulus kind they produce (統合理解 has an A/B pair: left to the AI). */
const READING_KIND: Record<string, "passage" | "notice"> = {
  "reading-short": "passage",
  "reading-mid": "passage",
  "reading-long": "passage",
  "reading-thematic": "passage",
  "info-retrieval": "notice",
};

/**
 * 読解: one or more passages, each followed by its questions printed as
 * `55)prompt` + `1 … 2 … 3 … 4 …`. Question numbers run on from the previous
 * 問題 (the cloze ends at 54, the first reading question is 55), so a line opens
 * a question only when it carries the NEXT number — a passage line that happens
 * to start with a digit and a bracket is not mistaken for one. Whatever lies
 * between two question groups is the next passage; a trailing footnote is
 * kept as that passage's `notes`.
 */
function parseReading(rawText: string, kind: "passage" | "notice"): ParsedBlock | null {
  const passages: { body: string[]; qs: Group[]; notes?: string[] }[] = [];
  let pending: string[] = [];
  let cur: Group | null = null;
  let lastNo: number | null = null;
  for (const raw of rawText.split("\n")) {
    const l = raw.trim().replace(TRAILING_PAGE, "");
    if (!l || PASSAGE_FURNITURE.test(l) || OPTIONS_TAIL.test(l)) continue;
    const br = l.match(Q_BRACKET);
    if (br && (lastNo === null || Number(br[1]) === lastNo + 1)) {
      if (pending.length > 0) {
        passages.push({ body: pending, qs: [] });
        pending = [];
      }
      if (passages.length === 0) return null;
      cur = { printed: Number(br[1]), prompt: br[2] ? [br[2]] : [], options: [], count: 0 };
      passages[passages.length - 1].qs.push(cur);
      lastNo = Number(br[1]);
      continue;
    }
    if (cur && cur.count === 0) {
      if (/^1(?:\s+|\s*[.．](?!\d))\S/.test(l)) {
        cur.options.push(l);
        cur.count = markerCount(l);
      } else cur.prompt.push(l);
      continue;
    }
    if (cur && cur.count < 4) {
      cur.options.push(l);
      cur.count = markerCount(cur.options.join(" "));
      continue;
    }
    pending.push(l); // a passage (or its footnote) after a finished question group
  }
  if (passages.length === 0) return null;
  // Text after the last question is a footnote: not contiguous with the passage, so it is kept as `notes`.
  if (pending.length > 0) passages[passages.length - 1].notes = pending;

  const stimuli: ParsedBlock["stimuli"] = [];
  const questions: ParsedQuestion[] = [];
  for (const [pi, ps] of passages.entries()) {
    const key = `s${pi + 1}`;
    let order = 0;
    for (const g of ps.qs) {
      const options = splitOptions(g.options.join(" "));
      const prompt = g.prompt.join("\n").trim();
      if (!options || !prompt) return null; // a question could not be read → the AI gets the block
      order += 1;
      questions.push({ no: questions.length + 1, ...(g.printed ? { printedNo: g.printed } : {}), prompt, options, stimulusKey: key, groupOrder: order });
    }
    stimuli.push({ key, kind, body: ps.body.join("\n"), ...(ps.notes ? { notes: ps.notes.join("\n") } : {}) });
  }
  return { stimuli, questions };
}
