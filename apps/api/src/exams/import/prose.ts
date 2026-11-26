import { isGarbageText, pdfjsWasmUrl, renderPage } from "../../import/parsers/pdf.js";
import { UnsupportedFormatError } from "../../import/parsers/types.js";
import { extractFurigana, findStarSlots, findUnderlines, type Junk, type Mark, type Rule } from "./marks.js";

/**
 * A prose (exam) PDF page reader for JLPT import (NP-407). Unlike
 * `parsePdf` — which looks for a vocabulary table (STT column) — this reads the
 * page as flowing text: fragments are grouped into visual lines (top →
 * bottom, left → right) and CJK fragments are joined without a space. When a
 * page has no usable text layer, it is rendered to a PNG and read through the
 * caller's OCR callback (`ocrExamPageText`), the same image path the vocab
 * import uses.
 *
 * Kept DB-free and pure so the orchestration service (which checkpoints pages
 * and writes drafts) can be tested with a fake reader.
 */

/** One prose PDF: the number of pages + how to read each one as text. */
export interface ProsePdf {
  numPages: number;
  /** Pages the file really has — larger than `numPages` when the cap cut it. */
  totalPages: number;
  /** Read page `n` (1-based) as joined text lines. `""` for a blank page. */
  pageText(n: number): Promise<string>;
  /** Furigana + underlines of a page already read by `pageText` (text layer only; none for a scan). */
  pageMarks?(n: number): Mark[];
  /** The furigana lines removed from that page's text (to clean up an earlier import). */
  pageJunk?(n: number): Junk[];
  /** Release the parsed file; call once all reading is done. */
  close(): Promise<void>;
}

/** No service could read this page image: it is NOT a blank page and must be read again. */
export class OcrFailedError extends Error {
  constructor(readonly page: number) {
    super(`OCR failed on page ${page}`);
  }
}

/** Pages read per file. A 40-paper collection runs ~470 pages; text pages are read one at a time (page.cleanup) so RSS stays bounded. */
const MAX_EXAM_PAGES = 600;

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

async function loadPdfjs(): Promise<Pdfjs> {
  try {
    return await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    throw new UnsupportedFormatError("PDF support is unavailable");
  }
}

export type Frag = { x: number; y: number; w: number; s: string };

/**
 * The x of the gutter between two text columns, or `null` for a one-column
 * page. A gutter is a ≥10pt strip in the middle third that (almost) no
 * fragment crosses, with real text on both sides.
 */
export function findGutter(frags: Frag[], optionRule = true): number | null {
  if (frags.length < 12) return null;
  const minX = Math.min(...frags.map((f) => f.x));
  const maxX = Math.max(...frags.map((f) => f.x + f.w));
  const width = maxX - minX;
  if (width < 200) return null;
  const lo = Math.floor(minX + width * 0.35);
  const hi = Math.ceil(minX + width * 0.65);
  let best: { from: number; to: number } | null = null;
  let runFrom = -1;
  for (let x = lo; x <= hi + 1; x += 1) {
    const covered = x <= hi ? frags.filter((f) => f.x <= x && f.x + f.w >= x).length : Infinity;
    if (covered <= 2) {
      if (runFrom < 0) runFrom = x;
    } else if (runFrom >= 0) {
      if (!best || x - runFrom > best.to - best.from) best = { from: runFrom, to: x };
      runFrom = -1;
    }
  }
  if (!best || best.to - best.from < 10) return null;
  const g = (best.from + best.to) / 2;
  // Both columns must hold real prose lines (a table of digits has a gap too, but no long runs).
  const longLines = (side: Frag[]) => side.filter((f) => f.w >= 60).length;
  const left = frags.filter((f) => f.x + f.w / 2 < g);
  const right = frags.filter((f) => f.x + f.w / 2 >= g);
  if (longLines(left) < 6 || longLines(right) < 6) return null;

  // A row of answer options (`１ めぐまれた ２ かこまれた ３ | つつまれた ４ のまれた`) has wide gaps
  // that look like a gutter. The tell: the option numbers on the right CONTINUE those on the left
  // (…３ | ４). Two real columns each restart at １. Several such rows → an options table.
  const optNo = (f: Frag): number => (/^[1-4]$/.test(f.s.normalize("NFKC").trim()) ? Number(f.s.normalize("NFKC").trim()) : 0);
  const byRow = new Map<number, Frag[]>();
  for (const f of frags) {
    const k = Math.round(f.y / 4);
    byRow.set(k, [...(byRow.get(k) ?? []), f]);
  }
  let continuedRows = 0;
  for (const row of byRow.values()) {
    const nums = (side: Frag[]) => side.map(optNo).filter((n) => n > 0);
    const l = nums(row.filter((f) => f.x + f.w / 2 < g).sort((a, b) => a.x - b.x));
    const r = nums(row.filter((f) => f.x + f.w / 2 >= g).sort((a, b) => a.x - b.x));
    if (l.length > 0 && r.length > 0 && r[0] === l[l.length - 1] + 1) continuedRows += 1;
  }
  return optionRule && continuedRows >= 3 ? null : g;
}

