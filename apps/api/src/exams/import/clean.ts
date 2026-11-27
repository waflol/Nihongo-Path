/**
 * Page-text cleaning for JLPT exam import (NP-407 / plan §6 GĐ2).
 *
 * A scanned paper is full of repeated noise — the source's watermark
 * (`Facebook: …`), the Vietnamese footer, the page number (`— 12 —`) — that is
 * printed on most pages and must not leak into the blocks the AI structures.
 *
 * The rule is frequency, not a blacklist: a line that appears on ≥ 30% of the
 * pages is noise (a real 問題 instruction or answer line only ever repeats
 * inside one sitting, never across the whole file). URLs / mailto lines are
 * dropped unconditionally. A sentence broken mid-line is re-joined so the AI
 * never sees a half-clause.
 */

const CJK = /[぀-ヿ一-鿿]/; // kana + hanzi

/** NFKC-normalise one line (fullwidth → ASCII digits/parens, lookalike unification). */
export function cleanLine(raw: string): string {
  return (raw ?? "")
    .normalize("NFKC")
    .replace(/０/g, "0").replace(/１/g, "1").replace(/２/g, "2")
    .replace(/３/g, "3").replace(/４/g, "4")
    .replace(/（/g, "(").replace(/）/g, ")")
    // `間題 3` — a misread / mistyped 問題 (間題 is not a word).
    .replace(/^間題(?=\s*\d)/, "問題")
    .trim();
}

/** Letters only Vietnamese uses: a line with them and no Japanese is a sharer's note, never exam text. */
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

/** A line is a URL / mailto / bare-domain junk line, or a Vietnamese note — always dropped. */
export function isJunkLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  return (VIETNAMESE.test(s) && !CJK.test(s)) || isLinkLine(s);
}

const isLinkLine = (s: string): boolean => /https?:\/\//i.test(s) || /mailto:/i.test(s) || /^www\.\S+$/.test(s.trim());

/**
 * The Latin pieces of a watermark that the text layer also glues INTO exam lines
 * (`…時間があGroupります`, `Tôi Yêu Ngo1 かど`): the noise lines with no Japanese.
 * Longest first, so `Tôi Yêu Ngo` goes before a shorter piece inside it.
 */
export function noiseFragments(noise: Set<string>): string[] {
  return [...noise].filter((l) => l.length <= 40 && /\p{L}/u.test(l) && !CJK.test(l)).sort((a, b) => b.length - a.length);
}

const LATIN = "A-Za-z\\u00C0-\\u024F\\u1E00-\\u1EFF";

/** Remove the watermark pieces from inside a line — only where they are not part of a Latin word. */
export function stripNoiseFragments(line: string, fragments: string[]): string {
  let out = line;
  for (const f of fragments) {
    if (!out.includes(f)) continue;
    const re = new RegExp(`(?<![${LATIN}])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![${LATIN}])`, "g");
    // Glued inside a Japanese clause: close the gap; between a word and a number (`栄養Group2 資源`): keep one space.
    out = out.replace(re, (_m, at: number, s: string) => {
      const before = s[at - 1] ?? " ";
      const after = s[at + f.length] ?? " ";
      return /\s/.test(before) || /\s/.test(after) || (CJK.test(before) && CJK.test(after)) ? "" : " ";
    });
  }
  return out === line ? line : out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Trim + half-width digits, but KEEP the circled marks ①②③④ (NFKC would fold
 * them to 1..4 and turn an answer line `1①` into the ambiguous `11`). Used for
 * the answer key, where the circled mark is the answer itself.
 */
export function cleanAnswerLine(raw: string): string {
  return (raw ?? "")
    .replace(/０/g, "0").replace(/１/g, "1").replace(/２/g, "2")
    .replace(/３/g, "3").replace(/４/g, "4")
    .trim();
}

/**
 * A line's repeat signature: a running header/footer carries the page number
 * (`Tổng hợp đề thi … các năm 129`), so the raw text differs on every page.
 * Strip a leading/trailing 1–3 digit number when real text remains.
 */
export function noiseKey(line: string): string {
  const k = line.replace(/^\d{1,3}\s+/, "").replace(/\s+\d{1,3}$/, "").trim();
  return k.length >= 8 ? k : line;
}

/**
 * Which lines are repeated noise: a line (NFKC-normalised) that appears at
 * least `NOISE_RATIO` of the pages **and on at least 2 pages**. The second
 * condition matters for short files: on a 1-page file every line is "on 100%
 * of the pages" and a frequency-only rule would delete the whole exam.
 * Watermarks print on most pages; a real 問題 instruction never does.
 */
export function learnNoise(pages: string[], ratio = 0.3): Set<string> {
  const seen = new Map<string, number>();
  for (const page of pages) {
    // Vietnamese watermark lines are counted too: their pieces glued into exam lines are stripped by them.
    const unique = new Set(page.split(/\n/).map(cleanLine).filter((l) => l && !isLinkLine(l)).map(noiseKey));
    for (const l of unique) seen.set(l, (seen.get(l) ?? 0) + 1);
  }
  const total = pages.length || 1;
  const noise = new Set<string>();
  for (const [line, count] of seen) if (count >= 2 && count / total >= ratio) noise.add(line);
  return noise;
}

/**
 * One visual line of a page, with the repeated-noise + junk lines removed.
 * A sentence broken mid-line (a CJK line ending and the next starting with a
 * CJK character, no trailing punctuation) is re-joined onto the previous one.
 */
export function cleanPage(rawPage: string, noise: Set<string>, fragments: string[] = noiseFragments(noise)): string[] {
  const lines = rawPage
    .split(/\n/)
    .map(cleanLine)
    .filter((l) => l && !noise.has(l) && !noise.has(noiseKey(l)) && !isJunkLine(l))
    .map((l) => stripNoiseFragments(l, fragments))
    .filter(Boolean);
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    const broken =
      prev !== undefined &&
      CJK.test(prev.slice(-1)) &&
      CJK.test(l[0]) &&
      !/[。．.!?、，,；;：:））】」』…~]$/.test(prev.slice(-1));
    if (broken) out[out.length - 1] = prev + l; // join: no space inside a Japanese clause
    else out.push(l);
  }
  return out;
}

/** The cleaned lines of every page, one call. */
export function cleanAllPages(pages: string[], ratio = 0.3): string[] {
  const noise = learnNoise(pages, ratio);
  return pages.flatMap((p) => cleanPage(p, noise));
}
