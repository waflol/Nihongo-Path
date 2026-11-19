import { KRADFILE } from "./kradfile.data.js";

/**
 * Look-alike kanji from their visible elements (KRADFILE): 意 = 音 心 日 立, so
 * 億 (音 化 心 日 立), 憶 and 臆 are its closest look-alikes. Used for the
 * hiragana → kanji drills when the AI gives nothing.
 */

const HAN = /\p{Script=Han}/u;

let table: Map<string, string[]> | null = null;

/** Kanji → its elements, parsed once from the bundled KRADFILE. */
function elements(): Map<string, string[]> {
  if (!table) {
    table = new Map();
    for (const line of KRADFILE.split("\n")) {
      const chars = [...line.trim()];
      if (chars.length >= 2) table.set(chars[0], chars.slice(1));
    }
  }
  return table;
}

/** The elements of one kanji (empty when KRADFILE does not list it). */
export function kanjiElements(ch: string): string[] {
  return elements().get(ch) ?? [];
}

/**
 * Up to `n` kanji from `candidates` that look most like `ch`: most shared
 * elements relative to all elements (Jaccard), with a bonus when all of `ch`'s
 * elements appear in the other (意 ⊂ 億). Kanji that are only a part of `ch`
 * are skipped. Ties keep the candidates' order, so pass them most common first.
 */
export function lookalikeKanji(ch: string, candidates: readonly string[], n: number): string[] {
  const own = new Set(kanjiElements(ch));
  if (own.size === 0) return [];
  const scored: { c: string; score: number; i: number }[] = [];
  candidates.forEach((c, i) => {
    if (c === ch) return;
    const other = kanjiElements(c);
    if (other.length === 0) return;
    const shared = other.filter((e) => own.has(e)).length;
    if (shared === 0) return;
    // A part of the kanji (寺 in 持, 目 in 見) is not a look-alike: JLPT pairs
    // kanji of the same weight, or a bigger one built on it (意 → 億).
    if (shared === other.length && other.length < own.size) return;
    const union = new Set([...own, ...other]).size;
    const contains = shared === own.size ? 0.3 : 0;
    // One shared element out of many is a coincidence, not a look-alike.
    if (shared < Math.min(2, own.size, other.length)) return;
    scored.push({ c, score: shared / union + contains, i });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, n)
    .map((x) => x.c);
}

/** Look-alikes for every kanji of `word` (kanji with none are left out). */
export function lookalikeMap(word: string, candidates: readonly string[], n = 4): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const ch of new Set([...word].filter((c) => HAN.test(c)))) {
    const alts = lookalikeKanji(ch, candidates, n);
    if (alts.length) out[ch] = alts;
  }
  return out;
}

/**
 * Wrong spellings of `word`: each kanji swapped in turn for its look-alikes
 * (the first look-alike of every position, then the second…), then all kanji
 * swapped at once. Kana stay, so every spelling keeps the word's kanji count.
 */
export function lookalikeWords(word: string, alts: Record<string, string[]>, n: number): string[] {
  const chars = [...word];
  const pos = chars.map((c, i) => (alts[c]?.length ? i : -1)).filter((i) => i >= 0);
  const out: string[] = [];
  const add = (cand: string) => {
    if (cand !== word && !out.includes(cand)) out.push(cand);
  };
  const depth = Math.max(0, ...pos.map((i) => alts[chars[i]].length));
  for (let k = 0; k < depth; k++) {
    for (const i of pos) {
      const alt = alts[chars[i]][k];
      if (alt) add(chars.map((c, j) => (j === i ? alt : c)).join(""));
    }
  }
  if (pos.length > 1) add(chars.map((c, j) => (pos.includes(j) ? alts[c][0] : c)).join(""));
  return out.slice(0, n);
}
