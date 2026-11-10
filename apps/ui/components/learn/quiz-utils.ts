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

/** Katakana → hiragana so a reading typed in either script compares equal. */
function toHiragana(value: string): string {
  return value.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** Keep only kana (and the long-vowel mark) — spaces, punctuation and furigana brackets drop out. */
function kanaOnly(value: string): string {
  return toHiragana(value.normalize("NFC")).replace(/\[[^\]]*\]/g, "").replace(/[^\u3041-\u3096\u30fc]/g, "");
}

/**
 * Typed reading vs the card's hiragana reading. Unlike `answerMatches` it must
 * NOT strip combining marks (が ≠ か), so it compares plain kana. Several
 * readings may be listed on the card (separated by ・ 、 / ,): any one matches.
 */
export function readingMatches(typed: string, reading: string): boolean {
  const t = kanaOnly(typed);
  if (t === "") return false;
  return reading
    .split(/[・、,，/／;；]/)
    .map(kanaOnly)
    .some((r) => r !== "" && r === t);
}

// ── Choice questions for the exercises area ────────────────────────────

/** A card as the exercises area sees it (the API returns the full document). */
export interface ExerciseCard {
  _id: string;
  front: string;
  back: string;
  reading?: string;
  examples?: { sentence: string; translation?: string }[];
}

/** One multiple-choice question: a prompt, four options, the right one. */
export type QuestionKind =
  | "kanji-pick"
  | "reading-pick"
  | "meaning-pick"
  | "synonym-pick"
  | "sentence-pick"
  | "formation-pick"
  | "context-pick";

export interface ChoiceQuestion {
  id: string;
  /** Which drill made it (kept with the question in the question bank). */
  kind: QuestionKind;
  /** Whether the distractors came from the AI or from the deck itself. */
  source: "local" | "ai";
  /** Small label above the prompt, e.g. "Chọn đáp án đúng". */
  label: string;
  prompt: string;
  /** A part of `prompt` drawn underlined (the word the question is about). */
  mark?: string;
  /** Optional line under the prompt (e.g. the meaning, as a hint). */
  sub?: string;
  options: string[];
  answer: string;
  /** Shown after answering (e.g. the sentence's translation). */
  explain?: string;
}

export type ChoiceMode = "test" | "kanji" | "reading" | "sentence" | "formation" | "context";

const HAN = /\p{Script=Han}/u;
export const hasKanji = (c: ExerciseCard) => HAN.test(c.front);
/** The type-answer drill asks for the hiragana reading when the front is kanji. */
export const asksReading = (c: ExerciseCard) => hasKanji(c) && hasReading(c);
const hasReading = (c: ExerciseCard) =>
  !!c.reading && c.reading.trim() !== "" && c.reading.trim() !== c.front.trim();

/** Pick `n` distinct distractors (not equal to `answer`) from `pool`. */
function pickDistractors(pool: string[], answer: string, n: number, seed: number): string[] {
  const uniq = [...new Set(pool.filter((p) => p !== answer))];
  return seededShuffle(uniq, seed).slice(0, n);
}

/**
 * Pick `n` kanji words that look like `word`: first those sharing kanji with it
 * (more shared characters, then same first/last character, first), then words of
 * the same length, then anything else. Ties are broken by the seeded shuffle so
 * the choice is stable for a sitting but not always the same words.
 */
export function similarKanji(word: string, pool: string[], n: number, seed: number): string[] {
  const own = new Set([...word].filter((ch) => HAN.test(ch)));
  const scored = seededShuffle([...new Set(pool.filter((p) => p !== word))], seed).map((cand) => {
    const chars = [...cand];
    const shared = chars.filter((ch) => own.has(ch)).length;
    const edge = (chars[0] === [...word][0] ? 1 : 0) + (chars[chars.length - 1] === [...word].at(-1) ? 1 : 0);
    const sameLen = chars.length === [...word].length ? 1 : 0;
    return { cand, score: shared * 10 + edge * 3 + sameLen };
  });
  // Stable sort keeps the shuffled order among equal scores.
  return scored.sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.cand);
}

/** A card the hiragana → kanji drill can ask about. */
export const isKanjiReadingCard = (c: ExerciseCard) => hasKanji(c) && hasReading(c);

