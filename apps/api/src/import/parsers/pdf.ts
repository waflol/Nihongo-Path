import type { Table } from "./types.js";
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
 */

const MAX_PAGES = 600;
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

export async function parsePdf(buffer: Buffer): Promise<Table> {
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
  let sawText = false;

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const frags: Frag[] = [];
    for (const it of content.items) {
      if (!("str" in it) || it.str.trim() === "") continue;
      frags.push({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str });
    }
    if (frags.length > 0) sawText = true;

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
    });
  }

  if (!sawText) {
    throw new UnsupportedFormatError(
      "This PDF has no text layer (scanned image) — OCR is not supported",
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
  return { columns: unique, rows, format: "pdf" };
}
