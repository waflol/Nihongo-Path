import type { OcrRow, Table } from "./types.js";
import { EmptyTableError, UnsupportedFormatError, sanitizeHeaderCell } from "./types.js";

/**
 * PDF vocabulary-table reader (P3-IMPORT-05).
 *
 * Plain text extraction loses the table (wrapped cells, footers and
 * headers get interleaved), so this reads every text fragment **with its
 * position** and rebuilds the grid:
 *
 * 1. The header row is the line that contains the `STT` cell; its fragments
 *    are merged into column names (they are often split mid-word).
 * 2. Each body fragment is assigned to the nearest column.
 * 3. A row is anchored on its number (`1`, `2.`, …) in the STT column; every
 *    other fragment joins the nearest anchor, so cells wrapped over several
 *    lines stay together. Fragments far from any anchor (page footers) drop.
 *
 * Only PDFs with a real text layer work; a scan yields an error, not OCR.
 * A text layer produced by a bad OCR pass (symbol soup instead of words) is
 * detected per page and ignored, so garbage never reaches the preview.
 */

const MAX_PAGES = 600;
/** Pages sent to a vision model per import (each is one AI call). */
const MAX_OCR_PAGES = 300;
const OCR_CONCURRENCY = 3;

/** Pages finished / total — drives the import progress bar. */
export type ProgressFn = (done: number, total: number) => void;

/**
 * Per-page checkpoint of an OCR run: pages already read (`saved`) are skipped,
 * and `save` is called after every page so a restart loses nothing.
 */
export interface PageStore {
  saved: Map<number, OcrRow[]>;
  save: (page: number, rows: OcrRow[] | null) => Promise<void> | void;
}

/** Reads one rendered page image; `null` = no service could read it. */
export type PageOcr = (png: Buffer, page: number) => Promise<OcrRow[] | null>;
/** Fragments closer than this (PDF units) are one word. */
const WORD_GAP = 2;
/** Header fragments closer than this belong to the same column title. */
const HEADER_GAP = 12;

interface Frag {
  x: number;
  y: number;
  w: number;
  s: string;
}

interface Column {
  name: string;
  left: number;
  center: number;
}

const CJK = /[぀-ヿ㐀-鿿]/;

