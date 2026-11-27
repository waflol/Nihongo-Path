import { classifyListening, normalizeInstruction, optionCountsOf, type MondaiType } from "../mondai.js";
import { mondaiNumberOf } from "./mondai-table.js";
import type { ParsedBlock, ParsedQuestion, ParsedStimulus } from "./structure.js";

/**
 * 聴解 blocks of an imported paper (NP-407). The question booklet prints little:
 * `1番` headings, and the options of 課題理解 / ポイント理解 / the 質問 of 統合理解;
 * 概要理解 and 即時応答 print nothing but 「メモ」. So a listening block is read by
 * rules (never the AI): one question per `N番` (or per 質問 under it), the printed
 * options where there are some, numbered placeholders "1" "2" "3" ("4") where the
 * options are only heard.
 */

type ListeningMondai = Extract<MondaiType, `listening-${string}`>;

const T: ListeningMondai = "listening-task";
const P: ListeningMondai = "listening-point";
const S: ListeningMondai = "listening-summary";
const U: ListeningMondai = "listening-utterance";
const Q: ListeningMondai = "listening-quick";
const I: ListeningMondai = "listening-integrated";

/**
 * The official 聴解 layout (jlpt.jp 「問題の構成」): the type of each 問題 number and its
 * usual number of questions. The count only matters for a 問題 that prints nothing
 * (概要理解, 即時応答) — a guide the reviewer can change, as the official table says.
 */
export const LISTENING_LAYOUT: Record<string, readonly { mondai: ListeningMondai; count: number }[]> = {
  N1: [
    { mondai: T, count: 5 },
    { mondai: P, count: 6 },
    { mondai: S, count: 5 },
    { mondai: Q, count: 11 },
    { mondai: I, count: 3 },
  ],
  N2: [
    { mondai: T, count: 5 },
    { mondai: P, count: 6 },
    { mondai: S, count: 5 },
    { mondai: Q, count: 11 },
    { mondai: I, count: 3 },
  ],
  N3: [
    { mondai: T, count: 6 },
    { mondai: P, count: 6 },
    { mondai: S, count: 3 },
    { mondai: U, count: 4 },
    { mondai: Q, count: 9 },
  ],
  N4: [
    { mondai: T, count: 8 },
    { mondai: P, count: 7 },
    { mondai: U, count: 5 },
    { mondai: Q, count: 8 },
  ],
  N5: [
    { mondai: T, count: 7 },
    { mondai: P, count: 6 },
    { mondai: U, count: 5 },
    { mondai: Q, count: 6 },
  ],
};

const layoutOf = (level: string | undefined, no: number | null) =>
  no ? LISTENING_LAYOUT[(level ?? "").trim().toUpperCase()]?.[no - 1] : undefined;

/**
 * The type of a listening 問題: its wording first, then its printed number (the
 * number alone is enough when OCR damaged the wording). `note` when the two disagree.
 */
export function listeningMondai(
  text: string,
  level: string | undefined,
  no: number | null,
): { mondai: MondaiType; note?: string } {
  const byText = classifyListening(normalizeInstruction(text));
  const byNo = layoutOf(level, no)?.mondai ?? null;
  if (byText && byNo && byText !== byNo) {
    return { mondai: byText, note: `dạng nghe theo lời dẫn (${byText}) khác dạng theo số 問題 ${no} của ${level} (${byNo}) — kiểm tra lại` };
  }
  return { mondai: byText ?? byNo ?? "listening" };
}

/** Types whose options are printed in the booklet (as text — or as pictures, which OCR cannot read). */
const PRINTS_OPTIONS = new Set<string>([T, P]);

/** `1番` / `1 ばん`, maybe followed by that question's own instruction on the same line. */
const HEADING = /^(\d{1,2})\s*(?:番|ばん)\s*(.*)$/;
/** `質問1` — one of two questions about the same talk (統合理解). */
const SUB = /^(?:質問|しつもん)\s*(\d)\s*(.*)$/;
const OPTION = /^([1-4])\s*(?:[.．)）]\s*)?(\S.*)$/;
/** The 「メモ」 box of a 問題 that prints nothing; a bare page number. */
const MEMO = /^[\s―ー一\-－]*メモ[\s―ー一\-－]*$/;
const PAGE_NO = /^\d{1,3}$/;
/** What a `N番` line says when it is a heading with its own instruction, not an option. */
const INSTRUCTION_START = /^(?:まず|問題用紙|もんだいようし|はじめに|それから|絵を|えを)/;

interface Item {
  no: number;
  text: string;
  options: string[];
  subs: { k: number; options: string[] }[];
}

export interface ListeningRead {
  /** The 問題 instruction, with the part that wrapped onto the block's first lines put back. */
  instruction: string;
  parsed: ParsedBlock;
  issues: string[];
}

/**
 * Read one listening block. `keyCount` = how many questions the printed answer key gives
 * for it (0 = no key): it decides the count of a block that prints no `N番`.
 */
