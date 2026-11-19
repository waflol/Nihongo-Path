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
  return seededOrder(mixSeed(seed, qid), count);
}

/** Mix a string label into a 32-bit seed (XOR-fold) — one PRNG stream per label. */
export function mixSeed(seed: number, label: string): number {
  let mix = seed >>> 0;
  for (let i = 0; i < label.length; i += 1) mix = (mix ^ label.charCodeAt(i)) | 0;
  return mix;
}

/**
 * Served order of a set of questions where some form **groups** that must
 * stay together (NP-406: a reading passage and its questions). A group is
 * identified by `group` (e.g. the stimulus id); items without one are their
 * own unit. Units are shuffled (same seed → same order), and inside a group
 * the items keep their `groupOrder`. Every id appears exactly once.
 */
export function groupedOrder(
  seed: number,
  items: { id: string; group?: string | null; groupOrder?: number }[],
): string[] {
  if (items.length <= 1) return items.map((i) => i.id);
  const units = new Map<string, { id: string; groupOrder?: number }[]>();
  const unitKeys: string[] = [];
  for (const it of items) {
    const key = it.group ?? `solo:${it.id}`;
    let u = units.get(key);
    if (!u) {
      u = [];
      units.set(key, u);
      unitKeys.push(key); // first-appearance order → deterministic before the permutation
    }
    u.push(it);
  }
  const perm = seededOrder(seed, unitKeys.length);
  const out: string[] = [];
  for (const p of perm) {
    units
      .get(unitKeys[p])!
      .slice()
      .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
      .forEach((x) => out.push(x.id));
  }
  return out;
}

/** The original bank index now sitting at served position `p`. */
export function originalAt(served: number[], p: number): number {
  return served[p] ?? -1;
}

/** `true` when served position `p` shows the bank option `answerIndex`. */
export function servedIndexOf(served: number[], answerIndex: number): number {
  return served.indexOf(answerIndex);
}
