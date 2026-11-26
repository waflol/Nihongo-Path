import type { Mark } from "./marks.js";

/**
 * Underlines of a scanned page (NP-407). A scan has no drawn paths to read, so
 * the OCR is asked to wrap underlined words in `<u>…</u>`. The tags come out here
 * and become the same `Mark`s a text PDF yields: segmentation, the rules and the
 * AI keep seeing plain text, and `applyMarks` puts the underline back at the end.
 */

const CONTEXT = 8;
const TAG = /<\s*(\/?)\s*u\s*>/gi;
/** What is left of a blank to fill in: no words to underline. */
const BLANK = /^[\s　_＿()（）★]*$/;

const squeeze = (s: string) => s.replace(/\s/g, "");

export function readOcrMarks(raw: string): { text: string; marks: Mark[] } {
  const marks: Mark[] = [];
  const lines = raw.split("\n").map((line) => {
    let text = "";
    let from = -1;
    let end = 0;
    const spans: [number, number][] = [];
    for (const tag of line.matchAll(TAG)) {
      text += line.slice(end, tag.index);
      end = tag.index + tag[0].length;
      if (!tag[1]) from = text.length;
      else if (from >= 0) {
        spans.push([from, text.length]);
        from = -1;
      }
    }
    text += line.slice(end);
    for (const [a, b] of spans) {
      const words = text.slice(a, b).trim();
      if (BLANK.test(words)) continue;
      marks.push({
        kind: "u",
        text: words,
        before: squeeze(text.slice(0, a)).slice(-CONTEXT),
        after: squeeze(text.slice(b)).slice(0, CONTEXT),
      });
    }
    return text;
  });
  return { text: lines.join("\n"), marks };
}