export function parseListening(
  block: { instruction: string; rawText: string; mondai?: string | null },
  level: string | undefined,
  keyCount = 0,
): ListeningRead {
  const mondai = block.mondai ?? "listening";
  const n = optionCountsOf(mondai)[0];
  const placeholders = Array.from({ length: n }, (_, i) => String(i + 1));
  const lines = (block.rawText ?? "")
    .normalize("NFKC")
    // OCR glues the next 質問 onto the last option (`4 4番の自転車質問2`).
    .replace(/(\S)[ \t]*((?:質問|しつもん)\s*\d)/g, "$1\n$2")
    // Picture labels side by side (発話表現: `1 番 2 番`): one heading each.
    .replace(/(\d{1,2}\s*(?:番|ばん))[ \t]+(?=\d{1,2}\s*(?:番|ばん)(?:\s|$))/g, "$1\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !MEMO.test(l) && !PAGE_NO.test(l));

  const lead: string[] = [];
  const items: Item[] = [];
  let cur: Item | null = null;
  let sub: Item["subs"][number] | null = null;
  for (const line of lines) {
    const h = HEADING.exec(line);
    const target = sub ?? cur;
    // `4 番組を見る` could be option 4; a heading is empty or opens with its own instruction.
    const asOption = h && target && Number(h[1]) === target.options.length + 1 && target.options.length < n && h[2] && !INSTRUCTION_START.test(h[2]);
    if (h && !asOption) {
      cur = { no: Number(h[1]), text: h[2].trim(), options: [], subs: [] };
      sub = null;
      items.push(cur);
      continue;
    }
    const s = SUB.exec(line);
    if (s && cur) {
      sub = { k: Number(s[1]), options: [] };
      cur.subs.push(sub);
      continue;
    }
    const o = OPTION.exec(line);
    if (o && target && Number(o[1]) === target.options.length + 1 && target.options.length < n) {
      target.options.push(o[2].trim());
      continue;
    }
    if (!cur) lead.push(line);
    else if (target && target.options.length > 0) target.options[target.options.length - 1] += line; // a wrapped option
    else cur.text += line;
  }

  const issues: string[] = [];
  const stimuli: ParsedStimulus[] = [];
  const questions: ParsedQuestion[] = [];
  const printed = PRINTS_OPTIONS.has(mondai);
  const optionsOf = (label: string, read: string[], expectPrinted: boolean): string[] => {
    if (read.length === n) return read;
    if (read.length > 0) issues.push(`${label}: chỉ đọc được ${read.length}/${n} phương án — xem ảnh trang rồi sửa trong Chỉnh sửa`);
    else if (expectPrinted) issues.push(`${label}: không đọc được phương án (có thể là hình) — cắt hình cho câu này từ ảnh trang, hoặc nhập trong Chỉnh sửa`);
    return placeholders;
  };

  if (items.length === 0) {
    // Nothing printed (概要理解, 即時応答): the key, or the official layout, gives the count.
    const count = keyCount || layoutOf(level, mondaiNumberOf(block.instruction))?.count || 0;
    if (count === 0) issues.push("đề không in số câu của phần này — thêm câu trong Chỉnh sửa");
    for (let i = 1; i <= count; i++) questions.push({ no: i, printedNo: i, prompt: `${i}番`, options: [...placeholders] });
  } else {
    for (const it of items) {
      if (it.subs.length === 0) {
        questions.push({ no: 0, printedNo: it.no, prompt: `${it.no}番`, options: optionsOf(`${it.no}番`, it.options, printed) });
        continue;
      }
      const key = `s${it.no}`;
      stimuli.push({ key, kind: "listening", body: it.text || `${it.no}番` });
      it.subs.forEach((sq, i) => {
        questions.push({
          no: 0,
          printedNo: it.no,
          prompt: `${it.no}番 質問${sq.k}`,
          options: optionsOf(`${it.no}番 質問${sq.k}`, sq.options, true),
          stimulusKey: key,
          groupOrder: i + 1,
        });
      });
    }
    const nos = items.map((it) => it.no);
    const missing = Array.from({ length: Math.max(...nos) }, (_, i) => i + 1).filter((k) => !nos.includes(k));
    if (missing.length > 0) issues.push(`thiếu ${missing.map((k) => `${k}番`).join(", ")} — xem ảnh trang`);
  }
  questions.forEach((q, i) => (q.no = i + 1));
  if (mondai === U && questions.length > 0) issues.push("発話表現: mỗi câu có một hình minh hoạ — cắt hình cho từng câu từ ảnh trang");
  if (keyCount > 0 && questions.length !== keyCount) {
    issues.push(`số câu đọc được (${questions.length}) khác bảng đáp án (${keyCount})`);
  }

  // The instruction wraps onto the block's first lines (`…の中か` / `ら、最もよいものを…`).
  const instruction = [block.instruction.trimEnd(), ...lead].join("");
  return { instruction, parsed: { stimuli, questions }, issues };
}
