import { isGarbageText, pdfjsWasmUrl, renderPdfPage } from "../../import/parsers/pdf.js";
import { UnsupportedFormatError } from "../../import/parsers/types.js";

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

/** Group a page's fragments into visual lines, top → bottom, left → right. */
function linesOf(items: { str: string; x: number; y: number; w: number }[]): string[] {
  type Frag = { x: number; y: number; w: number; s: string };
  const frags: Frag[] = [];
  for (const it of items) {
    if (!it.str || it.str.trim() === "") continue;
    frags.push({ x: it.x, y: it.y, w: it.w, s: it.str });
  }
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

/**
 * Open an exam PDF and read its pages as prose. A page with no text layer is
 * rendered and OCR'd (best effort — `null` becomes an empty page so one bad
 * page never blocks the import).
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

  const pageText = async (n: number): Promise<string> => {
    const page = await doc.getPage(n);
    try {
      const content = await page.getTextContent();
      const lines = linesOf(
        (content.items as { str?: string; transform: number[] }[])
          .filter((it) => "str" in it)
          .map((it) => ({ str: (it as { str?: string }).str ?? "", x: it.transform[4], y: it.transform[5], w: 0 })),
      );
      if (lines.length > 0 && !isGarbageText(lines.join(" "))) return lines.join("\n");
      // No usable text layer → render + OCR (the scan path).
      if (!ocr) return lines.join("\n"); // empty when neither text nor an OCR callback
      const png = await renderPdfPage(buffer, n);
      const text = (await ocr(png, n)) ?? "";
      return text;
    } finally {
      page.cleanup();
      void doc.cleanup();
    }
  };

  return { numPages, totalPages: doc.numPages, pageText };
}