/** Group a page's fragments into visual lines, top → bottom; a two-column page reads the left column, then the right. */
function linesOf(items: { str: string; x: number; y: number; w: number }[]): string[] {
  const frags: Frag[] = [];
  for (const it of items) {
    if (!it.str || it.str.trim() === "") continue;
    frags.push({ x: it.x, y: it.y, w: it.w, s: it.str });
  }
  const g = findGutter(frags);
  if (g === null) return lineBuckets(frags);

  // Lines that run across the gutter (titles, 問題 headings) split the page into bands;
  // inside each band the left column is read before the right one.
  const spans = (f: Frag) => f.x < g - 3 && f.x + f.w > g + 3;
  const spanning = frags.filter(spans);
  const rest = frags.filter((f) => !spans(f));
  const cuts = [...new Set(spanning.map((f) => Math.round(f.y)))].sort((a, b) => b - a);
  const out: string[] = [];
  let upper = Infinity;
  const band = (top: number, bottom: number) => {
    const inBand = rest.filter((f) => f.y < top && f.y >= bottom);
    out.push(...lineBuckets(inBand.filter((f) => f.x + f.w / 2 < g)), ...lineBuckets(inBand.filter((f) => f.x + f.w / 2 >= g)));
  };
  for (const cut of cuts) {
    band(upper, cut + 4);
    out.push(...lineBuckets(spanning.filter((f) => Math.round(f.y) === cut)));
    upper = cut - 4;
  }
  band(upper, -Infinity);
  return out;
}

/** Group a page's fragments into visual lines, top → bottom, left → right. */
function lineBuckets(frags: Frag[]): string[] {
  if (frags.length === 0) return [];

  // Bucket fragments that share a line (within a small y band), top first.
  // PDF user space has y growing UPWARD, so "top first" means y DESCENDING.
  const sorted = [...frags].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Frag[][] = [];
  for (const f of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].y - f.y) < 4) last.push(f);
    else lines.push([f]);
  }

  const out: string[] = [];
  for (const line of lines) {
    const byX = [...line].sort((a, b) => a.x - b.x);
    let text = "";
    let endX = -Infinity;
    for (const f of byX) {
      const t = f.s.trim();
      if (!t) continue;
      const cjk = /[぀-ヿ一-鿿]/.test(text.slice(-1)) && /[぀-ヿ一-鿿]/.test(t[0]);
      // CJK runs together (no space); a gap in x is a real word boundary.
      const space = cjk || f.x - endX <= 1 ? "" : " ";
      text += space + t;
      endX = f.x + f.w;
    }
    if (text.trim()) out.push(text.trim());
  }
  return out;
}

type Matrix = [number, number, number, number, number, number];

