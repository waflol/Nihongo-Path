import { chrF } from "../ai/ai-benchmark.js";

/** Counts of the letters in a text by script. */
export function scriptStats(s: string): { kana: number; kanji: number; latin: number; total: number } {
  let kana = 0;
  let kanji = 0;
  let latin = 0;
  for (const ch of s.normalize("NFC")) {
    if (/[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(ch)) kana++;
    else if (/\p{Script=Han}/u.test(ch)) kanji++;
    else if (/\p{Script=Latin}/u.test(ch)) latin++;
  }
  return { kana, kanji, latin, total: kana + kanji + latin };
}

/** Mostly Japanese: kana + kanji are at least 60% of the letters. */
export function looksJapanese(s: string): boolean {
  const t = scriptStats(s);
  return t.total > 0 && (t.kana + t.kanji) / t.total >= 0.6;
}

/** Mostly Vietnamese / Latin: at least 70% Latin letters (a quoted Japanese word is fine). */
export function looksVietnamese(s: string): boolean {
  const t = scriptStats(s);
  return t.total > 0 && t.latin / t.total >= 0.7;
}

/** Katakana → hiragana; only kana kept (for comparing readings). */
export function kanaFold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{Script=Hiragana}ー]/gu, "");
}

/** Japanese text folded for "contains" checks: NFKC, katakana → hiragana, no spaces / punctuation / tildes. */
export function jaFold(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}\p{S}～〜~]/gu, "");
}

/**
 * The literal pieces of a grammar pattern: `～やすい／にくい` → [やすい, にくい],
 * `～た後で` → [た後で, 後で]. Leading conjugation kana (た / て / で) are also
 * tried without, because the verb before it changes them (読んで, 食べた).
 */
export function patternPieces(pattern: string): string[] {
  const alts = pattern
    .normalize("NFKC")
    .split(/[／/・]|\bor\b/)
    .map((p) => jaFold(p.replace(/[（(][^）)]*[）)]/g, "")))
    .filter(Boolean);
  const out = new Set<string>();
  for (const a of alts) {
    out.add(a);
    const stripped = a.replace(/^[たてで]/, "");
    if (stripped.length >= 2) out.add(stripped);
    // Polite / plain endings are often conjugated away (～ます → ました is its own pattern; ～です → だ).
    const core = a.replace(/(です|ます|ません|ない)$/, "");
    if (core.length >= 2 && core !== a) out.add(core);
  }
  return [...out];
}

/** The sentence uses one of the pattern's literal pieces. Can miss conjugated forms — a hint, never a verdict on its own. */
export function sentenceHasPattern(sentence: string, pattern: string): boolean {
  const s = jaFold(sentence);
  return patternPieces(pattern).some((p) => s.includes(p));
}

/** The answer names the pattern (either side contains the other's core). */
export function namesPattern(named: string, pattern: string): boolean {
  const n = jaFold(named);
  if (!n) return false;
  return patternPieces(pattern).some((p) => n.includes(p) || (n.length >= 2 && p.includes(n)));
}

/**
 * The reference with its slash alternatives resolved: "học sinh/sinh viên"
 * gives the whole text plus one version per side of each slash (whole words
 * on each side, best effort). chrF takes the best of them.
 */
export function referenceVariants(ref: string): string[] {
  const out = new Set<string>([ref]);
  if (ref.includes("/") || ref.includes("／")) {
    out.add(ref.replace(/\s*[/／]\s*\S+(\s\S+)?/u, ""));
    out.add(ref.replace(/(\S+\s)?\S+\s*[/／]\s*/u, ""));
    out.add(ref.replace(/[/／]/g, " "));
  }
  return [...out].filter(Boolean);
}

/** chrF (0–100) against the closest variant of the reference. */
export function bestChrF(hyp: string, ref: string): number {
  return Math.max(0, ...referenceVariants(ref).map((r) => chrF(hyp, r)));
}

const POS_RULES: [RegExp, string][] = [
  [/する動詞|サ変|danh động từ|suru/i, "suru"],
  [/tính từ\s*(な|na)|な形容詞|形容動詞|na-?adj/i, "na-adj"],
  [/tính từ\s*(い|i)|い形容詞|i-?adj/i, "i-adj"],
  [/động từ|動詞|verb/i, "verb"],
  [/danh từ|名詞|noun/i, "noun"],
  [/phó từ|trạng từ|副詞|adverb/i, "adverb"],
  [/trợ từ|助詞|particle/i, "particle"],
  [/liên từ|接続詞|conjunction/i, "conjunction"],
  [/thán từ|感動詞|interjection/i, "interjection"],
  [/cụm|phrase|expression|慣用/i, "phrase"],
];

/** Parts of speech named in a label ("danh từ/する動詞" → noun, suru). */
export function posCategories(label: string): Set<string> {
  const out = new Set<string>();
  const SURU = POS_RULES[0][0];
  // "する動詞" names a する-noun, not any verb: take it out before the plain "動詞" rule sees it.
  if (SURU.test(label)) out.add("suru").add("noun");
  const rest = label.replace(new RegExp(SURU.source, "gi"), " ");
  for (const [re, cat] of POS_RULES.slice(1)) if (re.test(rest)) out.add(cat);
  return out;
}

/** The answer's part of speech shares a category with the expected one. */
export function posMatches(answer: string, expected: string): boolean {
  const a = posCategories(answer);
  const e = posCategories(expected);
  for (const c of a) if (e.has(c)) return true;
  return false;
}

/** Share (0–1) of the sentence's characters found, in order, in the breakdown pieces. */
export function breakdownCoverage(sentence: string, pieces: string[]): number {
  const s = jaFold(sentence);
  if (!s) return 0;
  let pos = 0;
  let covered = 0;
  for (const p of pieces.map(jaFold).filter(Boolean)) {
    const at = s.indexOf(p, pos);
    if (at >= 0) {
      covered += p.length;
      pos = at + p.length;
    }
  }
  return Math.min(1, covered / s.length);
}