/**
 * Spellings built from real kanji of the deck that the deck does not contain as
 * a word — the "word may not exist, its kanji do" distractors. Each keeps some
 * of the answer's characters and fills the rest with kanji taken from other
 * words: first from the same position of words that share a kanji with the
 * answer (so they look related), then from anywhere in the deck. Also adds the
 * answer's own kanji in a different order.
 */
export function composedKanji(word: string, pool: string[], n: number, seed: number): string[] {
  const chars = [...word];
  const kanjiPos = chars.map((ch, i) => (HAN.test(ch) ? i : -1)).filter((i) => i >= 0);
  if (kanjiPos.length === 0) return [];
  const own = new Set(chars.filter((ch) => HAN.test(ch)));
  const known = new Set(pool);
  const related = pool.filter((w) => [...w].some((ch) => own.has(ch)));
  const charsAt = (i: number, from: string[]) =>
    [...new Set(from.map((w) => [...w][i]).filter((ch): ch is string => !!ch && HAN.test(ch) && ch !== chars[i]))];
  const out = new Set<string>();
  const add = (cand: string) => {
    if (cand !== word && !known.has(cand)) out.add(cand);
  };
  // 1) change a single kanji, taken from related words, keeping the rest.
  for (const i of seededShuffle(kanjiPos, seed)) {
    for (const ch of seededShuffle(charsAt(i, related.length ? related : pool), seed + i).slice(0, 2)) {
      add(chars.map((c, j) => (j === i ? ch : c)).join(""));
    }
  }
  // 2) change every kanji (look-alike family first, then the whole deck).
  if (kanjiPos.length > 1) {
    const pick = (from: string[], salt: number) =>
      chars.map((c, j) => {
        if (!kanjiPos.includes(j)) return c;
        const opts = seededShuffle(charsAt(j, from), seed + salt + j);
        return opts[0] ?? c;
      }).join("");
    add(pick(related.length ? related : pool, 11));
    add(pick(pool, 23));
    // 3) the same kanji in another order.
    const swapped = [...chars];
    const [first, last] = [kanjiPos[0], kanjiPos[kanjiPos.length - 1]];
    [swapped[first], swapped[last]] = [swapped[last], swapped[first]];
    add(swapped.join(""));
  }
  return seededShuffle([...out], seed + 5).slice(0, n);
}

/**
 * Wrong spellings of `word` built from look-alike kanji (`alts[kanji]` = kanji
 * that look like it). Mirrors how JLPT writes them: swap ONE kanji (the same
 * position with different look-alikes, or each position in turn) and, for words
 * of two or more kanji, swap SEVERAL at once — 事情 → 時情, 事状, 時状.
 * Okurigana and other kana stay as they are.
 */
export function lookalikeSpellings(
  word: string,
  alts: Record<string, string[]>,
  n: number,
  seed: number,
): string[] {
  const chars = [...word];
  const pos = chars.map((c, i) => (alts[c]?.length ? i : -1)).filter((i) => i >= 0);
  if (pos.length === 0) return [];
  const out: string[] = [];
  const add = (cand: string) => {
    if (cand !== word && !out.includes(cand)) out.push(cand);
  };
  const swap = (picks: Map<number, string>) => chars.map((c, i) => picks.get(i) ?? c).join("");
  const pick = (i: number, k: number) => {
    const list = seededShuffle(alts[chars[i]], seed + i);
    return list[k % list.length];
  };
  if (pos.length === 1) {
    // One kanji: its look-alikes one after another.
    for (let k = 0; k < alts[chars[pos[0]]].length; k++) add(swap(new Map([[pos[0], pick(pos[0], k)]])));
  } else {
    // Several kanji: each alone, then all together, then further alternatives.
    for (const i of seededShuffle(pos, seed)) add(swap(new Map([[i, pick(i, 0)]])));
    add(swap(new Map(pos.map((i) => [i, pick(i, 0)] as [number, string]))));
    for (let k = 1; k < 4 && out.length < n + 2; k++) {
      for (const i of seededShuffle(pos, seed + k)) {
        if (alts[chars[i]].length > k) add(swap(new Map([[i, pick(i, k)]])));
      }
      add(swap(new Map(pos.map((i) => [i, pick(i, k)] as [number, string]))));
    }
  }
  return out.slice(0, n);
}

/**
 * Questions of the hiragana → kanji drill (問題2). The stem is an example
 * sentence of the card with the word written in hiragana and underlined; when
 * the card has no such sentence the bare reading is shown. `alts` maps a card id
 * to its look-alike kanji (from the AI). The three wrong options are those
 * look-alike spellings first, then spellings composed from other kanji of the
 * deck and real deck words sharing kanji — so every question has four distinct
 * options even when the AI gave nothing.
 */