/** Characters that real vocabulary text almost never contains but bad OCR emits constantly. */
const JUNK = /[;\\^*`~|<>{}[\]=+#@&%$_]/g;

/**
 * True when a page's text layer looks like failed OCR: a high share of stray
 * symbols (`EA;SArotfi'f bt 5. +-h`), or long Latin-only soup with no Japanese
 * and no vocabulary table header on a page that should have both.
 */
export function isGarbageText(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 30) return false; // too short to judge
  const junk = (compact.match(JUNK) ?? []).length;
  const cjk = (compact.match(/[぀-ヿ㐀-鿿]/g) ?? []).length;
  const apostrophes = (compact.match(/['"\\]/g) ?? []).length;
  const symbolRatio = (junk + apostrophes * 0.5) / compact.length;
  if (symbolRatio > 0.1) return true;
  return cjk === 0 && junk / compact.length > 0.04;
}

function join(parts: string[]): string {
  let out = "";
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (out === "") out = t;
    else out += CJK.test(out.slice(-1)) && CJK.test(t[0]) ? t : ` ${t}`;
  }
  return out;
}

/** Concatenate fragments of one visual line, left to right. */
function lineText(frags: Frag[]): string {
  const sorted = [...frags].sort((a, b) => a.x - b.x);
  let out = "";
  let end = -Infinity;
  for (const f of sorted) {
    const t = f.s;
    if (t.trim() === "") continue;
    out += out && f.x - end > WORD_GAP ? ` ${t.trim()}` : t.trim();
    end = f.x + f.w;
  }
  return out;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

function headerColumns(frags: Frag[], headerY: number): Column[] {
  const line = frags
    .filter((f) => Math.abs(f.y - headerY) < 4 && f.s.trim() !== "")
    .sort((a, b) => a.x - b.x);
  const cells: { text: string; left: number; right: number }[] = [];
  for (const f of line) {
    const last = cells[cells.length - 1];
    if (last && f.x - last.right < HEADER_GAP) {
      last.text += f.x - last.right > WORD_GAP ? ` ${f.s.trim()}` : f.s.trim();
      last.right = f.x + f.w;
    } else {
      cells.push({ text: f.s.trim(), left: f.x, right: f.x + f.w });
    }
  }
  return cells.map((c) => ({
    name: c.text,
    left: c.left,
    center: (c.left + c.right) / 2,
  }));
}

function columnOf(f: Frag, cols: Column[]): number {
  let best = 0;
  let bestScore = Infinity;
  const center = f.x + f.w / 2;
  cols.forEach((c, i) => {
    // Cells are either left-aligned or centred under their title.
    const score = Math.min(Math.abs(f.x - c.left), Math.abs(center - c.center));
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Render one page to a PNG (scale 2 ≈ 150 dpi: sharp enough for kanji). */
async function renderPage(page: import("pdfjs-dist/legacy/build/pdf.mjs").PDFPageProxy): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  }).promise;
  return canvas.toBuffer("image/png");
}

const OCR_ATTEMPTS = 4;
const OCR_RETRY_MS = 15_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read a page, retrying (a rate-limited service recovers within a minute). */
export async function ocrWithRetry(
  png: Buffer,
  page: number,
  ocr: PageOcr,
  retryMs = OCR_RETRY_MS,
): Promise<OcrRow[] | null> {
  for (let attempt = 0; attempt < OCR_ATTEMPTS; attempt++) {
    const rows = await ocr(png, page);
    if (rows) return rows;
    if (attempt < OCR_ATTEMPTS - 1) await sleep(retryMs * (attempt + 1));
  }
  return null;
}

const VARIANT_SEP = /[/／。、;；]/;
const OPEN = "（(「[【";
const CLOSE = "）)」]】";

/** Split on variant separators that are not inside brackets (`割り合い（に・と）` stays whole). */
function splitOutsideBrackets(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && VARIANT_SEP.test(ch)) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/**
 * One printed line holding two spellings of the same word (`戦う。闘う`,
 * `戦う/闘う`) becomes one entry per spelling: same number, reading, Hán Việt
 * and meaning. Safe to apply twice.
 */
export function splitVariants(row: OcrRow): OcrRow[] {
  const words = splitOutsideBrackets(row.word);
  if (words.length < 2 || words.some((w) => w.length < 2 || !CJK.test(w))) return [row];
  const readings = splitOutsideBrackets(row.reading);
  return words.map((word, i) => ({
    ...row,
    word,
    reading: readings.length === words.length ? readings[i] : row.reading,
  }));
}

/** Assemble the import table from what each page yielded. */
export function tableFromOcrPages(raw: (OcrRow[] | null)[]): Table {
  const pages = raw.map((list) => (list ? list.flatMap(splitVariants) : list));
  const rows: Record<string, string>[] = [];
  let auto = 0;
  // Entries sharing a printed number (variants of one word) or lacking one
  // (sub-lines) keep that number and, when blank, its meaning.
  let lastNo = "";
  let lastMeaning = "";
  pages.forEach((list, i) => {
    for (const r of list ?? []) {
      auto++;
      const numbered = /^\d{1,5}$/.test(r.no);
      const no = numbered ? r.no : lastNo || String(auto);
      const sameGroup = !numbered || r.no === lastNo;
      const meaning = r.meaning || (sameGroup ? lastMeaning : "");
      if (numbered) lastNo = r.no;
      if (r.meaning) lastMeaning = r.meaning;
      else if (!sameGroup) lastMeaning = "";
      rows.push({
        STT: no,
        "Từ vựng": r.word,
        Hiragana: r.reading,
        "Âm Hán Việt": r.hanViet ?? "",
        Nghĩa: meaning,
        Trang: String(i + 1),
      });
    }
  });
  return {
    columns: ["STT", "Từ vựng", "Hiragana", "Âm Hán Việt", "Nghĩa", "Trang"],
    rows,
    format: "pdf",
    ocr: { pages },
  };
}

/**
 * Entries that share a printed number with another entry (variants of one
 * word, e.g. 計る/測る/量る) or have no number at all (sub-lines). Returned per
 * page, per row, so the review can point at the rows that make the count
 * exceed the number of entries in the book.
 */
export function rowNumberIssues(pages: (OcrRow[] | null)[]): (("nonum" | "dupno" | undefined)[])[] {
  const count = new Map<string, number>();
  for (const list of pages) {
    for (const r of list ?? []) if (/^\d{1,5}$/.test(r.no)) count.set(r.no, (count.get(r.no) ?? 0) + 1);
  }
  return pages.map((list) =>
    (list ?? []).map((r) => (!/^\d{1,5}$/.test(r.no) ? "nonum" : (count.get(r.no) ?? 0) > 1 ? "dupno" : undefined)),
  );
}

/** Render one page of a PDF (1-based) to PNG — for review and single-page retries. */
export async function renderPdfPage(buffer: Buffer, n: number): Promise<Buffer> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, verbosity: 0 }).promise;
  if (n < 1 || n > doc.numPages) throw new UnsupportedFormatError(`Page ${n} does not exist`);
  try {
    return await renderPage(await doc.getPage(n));
  } finally {
    void doc.cleanup();
  }
}