/** Path data is a flat list of `op, …coordinates`: 0 move, 1 line, 2 cubic, 3 quadratic, 4 close. */
function subPathBoxes(data: ArrayLike<number>, m: Matrix): Rule[] {
  const boxes: Rule[] = [];
  let box: Rule | null = null;
  const add = (x: number, y: number) => {
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    box = box
      ? { x0: Math.min(box.x0, px), y0: Math.min(box.y0, py), x1: Math.max(box.x1, px), y1: Math.max(box.y1, py) }
      : { x0: px, y0: py, x1: px, y1: py };
  };
  for (let i = 0; i < data.length; ) {
    const op = data[i++];
    if (op === 4) continue;
    if (op === 0 && box) {
      boxes.push(box);
      box = null;
    }
    const points = op === 2 ? 3 : op === 3 ? 2 : 1;
    for (let k = 0; k < points; k += 1, i += 2) add(data[i], data[i + 1]);
  }
  if (box) boxes.push(box);
  return boxes;
}

/**
 * The painted paths of a page, one box per sub-path, in page space (clipping paths
 * are not drawn, so skipped). One path often holds several separate lines.
 */
async function drawnRules(pdfjs: Pdfjs, page: { getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }> }): Promise<Rule[]> {
  const { OPS } = pdfjs;
  const ops = await page.getOperatorList();
  const invisible = new Set<number>([OPS.endPath, OPS.clip, OPS.eoClip]);
  const mul = (m: Matrix, n: number[]): Matrix => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const saved: Matrix[] = [];
  const out: Rule[] = [];
  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i] as unknown[];
    if (fn === OPS.save) saved.push(ctm);
    else if (fn === OPS.restore) ctm = saved.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as number[]);
    else if (fn === OPS.constructPath && !invisible.has(args[0] as number)) {
      for (const data of (args[1] as (ArrayLike<number> | null)[]) ?? []) {
        if (data) out.push(...subPathBoxes(data, ctm));
      }
    }
  });
  return out;
}

/**
 * Open an exam PDF and read its pages as prose. A page with no text layer is
 * rendered and OCR'd; a `null` from the reader throws {@link OcrFailedError} so
 * the caller never mistakes an unread page for a blank one.
 */
export async function openProsePdf(
  buffer: Buffer,
  ocr?: (png: Buffer, page: number) => Promise<string | null>,
): Promise<ProsePdf> {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, verbosity: 0, wasmUrl: pdfjsWasmUrl() }).promise;
  } catch {
    throw new UnsupportedFormatError("Cannot read this PDF");
  }
  const numPages = Math.min(doc.numPages, MAX_EXAM_PAGES);

  const marks = new Map<number, Mark[]>();
  const junk = new Map<number, Junk[]>();
  const pageText = async (n: number): Promise<string> => {
    const page = await doc.getPage(n);
    try {
      const content = await page.getTextContent();
      const runs = (content.items as { str?: string; transform: number[]; width?: number }[])
        .filter((it) => "str" in it)
        .map((it) => ({
          s: it.str ?? "",
          x: it.transform[4],
          y: it.transform[5],
          w: it.width ?? 0,
          h: Math.hypot(it.transform[2], it.transform[3]),
        }));
      // Furigana comes out of the body first: left in, it reads as junk lines between the real ones.
      const ruby = extractFurigana(runs);
      const lines = linesOf(ruby.body.map((r) => ({ str: r.s, x: r.x, y: r.y, w: r.w })));
      if (lines.length > 0 && !isGarbageText(lines.join(" "))) {
        // Underlines are a nicety: a page whose drawing cannot be read still imports.
        const rules = await drawnRules(pdfjs, page).catch(() => []);
        marks.set(n, [...ruby.marks, ...findUnderlines(ruby.body, rules), ...findStarSlots(ruby.body, rules)]);
        junk.set(n, ruby.junk);
        return lines.join("\n");
      }
      // No usable text layer → render + OCR (the scan path).
      if (!ocr) return lines.join("\n"); // empty when neither text nor an OCR callback
      // Render from the open document: re-opening the file per page costs its whole size each time.
      const png = await renderPage(page);
      const text = await ocr(png, n);
      if (text === null) throw new OcrFailedError(n);
      return text;
    } finally {
      page.cleanup();
      void doc.cleanup();
    }
  };

  return {
    numPages,
    totalPages: doc.numPages,
    pageText,
    pageMarks: (n) => marks.get(n) ?? [],
    pageJunk: (n) => junk.get(n) ?? [],
    close: () => doc.loadingTask.destroy(),
  };
}
