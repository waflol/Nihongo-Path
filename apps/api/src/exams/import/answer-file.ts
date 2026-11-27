/**
 * Answer file for an import job's review desk (NP-407): the reviewer fills the printed
 * answers in a file shaped like the paper and loads it, instead of typing them block by block.
 *
 * Two layouts:
 * - the template (`answerTemplate`), one row per question — `de,khoi,dang,cau,dap_an`
 *   (paper, desk block number, 問題, printed question number, answer); comma, semicolon or tab.
 *   `khoi` alone finds the block; without it, `de` + `dang` + `cau` (or `de` + `cau`) do.
 * - a short one, paper by paper and 問題 by 問題, answers in printed order:
 *       [2010-07]
 *       問題1: 3 1 4 2 2
 *       問題2: 31422
 */

/** One block of the job, as the matcher needs it. */
export interface AnswerFileDraft {
  id: string;
  blockIndex: number;
  sitting: string;
  /** The `N` of the block's `問題N` heading; null when the instruction prints none. */
  heading: number | null;
  /** Still under review (not published / discarded). */
  open: boolean;
  /** In block order: position `no`, the number the paper prints, and the option count. */
  questions: { no: number; printedNo: number; options: number }[];
}

/** One line of the file that carries answers. */
export interface AnswerFileRow {
  line: number;
  sitting?: string;
  block?: number;
  heading?: number;
  /** Table row: the printed question number. */
  no?: number;
  /** Table row: one answer; short row: the 問題's answers in order (0 = left blank). */
  answers: number[];
}

export interface AnswerFileMatch {
  /** Answers per draft, indexed by `no - 1`; 0 = the file does not give one. */
  given: Map<string, number[]>;
  /** How many answers the file gave that found their question. */
  matched: number;
  problems: string[];
}

const nfkc = (s: string) => s.normalize("NFKC").trim();