/** OCR every page through a vision model and shape the result as a table. */
async function ocrTable(
  doc: import("pdfjs-dist/legacy/build/pdf.mjs").PDFDocumentProxy,
  ocr: PageOcr,
  onProgress?: ProgressFn,
  store?: PageStore,
): Promise<Table> {
  if (doc.numPages > MAX_OCR_PAGES) {
    throw new UnsupportedFormatError(
      `Scanned PDF has ${doc.numPages} pages; OCR is limited to ${MAX_OCR_PAGES} — split the file`,
    );
  }
  const perPage: (OcrRow[] | null)[] = new Array(doc.numPages).fill(null);
  let next = 1;
  let finished = 0;
  for (const [n, rows] of store?.saved ?? []) {
    if (n >= 1 && n <= doc.numPages) {
      perPage[n - 1] = rows;
      finished++;
    }
  }
  onProgress?.(finished, doc.numPages);
  const worker = async () => {
    while (next <= doc.numPages) {
      const n = next++;
      if (store?.saved.has(n)) continue; // read before the restart
      const page = await doc.getPage(n);
      const png = await renderPage(page);
      perPage[n - 1] = await ocrWithRetry(png, n, ocr);
      page.cleanup();
      try {
        await store?.save(n, perPage[n - 1]);
      } catch {
        /* checkpointing is best effort — never fail the read over it */
      }
      finished++;
      onProgress?.(finished, doc.numPages);
    }
  };
  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, doc.numPages) }, worker));

  const table = tableFromOcrPages(perPage);
  if (table.rows.length === 0) {
    throw new UnsupportedFormatError(
      perPage.every((r) => r === null)
        ? "OCR failed: no AI service with image (vision) support is available — add a Gemini / Claude / GPT-4o service in the admin AI page"
        : "OCR found no vocabulary entries in this PDF",
    );
  }
  return table;
}

