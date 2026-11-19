/**
 * Deterministic shuffling of an exam sitting (P4-EXAM-05).
 *
 * One 32-bit `seed` (stored on the attempt) drives the whole sitting: the
 * question order and, per question, the served option positions. Same seed →
 * same order, so a learner who refreshes mid-exam sees nothing move under
 * them, and the server can always map a served option index back to the bank
 * (T-P4-01: the correct answer keeps matching after every shuffle).
 *
 * The PRNG is `mulberry32`: cheap, good-enough distribution for ordering,
 * no dependency.
 */

/** One PRNG state → next state + a [0,1) float (mulberry32). */
function nextRandom(state: { s: number }): number {
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Permutation of `[0..n)` — position `i` holds the index of the original
 * element served there. Deterministic in `seed`.
 */
export function seededOrder(seed: number, n: number): number[] {
  if (n <= 1) return Array.from({ length: n }, (_, i) => i);
  const state = { s: seed >>> 0 };
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Served option positions for one question: position `p` shows bank option
 * `optionOrder[p]`. With `shuffleOptions` off (or < 2 options) the order is
 * the identity.
 */
export function optionOrder(seed: number, qid: string, count: number, shuffleOptions: boolean): number[] {
  if (!shuffleOptions || count <= 1) return Array.from({ length: count }, (_, i) => i);
  // Mix the question id in so two questions with the same option count differ.
  let mix = seed >>> 0;
  for (let i = 0; i < qid.length; i += 1) mix = (mix ^ qid.charCodeAt(i)) | 0;
  return seededOrder(mix, count);
}

/** The original bank index now sitting at served position `p`. */
export function originalAt(served: number[], p: number): number {
  return served[p] ?? -1;
}

/** `true` when served position `p` shows the bank option `answerIndex`. */
export function servedIndexOf(served: number[], answerIndex: number): number {
  return served.indexOf(answerIndex);
}
