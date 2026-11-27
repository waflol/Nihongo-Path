/**
 * The pictures of a 聴解 booklet (NP-407): 課題理解 / ポイント理解 options drawn as pictures,
 * the scene of each 発話表現 question. On a PDF with a text layer each picture is its own
 * image, printed right under (or beside) its `N番` label — so the label tells which question
 * it belongs to. A scanned page is one picture of the whole page: nothing to find there (the
 * reviewer crops by hand).
 */

/** A rectangle in page points, top-left origin. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageLayout {
  width: number;
  height: number;
  /** Images drawn on the page. */
  images: Box[];
  /** `N番` labels: the number and where it is printed. */
  labels: { no: number; x: number; y: number }[];
  /** `問題 N` headings, top to bottom. */
  headings: { no: number; y: number }[];
}

/** A picture to cut: the page and the region, as fractions of the page (0–1). */
export interface PictureCrop {
  page: number;
  rect: Box;
}

/** A text item placed on the page (top-left origin, `y` = its baseline). */
export interface PlacedText {
  str: string;
  x: number;
  y: number;
}

const LINE_TOLERANCE = 4;

/**
 * Where the labels and headings are, from the page's text items. A label's number may be its
 * own item (`1` then `番`), and two labels may share a line (`1 番   2 番`, pictures side by side).
 */
export function layoutFromText(width: number, height: number, items: PlacedText[], images: Box[]): PageLayout {
  const placed = items.filter((t) => t.str.trim()).map((t) => ({ s: t.str.normalize("NFKC"), x: t.x, y: t.y }));
  // Lines: items within a few points of each other vertically, left to right.
  const lines: (typeof placed)[] = [];
  for (const it of [...placed].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l[0].y - it.y) <= LINE_TOLERANCE);
    if (line) line.push(it);
    else lines.push([it]);
  }
  const labels: PageLayout["labels"] = [];
  const headings: PageLayout["headings"] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    const text = line.map((t) => t.s).join("");
    const h = /^\s*問題\s*(\d{1,2})(?!\d)/.exec(text);
    if (h) headings.push({ no: Number(h[1]), y: line[0].y });
    // A label opens its line, or follows other labels (`1 番   2 番`): never inside an option
    // (`1 1番の自転車`) or a word that happens to hold one (`かばん`, `番組`).
    let labelsOnly = true;
    for (let i = 0; i < line.length && labelsOnly; i++) {
      const s = line[i].s.trim();
      if (/^(?:\d{1,2}\s*(?:番|ばん)\s*)+$/.test(s)) {
        for (const m of s.matchAll(/(\d{1,2})\s*(?:番|ばん)/g)) labels.push({ no: Number(m[1]), x: line[i].x, y: line[i].y });
        continue;
      }
      const next = line[i + 1];
      // `1` then `番` as two items; the 番's item may carry the question's instruction, not `番の…`.
      if (/^\d{1,2}$/.test(s) && next && /^(?:番|ばん)(?!\s*の)/.test(next.s.trim()) && next.x - line[i].x < 60) {
        labels.push({ no: Number(s), x: line[i].x, y: next.y });
        i += 1;
        continue;
      }
      labelsOnly = false;
    }
  }
  return { width, height, images, labels, headings };
}

/** An image is a picture of the paper — not the scan of the whole page, not a rule or an icon. */
const isPicture = (b: Box, page: { width: number; height: number }) =>
  b.w >= 30 && b.h >= 30 && (b.w * b.h) / (page.width * page.height) < 0.6;

/**
 * The picture of each `N番` of one listening block, from the layouts of the pages it spans.
 * The block's own part of a page runs from its `問題 N` heading to the next 問題 heading.
 * Each picture goes to the closest label above it (same column first); several pictures of
 * one label are cut as one region.
 */
export function picturesOfBlock(
  layouts: Map<number, PageLayout>,
  block: { pageFrom: number; pageTo: number; mondaiNo: number | null },
): Map<number, PictureCrop> {
  const out = new Map<number, PictureCrop>();
  for (let page = block.pageFrom; page <= block.pageTo; page++) {
    const l = layouts.get(page);
    if (!l) continue;
    // The block's stretch of this page: from its heading (first page) to the next other heading.
    const own = page === block.pageFrom && block.mondaiNo !== null ? l.headings.find((h) => h.no === block.mondaiNo) : undefined;
    const top = own?.y ?? (page === block.pageFrom && l.headings.length > 0 ? l.headings[0].y : 0);
    const next = l.headings.find((h) => h.y > top + 1 && h.no !== block.mondaiNo);
    const bottom = next?.y ?? l.height;
    const labels = l.labels.filter((x) => x.y >= top && x.y < bottom);
    const regions = new Map<number, Box>();
    for (const img of l.images.filter((b) => isPicture(b, l) && b.y >= top - 2 && b.y < bottom)) {
      let best: { no: number; score: number } | null = null;
      for (const lab of labels) {
        const dy = img.y - lab.y;
        if (dy < -12) continue; // the label is below the picture
        const score = Math.max(0, dy) + 0.5 * Math.abs(img.x - lab.x);
        if (!best || score < best.score) best = { no: lab.no, score };
      }
      if (!best) continue;
      const r = regions.get(best.no);
      regions.set(
        best.no,
        r
          ? (() => {
              const x = Math.min(r.x, img.x);
              const y = Math.min(r.y, img.y);
              return { x, y, w: Math.max(r.x + r.w, img.x + img.w) - x, h: Math.max(r.y + r.h, img.y + img.h) - y };
            })()
          : img,
      );
    }
    for (const [no, b] of regions) {
      if (out.has(no)) continue;
      const pad = 4;
      const x = Math.max(0, b.x - pad);
      const y = Math.max(0, b.y - pad);
      out.set(no, {
        page,
        rect: {
          x: x / l.width,
          y: y / l.height,
          w: Math.min(l.width - x, b.w + 2 * pad) / l.width,
          h: Math.min(l.height - y, b.h + 2 * pad) / l.height,
        },
      });
    }
  }
  return out;
}

/** The layouts of some pages of a PDF (pdfjs: image placements + text positions). */
export async function readLayouts(pdf: Buffer, pages: number[]): Promise<Map<number, PageLayout>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, verbosity: 0 }).promise;
  const out = new Map<number, PageLayout>();
  try {
    for (const n of [...new Set(pages)].filter((p) => p >= 1 && p <= doc.numPages)) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const images: Box[] = [];
      type M = [number, number, number, number, number, number];
      let ctm: M = [1, 0, 0, 1, 0, 0];
      const stack: M[] = [];
      const mul = (a: M, b: number[]): M => [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
      ];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        if (fn === pdfjs.OPS.save) stack.push(ctm);
        else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm;
        else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, ops.argsArray[i] as number[]);
        else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject || fn === pdfjs.OPS.paintImageMaskXObject) {
          // The image is the unit square through the CTM: its bounding box on the page (viewport = top-left origin).
          const corners = [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].map(([u, v]) => vp.convertToViewportPoint(ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]));
          const xs = corners.map((c) => c[0]);
          const ys = corners.map((c) => c[1]);
          images.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
        }
      }
      const text = await page.getTextContent();
      const placed: PlacedText[] = [];
      for (const t of text.items) {
        if (!("str" in t)) continue;
        const [x, y] = vp.convertToViewportPoint(t.transform[4], t.transform[5]);
        placed.push({ str: t.str, x, y });
      }
      out.set(n, layoutFromText(vp.width, vp.height, placed, images));
      page.cleanup();
    }
  } finally {
    await doc.loadingTask.destroy();
  }
  return out;
}
