/**
 * Quiz-style helpers shared by the study session and the exercises area
 * (multiple-choice distractors, type-in comparison, shuffles).
 */

/** A stable 32-bit hash of a string — used to seed the shuffles. */
export function hashSeed(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Deterministic Fisher–Yates shuffle. Same seed → same order, so the card
 * order doesn't reshuffle on every re-render (a card must never move under
 * the learner mid-sitting).
 */
export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = (seed + 1) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift32 — a small, fast PRNG (good enough for shuffling cards).
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Normalize an answer for comparison: lowercase, drop the `[pos]` suffix the
 * API appends to vocabulary meanings (`nghĩa [noun]` → `nghia`), strip
 * diacritics and punctuation. Japanese kana/kanji carry no combining
 * marks, so they survive NFD intact.
 */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the typed answer matches the expected one (order-insensitive). */
export function answerMatches(typed: string, expected: string): boolean {
  const t = normalizeAnswer(typed);
  if (t === "") return false;
  const e = normalizeAnswer(expected);
  if (e === "") return false;
  if (t === e) return true;
  // The expected side may carry extra context ("mèo — con mèo", "nghĩa
  // [noun]"): accept when the typed text fully covers one of its words.
  return e.split(" ").some((w) => w.length >= 3 && t.includes(w));
}
