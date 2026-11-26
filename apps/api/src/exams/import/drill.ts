import { classifyInstruction, SECTION_OF, type MondaiType } from "../mondai.js";
import { type AnswerKeyBlock } from "./answer-key.js";
import { cleanLine, isJunkLine } from "./clean.js";
import { type Block, type Segmented } from "./segment.js";

/**
 * Segmentation of a **drill book** (NP-407), a layout with no `問題 N` headings:
 * short rounds (`第7回` + a type banner + the usual instruction sentence) with
 * questions numbered `【31】`, and an answer booklet at the back made of
 * `【31】正解2` entries followed by explanations.
 *
 * One block per round. Question numbers restart for each type, so an answer is
 * matched by type + printed number; when that is not certain the block gets no
 * key (a reviewer fills it in) — never a guessed one.
 */

const BANNERS: Record<string, MondaiType> = {
  漢字読み: "kanji-reading",
  表記: "orthography",
  語形成: "word-formation",
  文脈規定: "context",
  言い換え類義: "paraphrase",
  用法: "usage",
  文法形式の判断: "grammar-form",
  文の組み立て: "star-order",
};

/** `【31】prompt` — an OCR may read the brackets as `[ ]` or `〔 〕`. */
const QUESTION = /^[【[〔]\s*(\d{1,3})\s*[】\]〕]\s*(.*)$/;
const ANSWER = /^[【[〔]\s*(\d{1,3})\s*[】\]〕][\s・･.\-–—]*正解\s*[:：]?\s*([1-4])(?!\d)/;
const ROUND = /^第\s*\d{1,3}\s*回$/;
const INSTRUCTION = /読み方として|漢字で書くとき|意味が最も近い|使い方として|に入れるのに最も|選びなさい/;
const PAPER_HEADING = /^問題\s*(?:\d{1,2}|I{1,3}|IV|V)\b/;
/** Score box, level tab, page number, table borders. */
const FURNITURE = /^(?:(?:日付|得点).*|[/|\s\d]+|N[1-5])$/;
/** A drop in numbering this large means the booklet moved on to the next type. */
const RESTART_DROP = 10;

const bannerOf = (line: string): MondaiType | undefined => BANNERS[line.replace(/\s+/g, "")];

const linesOfPage = (page: string): string[] =>
  page
    .split(/\n/)
    .map(cleanLine)
    .filter((l) => l && !isJunkLine(l));

/** A drill book numbers its questions `【n】` and (all but) never prints `問題 n`. */
export function isDrillBook(pages: string[]): boolean {
  let questions = 0;
  let headings = 0;
  for (const p of pages) {
    for (const l of linesOfPage(p)) {
      if (QUESTION.test(l)) questions += 1;
      else if (PAPER_HEADING.test(l)) headings += 1;
    }
  }
  return questions >= 3 && questions > headings * 10;
}

interface AnswerSection {
  type?: MondaiType;
  /** Printed number → answer; `null` when the booklet gives two different ones. */
  answers: Map<number, number | null>;
}

interface DraftBlock {
  type?: MondaiType;
  instruction: string;
  body: string[];
  numbers: number[];
  pageFrom: number;
  pageTo: number;
}

/** The type banner printed next to a `第N回` line (a side tab lists every type, so adjacency matters). */
function bannerNear(lines: string[], i: number): MondaiType | undefined {
  for (const d of [1, -1, 2, -2]) {
    const type = bannerOf(lines[i + d] ?? "");
    if (type) return type;
  }
  return undefined;
}