export function buildKanjiQuestions(
  batch: ExerciseCard[],
  all: ExerciseCard[],
  seed: number,
  alts: Map<string, Record<string, string[]>>,
): ChoiceQuestion[] {
  const out: ChoiceQuestion[] = [];
  const pool = all.filter(hasKanji).map((o) => o.front);
  for (const c of batch) {
    if (!isKanjiReadingCard(c)) continue;
    const s = hashSeed(c._id) + seed;
    const reading = c.reading!.trim();
    const fromAi = alts.has(c._id) ? lookalikeSpellings(c.front, alts.get(c._id)!, 3, s) : [];
    const composed = composedKanji(c.front, pool, 3, s);
    const real = similarKanji(c.front, pool.filter((w) => w !== c.front), 3, s);
    const seen = new Set([c.front]);
    const wrong = [
      ...fromAi.map((w) => ({ w, ai: true })),
      ...composed.map((w) => ({ w, ai: false })),
      ...real.map((w) => ({ w, ai: false })),
    ]
      .filter((m) => !seen.has(m.w) && seen.add(m.w))
      .slice(0, 3);
    if (wrong.length < 3) continue;
    const ex = c.examples?.find((e) => e.sentence.includes(c.front));
    out.push({
      id: c._id,
      kind: "kanji-pick",
      source: wrong.some((m) => m.ai) ? "ai" : "local",
      label: ex ? "Chọn chữ kanji đúng cho phần gạch chân" : "Chữ kanji nào có cách đọc này?",
      prompt: ex ? ex.sentence.replace(c.front, reading) : reading,
      mark: ex ? reading : undefined,
      sub: ex ? undefined : c.back,
      explain: ex ? [ex.translation, `${c.front}（${reading}）: ${c.back}`].filter(Boolean).join(" — ") : undefined,
      options: seededShuffle([c.front, ...wrong.map((m) => m.w)], s + 1),
      answer: c.front,
    });
  }
  return out;
}

/** Vocabulary → Vietnamese meaning (4 meanings from the deck). */
function meaningQuestion(c: ExerciseCard, others: ExerciseCard[], s: number): ChoiceQuestion | null {
  const d = pickDistractors(others.map((o) => o.back), c.back, 3, s);
  if (d.length < 3) return null;
  return { id: c._id, kind: "meaning-pick", source: "local", label: "Chọn nghĩa tiếng Việt đúng", prompt: c.front, options: [c.back, ...d], answer: c.back };
}

/**
 * Hiragana → the kanji word, among four look-alike words of the deck (those
 * sharing kanji with the answer first, topped up with spellings composed from
 * the deck's own kanji when the deck has too few similar words).
 */
function kanjiQuestion(c: ExerciseCard, others: ExerciseCard[], s: number): ChoiceQuestion | null {
  if (!isKanjiReadingCard(c)) return null;
  const pool = others.filter(hasKanji).map((o) => o.front);
  const wrong = [...similarKanji(c.front, pool, 3, s)];
  if (wrong.length < 3) {
    for (const w of composedKanji(c.front, pool, 3, s)) {
      if (wrong.length < 3 && w !== c.front && !wrong.includes(w)) wrong.push(w);
    }
  }
  if (wrong.length < 3) return null;
  return {
    id: c._id,
    kind: "kanji-pick",
    source: "local",
    label: "Chữ kanji nào có cách đọc này?",
    prompt: c.reading!.trim(),
    sub: c.back,
    options: [c.front, ...wrong],
    answer: c.front,
  };
}

/**
 * Build the questions of a local (no-AI) choice mode. Cards that cannot make a
 * valid question for the mode (no kanji, no reading, no example, too few
 * distractors) are skipped, so every question has four distinct options.
 */