export async function parsePdf(
  buffer: Buffer,
  ocr?: PageOcr,
  onProgress?: ProgressFn,
  store?: PageStore,
): Promise<Table> {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    throw new UnsupportedFormatError("PDF support is unavailable");
  }

  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
  } catch {
    throw new UnsupportedFormatError("Cannot read this PDF");
  }
  if (doc.numPages > MAX_PAGES) {
    throw new UnsupportedFormatError(
      `PDF has ${doc.numPages} pages; the limit is ${MAX_PAGES}`,
    );
  }

  let cols: Column[] | null = null;
  let sttIndex = 0;
  const records: string[][] = [];
  const recordPages: number[] = [];
  let sawText = false;
  let garbagePages = 0;
  let judgedPages = 0;

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const frags: Frag[] = [];
    for (const it of content.items) {
      if (!("str" in it) || it.str.trim() === "") continue;
      frags.push({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str });
    }
    if (frags.length > 0) sawText = true;
    if (frags.length > 0) {
      judgedPages++;
      if (isGarbageText(frags.map((f) => f.s).join(" "))) {
        garbagePages++;
        continue; // failed-OCR page: drop it rather than import junk
      }
    }
    // A scan has no text at all: say so after a few pages instead of walking
    // hundreds of empty ones (a 50 MB scanned book would take minutes).
    if (n === 5 && !sawText) break;

    // The header row = the line holding the STT cell. Pages without one
    // (continuations) reuse the previous page's columns.
    const stt = frags.find((f) => /^STT$/i.test(f.s.trim()));
    let bodyTop = Infinity;
    if (stt) {
      cols = headerColumns(frags, stt.y);
      sttIndex = 0;
      bodyTop = stt.y - 4;
    }
    if (!cols || cols.length < 2) continue;

    const body = frags.filter((f) => f.y < bodyTop);
    // Row anchors: the number cell in the STT column.
    const anchors = body
      .filter(
        (f) =>
          columnOf(f, cols!) === sttIndex && /^\d{1,5}\.?$/.test(f.s.trim()),
      )
      .sort((a, b) => b.y - a.y);
    if (anchors.length === 0) continue;

    const pitch = median(
      anchors.slice(1).map((a, i) => anchors[i].y - a.y).filter((d) => d > 0),
    );
    const reach = pitch > 0 ? pitch * 0.62 : 20;

    const cellFrags: Frag[][][] = anchors.map(() => cols!.map(() => []));
    for (const f of body) {
      let ai = 0;
      let dist = Infinity;
      anchors.forEach((a, i) => {
        const d = Math.abs(a.y - f.y);
        if (d < dist) {
          dist = d;
          ai = i;
        }
      });
      if (dist > reach) continue; // page footer / stray text
      cellFrags[ai][columnOf(f, cols)].push(f);
    }

    anchors.forEach((_, ai) => {
      const rec = cols!.map((_c, ci) => {
        // Group the cell's fragments into visual lines (top → bottom).
        const lines: Frag[][] = [];
        for (const f of [...cellFrags[ai][ci]].sort((a, b) => b.y - a.y)) {
          const line = lines.find((l) => Math.abs(l[0].y - f.y) < 3);
          if (line) line.push(f);
          else lines.push([f]);
        }
        return join(lines.map(lineText));
      });
      rec[sttIndex] = rec[sttIndex].replace(/\.$/, "");
      records.push(rec);
      recordPages.push(n);
    });
  }

  const noUsableText = !sawText || (records.length === 0 && garbagePages > 0 && garbagePages >= judgedPages / 2);
  if (noUsableText && ocr) return ocrTable(doc, ocr, onProgress, store);
  if (!sawText) {
    throw new UnsupportedFormatError(
      "This PDF has no text layer (scanned image) — OCR is not supported",
    );
  }
  if (records.length === 0 && garbagePages > 0 && garbagePages >= judgedPages / 2) {
    throw new UnsupportedFormatError(
      `The text layer of this PDF is corrupt OCR output (${garbagePages}/${judgedPages} pages unreadable) — re-export it with a proper text layer or import a CSV`,
    );
  }
  if (!cols || records.length === 0) {
    throw new EmptyTableError(
      "No vocabulary table found — the PDF needs a table with an STT column",
    );
  }

  const columns = cols.map((c, i) => sanitizeHeaderCell(c.name, i));
  // Duplicate titles would collide as object keys.
  const seen = new Map<string, number>();
  const unique = columns.map((c) => {
    const k = (seen.get(c) ?? 0) + 1;
    seen.set(c, k);
    return k === 1 ? c : `${c} (${k})`;
  });

  const rows = records.map((rec) => {
    const row: Record<string, string> = {};
    unique.forEach((name, i) => {
      row[name] = rec[i] ?? "";
    });
    return row;
  });
  // Remember which PDF page each row came from, so the page can be shown next to it.
  rows.forEach((row, i) => {
    row["Trang"] ??= String(recordPages[i]);
  });
  return { columns: unique.includes("Trang") ? unique : [...unique, "Trang"], rows, format: "pdf" };
}