export function segmentDrillBook(pages: string[], level?: string): Segmented {
  const drafts: DraftBlock[] = [];
  const sections: AnswerSection[] = [];
  let current: DraftBlock | null = null;
  /** The banner of the round being opened, until its instruction or first question shows up. */
  let banner: MondaiType | undefined;
  let answerType: MondaiType | undefined;
  let lastAnswerNo = 0;
  let answersStarted = false;

  const open = (instruction: string, page: number): DraftBlock => {
    const block: DraftBlock = { type: banner, instruction, body: [], numbers: [], pageFrom: page, pageTo: page };
    banner = undefined;
    drafts.push(block);
    return block;
  };

  pages.forEach((p, index) => {
    const page = index + 1;
    const lines = linesOfPage(p);

    if (lines.some((l) => ANSWER.test(l))) {
      answersStarted = true;
      current = null;
      lines.forEach((l, i) => {
        if (ROUND.test(l)) {
          answerType = bannerNear(lines, i) ?? answerType;
          return;
        }
        const m = l.match(ANSWER);
        if (!m) return;
        const no = Number(m[1]);
        const value = Number(m[2]);
        let section = sections[sections.length - 1];
        if (!section || section.type !== answerType || lastAnswerNo - no >= RESTART_DROP) {
          section = { type: answerType, answers: new Map() };
          sections.push(section);
        }
        const seen = section.answers.get(no);
        section.answers.set(no, seen === undefined || seen === value ? value : null);
        lastAnswerNo = no;
      });
      return;
    }
    // Past the first answer page, only a page with an instruction is a question page (not explanations).
    if (answersStarted && !lines.some((l) => INSTRUCTION.test(l))) return;

    lines.forEach((l, i) => {
      if (ROUND.test(l)) {
        current = null;
        banner = bannerNear(lines, i);
        return;
      }
      if (bannerOf(l) || FURNITURE.test(l)) return;
      const question = l.match(QUESTION);
      if (!question && INSTRUCTION.test(l)) {
        // The sentence may wrap: a second line before any question belongs to the instruction.
        if (current && current.body.length === 0) current.instruction += ` ${l}`;
        else current = open(l, page);
        return;
      }
      if (question) {
        current ??= open("", page);
        current.numbers.push(Number(question[1]));
        // `N)prompt` is the form the rule reader and the AI both understand.
        current.body.push(`${question[1]})${question[2]}`);
      } else if (current) current.body.push(l);
      else return;
      current.pageTo = page;
    });
  });

  const kept = drafts.filter((d) => d.body.length > 0);
  const typed = kept.map((d) => ({ d, mondai: d.type ?? classifyInstruction(d.instruction, level, { section: "vocab" }) }));
  // The question side split the same way the booklet is: one run per consecutive type.
  const runs: number[] = [];
  typed.forEach((t, i) => {
    const prev = typed[i - 1];
    runs.push(!prev ? 0 : runs[i - 1] + (prev.mondai !== t.mondai || prev.d.numbers.at(-1)! - (t.d.numbers[0] ?? 0) >= RESTART_DROP ? 1 : 0));
  });
  const runCount = (runs.at(-1) ?? -1) + 1;

  const keyOf = (i: number): AnswerKeyBlock | undefined => {
    const { d, mondai } = typed[i];
    const covers = (s: AnswerSection) => d.numbers.some((n) => s.answers.has(n));
    const sameType = sections.filter((s) => s.type !== undefined && s.type === mondai);
    let hits = sameType.filter(covers);
    if (sameType.length === 0 && sections.length === runCount) {
      const s = sections[runs[i]];
      hits = s.type === undefined && covers(s) ? [s] : [];
    }
    if (hits.length !== 1) return undefined;
    return {
      heading: d.instruction,
      questionCount: d.numbers.length,
      pointsPerQuestion: 1,
      totalPoints: null,
      answers: d.numbers.map((n) => hits[0].answers.get(n) ?? null),
    };
  };

  const blocks: Block[] = typed.map(({ d, mondai }, i) => ({
    sitting: "unknown",
    sectionHint: mondai ? SECTION_OF[mondai] : "vocab",
    instruction: d.instruction,
    rawText: d.body.join("\n"),
    pageFrom: d.pageFrom,
    pageTo: d.pageTo,
    mondai,
    key: keyOf(i),
    note: mondai ? undefined : "không nhận dạng được dạng 問題 — cần duyệt tay",
  }));
  return { blocks, answerKey: "", sheetKeys: {} };
}
