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
const Q_BRACKET = /^(\d{1,2})\s*[)）]\s*(.*)$/;
/** `12 prompt` — papers that print the number without a bracket. */
const NUM_LINE = /^(\d{1,2})(?:\s+|(?=[「『（(]))(\S.*)$/;
/** Page furniture that lands inside a block: part banners, scoring notes, page footers. */
const FURNITURE = /^(?:[【\[].*[】\]]|\(\s*配点.*\)|\(\s*解答.*|ページ\s*\d+|N[1-5]|言語知識.*|\d{1,3})$/;
const TRAILING_PAGE = /\s*ページ\s*\d+$/;

/**
 * An option marker: `1 text`, `2.text`, `3 . text`, or `3.text` glued to the end of the
 * previous option (`…さない3.いじめない`). A `.` followed by a digit (`3.5`) is a decimal.
 */
const markerRe = () =>
  /(?:(?<=^|\s)([1-4])(?:\s*[.．](?!\d)\s*|\s+)|(?<=[^\d.\s])([1-4])[.．](?!\d)\s*)/g;

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
  if (!block.mondai || !RULE_TYPES.has(block.mondai as MondaiType)) return null;

  // The example box (問題例 / 解答の仕方) is fenced by two rule lines of underscores.
  const lines: string[] = [];
  let inExample = false;
  for (const raw of block.rawText.split("\n")) {
    const l = raw.trim();
    if (/^_{5,}$/.test(l)) {
      inExample = !inExample;
      continue;
    }
    if (inExample || !l || FURNITURE.test(l)) continue;
    lines.push(l.replace(TRAILING_PAGE, ""));
  }

  const groups: Group[] = [];
  for (const line of lines) {
    const cur = groups[groups.length - 1];
    const br = line.match(Q_BRACKET);
    if (br) {
      groups.push({ prompt: br[2] ? [br[2]] : [], options: [], count: 0 });
      continue;
    }
    // `1.有好 2.優好` (number + dot, no space) can only be an option line.
    const nl = line.match(NUM_LINE) ?? line.match(/^([1-4])[.．](?!\d)\s*(\S.*)$/);
    if (nl && cur && cur.count < 4 && Number(nl[1]) === cur.count + 1) {
      cur.options.push(line);
      cur.count = markerCount(cur.options.join(" "));
      continue;
    }
    if (nl && !(cur && cur.count > 0 && cur.count < 4)) {
      groups.push({ prompt: [nl[2]], options: [], count: 0 });
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
    if (!options || !prompt) continue; // unreadable → left to the validator / AI
    questions.push({ no: questions.length + 1, prompt, options });
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
    questions.push({ no: questions.length + 1, prompt: String(a.no), options, stimulusKey: "s1", groupOrder: questions.length + 1 });
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