/** `2010年7月`, `2010-07`, `7/2010` → `2010-07`; anything else is compared case- and space-insensitively. */
export function sittingKey(s: string): string {
  const t = nfkc(s).toLowerCase();
  const ym = /(\d{4})\D{1,3}(\d{1,2})(?!\d)/.exec(t);
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`;
  const my = /^(\d{1,2})\D(\d{4})$/.exec(t);
  if (my) return `${my[2]}-${my[1].padStart(2, "0")}`;
  return t.replace(/[\s[\]]/g, "");
}

/** The `N` of the instruction's leading `問題N`. */
export function headingOf(instruction: string): number | null {
  const m = /問題\s*(\d{1,2})/.exec(nfkc(instruction ?? ""));
  return m ? Number(m[1]) : null;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",;\t\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The template: one row per question of every block, with the answers known so far. */
export function answerTemplate(drafts: AnswerFileDraft[], answersOf: (id: string) => number[]): string {
  const rows = [["de", "khoi", "dang", "cau", "dap_an"].join(",")];
  for (const d of [...drafts].sort((a, b) => a.blockIndex - b.blockIndex)) {
    const answers = answersOf(d.id);
    for (const q of d.questions) {
      const a = answers[q.no - 1] ?? 0;
      rows.push([d.sitting, d.blockIndex + 1, d.heading != null ? `問題${d.heading}` : "", q.printedNo, a > 0 ? a : ""].map(csvCell).join(","));
    }
  }
  // BOM: Excel opens UTF-8 (問題) correctly only with it.
  return `﻿${rows.join("\r\n")}\r\n`;
}

/** Header names, without accents/spaces, → column. */
const COLUMNS: Record<string, keyof Omit<AnswerFileRow, "line" | "answers"> | "answer"> = {
  de: "sitting",
  dethi: "sitting",
  sitting: "sitting",
  paper: "sitting",
  khoi: "block",
  block: "block",
  dang: "heading",
  mondai: "heading",
  問題: "heading",
  cau: "no",
  socau: "no",
  no: "no",
  question: "no",
  dapan: "answer",
  answer: "answer",
  解答: "answer",
  正解: "answer",
  答え: "answer",
};

const headerKey = (s: string) =>
  nfkc(s)
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s_\-.]/g, "");

function splitCells(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** `3 1 4 2`, `3,1,4,2`, `3142` → [3,1,4,2]; `-`, `_`, `?`, `0` leave that question blank. */
function answerList(s: string): number[] | null {
  const t = nfkc(s);
  if (/^[0-9\-_?]+$/.test(t)) return [...t].map((c) => (/[1-9]/.test(c) ? Number(c) : 0));
  const parts = t.split(/[\s,、;，]+/).filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !/^(?:\d{1,2}|[-_?])$/.test(p))) return null;
  return parts.map((p) => (/^\d+$/.test(p) ? Number(p) : 0));
}

const int = (s: string | undefined): number | undefined => {
  const t = nfkc(s ?? "").replace(/^問題\s*/, "");
  return /^\d{1,4}$/.test(t) ? Number(t) : undefined;
};

/** Read the file's answer rows; `problems` = lines that look meant but cannot be read. */
export function parseAnswerFile(text: string): { rows: AnswerFileRow[]; problems: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r\n?|\n/);
  const rows: AnswerFileRow[] = [];
  const problems: string[] = [];
  let columns: (string | undefined)[] | null = null;
  let sep = ",";
  let sitting: string | undefined;

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const at = `dòng ${i + 1}`;
    if (!line || line.startsWith("#") || line.startsWith("//")) return;

    // A header row switches to the table layout for the rest of the file.
    if (!columns) {
      const s = ["\t", ";", ","].find((c) => line.includes(c));
      const cells = s ? splitCells(line, s).map((c) => COLUMNS[headerKey(c)]) : [];
      if (s && cells.filter(Boolean).length >= 2) {
        if (!cells.includes("answer")) problems.push(`${at}: dòng tiêu đề thiếu cột đáp án (dap_an)`);
        columns = cells;
        sep = s;
        return;
      }
    }

    if (columns) {
      const cells = splitCells(line, sep);
      const get = (k: string) => {
        const j = columns!.indexOf(k);
        return j >= 0 ? cells[j] : undefined;
      };
      const answerCell = nfkc(get("answer") ?? "");
      if (!answerCell || /^[-_?0]$/.test(answerCell)) return; // left blank in the template
      const answer = int(answerCell);
      const row: AnswerFileRow = { line: i + 1, answers: [answer ?? -1] };
      const sit = get("sitting");
      if (sit) row.sitting = sit;
      row.block = int(get("block"));
      row.heading = int(get("heading"));
      row.no = int(get("no"));
      if (answer === undefined) problems.push(`${at}: đáp án "${answerCell}" không phải số`);
      else if (row.no === undefined) problems.push(`${at}: thiếu số câu (cau)`);
      else rows.push(row);
      return;
    }

    // Short layout: a paper label, then 問題N with its answers.
    const label = /^\[(.+)\]$/.exec(line) ?? /^(?:đề thi|đề|de thi|de)(?:\s*[:：]\s*|\s+)(.+)$/i.exec(line);
    if (label) {
      sitting = label[1].trim();
      return;
    }
    const m = /^問題\s*(\d{1,2})\s*[:：.．)）-]?\s*(.*)$/.exec(nfkc(line));
    if (m) {
      const answers = answerList(m[2]);
      if (!answers || answers.length === 0) problems.push(`${at}: không đọc được đáp án sau 問題${m[1]}`);
      else rows.push({ line: i + 1, sitting, heading: Number(m[1]), answers });
      return;
    }
    problems.push(`${at}: không hiểu dòng này — dùng file mẫu, hoặc dạng "問題1: 3 1 4 2"`);
  });
  return { rows, problems };
}

/** Put each row's answers on its block's questions. Rows that find nothing, or an answer out of range, become problems. */
export function matchAnswerFile(rows: AnswerFileRow[], drafts: AnswerFileDraft[]): AnswerFileMatch {
  const given = new Map<string, number[]>();
  const problems: string[] = [];
  const closed = new Set<number>();
  let matched = 0;
  const sittings = [...new Set(drafts.map((d) => sittingKey(d.sitting)))];
  const ordered = [...drafts].sort((a, b) => a.blockIndex - b.blockIndex);
  const label = (d: AnswerFileDraft, q: { printedNo: number }) => `câu ${q.printedNo} (khối ${d.blockIndex + 1})`;

  const put = (d: AnswerFileDraft, q: AnswerFileDraft["questions"][number], a: number, at: string): void => {
    if (!d.open) {
      closed.add(d.blockIndex + 1);
      return;
    }
    if (a < 1 || a > q.options) {
      problems.push(`${at}: ${label(d, q)} chỉ có ${q.options} phương án, file ghi ${a}`);
      return;
    }
    const list = given.get(d.id) ?? Array.from({ length: Math.max(0, ...d.questions.map((x) => x.no)) }, () => 0);
    const before = list[q.no - 1];
    if (before > 0 && before !== a) problems.push(`${at}: ${label(d, q)} có 2 đáp án trong file (${before} và ${a}) — lấy ${a}`);
    if (!(before > 0)) matched += 1;
    list[q.no - 1] = a;
    given.set(d.id, list);
  };

  for (const r of rows) {
    const at = `dòng ${r.line}`;
    // Rows without a paper label belong to the only paper, when there is just one.
    const sit = r.sitting ? sittingKey(r.sitting) : sittings.length === 1 ? sittings[0] : undefined;

    if (r.no !== undefined) {
      let pool = ordered;
      if (r.block !== undefined) pool = ordered.filter((d) => d.blockIndex + 1 === r.block);
      else {
        if (!sit) {
          problems.push(`${at}: thiếu cột khoi hoặc de — lần nhập có ${sittings.length} đề`);
          continue;
        }
        pool = ordered.filter((d) => sittingKey(d.sitting) === sit && (r.heading === undefined || d.heading === r.heading));
      }
      const hits = pool.flatMap((d) => d.questions.filter((q) => q.printedNo === r.no).map((q) => ({ d, q })));
      if (hits.length === 1) put(hits[0].d, hits[0].q, r.answers[0], at);
      else if (hits.length === 0) {
        const where = r.block !== undefined ? ` trong khối ${r.block}` : r.sitting ? ` của đề ${r.sitting}` : "";
        problems.push(`${at}: không tìm thấy câu ${r.no}${where}${r.heading !== undefined && r.block === undefined ? ` (問題${r.heading})` : ""}`);
      }
      else problems.push(`${at}: câu ${r.no} có ở ${hits.length} khối — ghi thêm cột khoi hoặc dang`);
      continue;
    }

    // Short row: the 問題's questions in printed order (a 問題 may span several blocks).
    if (!sit) {
      problems.push(`${at}: chưa ghi đề — thêm một dòng [2010-07] phía trên (lần nhập có ${sittings.length} đề)`);
      continue;
    }
    const blocks = ordered.filter((d) => sittingKey(d.sitting) === sit && d.heading === r.heading);
    const qs = blocks.flatMap((d) => d.questions.map((q) => ({ d, q })));
    if (qs.length === 0) {
      problems.push(`${at}: đề ${r.sitting ?? sit} không có 問題${r.heading}`);
      continue;
    }
    if (qs.length !== r.answers.length) {
      problems.push(`${at}: 問題${r.heading} của đề ${r.sitting ?? sit} có ${qs.length} câu, file ghi ${r.answers.length} đáp án — bỏ qua dòng này`);
      continue;
    }
    qs.forEach(({ d, q }, i) => {
      if (r.answers[i] > 0) put(d, q, r.answers[i], at);
    });
  }
  if (closed.size > 0) problems.push(`khối ${[...closed].join(", ")} đã xuất bản hoặc đã loại — bỏ qua đáp án của các khối này`);
  return { given, matched, problems };
}

/**
 * The draft's answers after loading the file: an empty answer takes the file's; one already
 * set is replaced only with `overwrite`.
 */
export function mergeAnswers(current: number[], given: number[], overwrite: boolean): number[] {
  const out = [...current];
  given.forEach((a, i) => {
    if (a > 0 && (overwrite || !(out[i] > 0))) out[i] = a;
  });
  for (let i = 0; i < out.length; i++) out[i] = out[i] > 0 ? out[i] : 0;
  return out;
}