export function buildChoiceQuestions(
  mode: ChoiceMode,
  cards: ExerciseCard[],
  seed: number,
): ChoiceQuestion[] {
  const out: ChoiceQuestion[] = [];
  for (const c of seededShuffle(cards, seed)) {
    const others = cards.filter((o) => o._id !== c._id);
    const s = hashSeed(c._id) + seed;
    let q: ChoiceQuestion | null = null;

    if (mode === "test") {
      // Trắc nghiệm mixes two kinds (meaning / kanji), rotated card by card; a card that cannot
      // make the kind it was given falls back to the next one.
      const makers = [meaningQuestion, kanjiQuestion];
      for (let k = 0; k < makers.length && !q; k++) q = makers[(out.length + k) % makers.length](c, others, s);
    } else if (mode === "kanji") {
      // The reading is the question; the answer is the kanji word.
      if (hasKanji(c) && hasReading(c)) {
        const d = similarKanji(c.front, others.filter(hasKanji).map((o) => o.front), 3, s);
        if (d.length === 3)
          q = {
            id: c._id,
            kind: "kanji-pick",
            source: "local",
            label: "Chữ kanji nào có cách đọc này?",
            prompt: c.reading!.trim(),
            sub: c.back,
            options: [c.front, ...d],
            answer: c.front,
          };
      }
    } else if (mode === "reading") {
      if (hasKanji(c) && hasReading(c)) {
        const d = pickDistractors(others.filter(hasReading).map((o) => o.reading!.trim()), c.reading!.trim(), 3, s);
        if (d.length === 3)
          q = {
            id: c._id,
            kind: "reading-pick",
            source: "local",
            label: "Cách đọc hiragana đúng là?",
            prompt: c.front,
            sub: c.back,
            options: [c.reading!.trim(), ...d],
            answer: c.reading!.trim(),
          };
      }
    } else if (mode === "formation") {
      // 問題3 Cấu tạo từ: a compound with one kanji hidden → pick the missing kanji.
      const chars = [...c.front];
      const slots = chars.map((ch, i) => (HAN.test(ch) ? i : -1)).filter((i) => i >= 0);
      if (slots.length >= 2) {
        const i = seededShuffle(slots, s)[0];
        const words = new Set(cards.map((o) => o.front));
        // Kanji seen at this position in other words — but never one that would
        // complete another word of the deck (that would be a second right answer).
        const fill = (ch: string) => chars.map((x, j) => (j === i ? ch : x)).join("");
        const pool = others
          .map((o) => [...o.front][i])
          .filter((ch): ch is string => !!ch && HAN.test(ch) && ch !== chars[i] && !words.has(fill(ch)));
        const d = pickDistractors(pool, chars[i], 3, s);
        if (d.length === 3)
          q = {
            id: c._id,
            kind: "formation-pick",
            source: "local",
            label: "Chọn chữ kanji còn thiếu để tạo thành từ",
            prompt: chars.map((x, j) => (j === i ? "＿" : x)).join(""),
            sub: c.back,
            options: [chars[i], ...d],
            answer: chars[i],
            explain: `${c.front}（${c.reading ?? ""}）`.replace("（）", ""),
          };
      }
    } else if (mode === "context") {
      // 問題5 Biểu hiện từ: a sentence with the word blanked → pick the word that fits.
      const ex = c.examples?.find((e) => e.sentence.includes(c.front));
      if (ex) {
        const d = pickDistractors(
          others.map((o) => o.front).filter((w) => !ex.sentence.includes(w)),
          c.front,
          3,
          s,
        );
        if (d.length === 3)
          q = {
            id: c._id,
            kind: "context-pick",
            source: "local",
            label: "Chọn từ thích hợp điền vào chỗ trống",
            prompt: ex.sentence.replace(c.front, "＿＿"),
            options: [c.front, ...d],
            answer: c.front,
            explain: [ex.translation, `${c.front}${c.reading ? `（${c.reading}）` : ""}: ${c.back}`].filter(Boolean).join(" — "),
          };
      }
    } else {
      // sentence: the right option really contains the word; the others come
      // from other cards' examples and do not.
      const ex = c.examples?.find((e) => e.sentence.includes(c.front));
      if (ex) {
        const pool = others
          .flatMap((o) => o.examples ?? [])
          .map((e) => e.sentence)
          .filter((t) => !t.includes(c.front));
        const d = pickDistractors(pool, ex.sentence, 3, s);
        if (d.length === 3)
          q = {
            id: c._id,
            kind: "sentence-pick",
            source: "local",
            label: "Câu nào dùng từ này đúng?",
            prompt: c.front,
            sub: c.back,
            options: [ex.sentence, ...d],
            answer: ex.sentence,
            explain: ex.translation || undefined,
          };
      }
    }
    if (q) out.push({ ...q, options: seededShuffle(q.options, s + 1) });
  }
  return out;
}
