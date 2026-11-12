import type { AiResult, AiTask } from "./ai-example.service.js";

/** One benchmark item: the task plus how a good answer is recognised. */
export interface BenchItem {
  task: AiTask;
  /** Reference Vietnamese translation (translate items). */
  ref?: string;
  /** Whether the model should say the word is used with the given meaning (translate items). */
  expectMatch?: boolean;
  /** Text the Japanese sentence must contain (write items). */
  stem?: string;
  /** Vietnamese renderings of the word that count as correct terminology (translate items with a correct sense). */
  termForms?: string[];
}

/**
 * A fixed, hand-written mini test set — the same tasks the importer sends
 * (translate a sentence + check the word's sense; write a sentence), so the
 * score reflects the real job. 10 translations (8 correct senses, 2 wrong
 * senses the model must reject) and 4 sentence-writing items.
 */
export const BENCH_ITEMS: readonly BenchItem[] = [
  { task: { kind: "translate", ja: "彼は約束を守る人だ。", term: "約束", meaning: "lời hứa" }, ref: "Anh ấy là người giữ lời hứa.", expectMatch: true, termForms: ["hứa"] },
  { task: { kind: "translate", ja: "今日は天気がいいので、散歩に行きましょう。", term: "散歩", meaning: "đi dạo" }, ref: "Hôm nay thời tiết đẹp nên chúng ta đi dạo nhé.", expectMatch: true, termForms: ["đi dạo","dạo","tản bộ"] },
  { task: { kind: "translate", ja: "会議の資料を準備しておいてください。", term: "資料", meaning: "tài liệu" }, ref: "Hãy chuẩn bị sẵn tài liệu cho cuộc họp.", expectMatch: true, termForms: ["tài liệu"] },
  { task: { kind: "translate", ja: "彼女は医者になるために一生懸命勉強している。", term: "一生懸命", meaning: "hết sức, nỗ lực" }, ref: "Cô ấy đang học hành chăm chỉ để trở thành bác sĩ.", expectMatch: true, termForms: ["hết sức","nỗ lực","chăm chỉ","cố gắng"] },
  { task: { kind: "translate", ja: "電車が遅れたせいで、会議に間に合わなかった。", term: "間に合う", meaning: "kịp giờ" }, ref: "Vì tàu điện đến muộn nên tôi đã không kịp giờ họp.", expectMatch: true, termForms: ["kịp"] },
  { task: { kind: "translate", ja: "この問題は思ったより難しい。", term: "難しい", meaning: "khó" }, ref: "Vấn đề này khó hơn tôi nghĩ.", expectMatch: true, termForms: ["khó"] },
  { task: { kind: "translate", ja: "台風の影響で、飛行機が欠航になった。", term: "影響", meaning: "ảnh hưởng" }, ref: "Do ảnh hưởng của bão, chuyến bay đã bị hủy.", expectMatch: true, termForms: ["ảnh hưởng"] },
  { task: { kind: "translate", ja: "彼の意見には賛成できない。", term: "賛成", meaning: "tán thành" }, ref: "Tôi không thể tán thành ý kiến của anh ấy.", expectMatch: true, termForms: ["tán thành","đồng ý","ủng hộ"] },
  // Wrong sense on purpose: 気が短い = nóng tính (not "không khí"); 花 = hoa (not "cái mũi").
  { task: { kind: "translate", ja: "彼は気が短い。", term: "気", meaning: "không khí" }, ref: "Anh ấy nóng tính.", expectMatch: false },
  { task: { kind: "translate", ja: "この花はいい香りがする。", term: "花", meaning: "cái mũi" }, ref: "Bông hoa này có mùi thơm.", expectMatch: false },
  { task: { kind: "write", term: "勉強", reading: "べんきょう", meaning: "học tập", pos: "noun" }, stem: "勉強" },
  { task: { kind: "write", term: "美味しい", reading: "おいしい", meaning: "ngon", pos: "i-adjective" }, stem: "美味し" },
  { task: { kind: "write", term: "食べる", reading: "たべる", meaning: "ăn", pos: "verb" }, stem: "食べ" },
  { task: { kind: "write", term: "約束", reading: "やくそく", meaning: "lời hứa", pos: "noun" }, stem: "約束" },
];

/**
 * Weights of the 0–100 accuracy (sum = 1). chrF = surface closeness to the
 * reference; terminology = the word's Vietnamese rendering appears;
 * completeness = length close to the reference (nothing dropped or padded);
 * match = verdict on the word's sense; write = the sentence uses the word.
 * A translate-only model is scored on the first three, re-normalised.
 */
export const ACCURACY_WEIGHTS = { chrf: 0.35, terminology: 0.15, completeness: 0.1, match: 0.2, write: 0.2 } as const;

/** The jobs a service can be asked to do; each has its own score and its own priority order. */
export type BenchTask = "translate" | "write" | "grammar" | "pronounce" | "verify";
export const BENCH_TASKS: readonly BenchTask[] = ["translate", "write", "grammar", "pronounce", "verify"];

/** One pronunciation answer, as parsed from the model. */
export interface PronounceAnswer {
  reading: string;
  romaji: string;
  viet: string;
  words: { text?: string; reading?: string; romaji?: string; accent?: string }[];
  tips: string[];
}

/** Pronunciation test set: the exact hiragana reading expected for each sentence. */
export interface PronounceBenchItem {
  ja: string;
  /** Expected whole-text reading in hiragana (no punctuation). */
  reading: string;
  /** The sentence should be split into at least this many words. */
  minWords: number;
}
export const PRONOUNCE_ITEMS: readonly PronounceBenchItem[] = [
  // 連濁 (ひとり + すまい → ひとりずまい)
  { ja: "一人住まい", reading: "ひとりずまい", minWords: 1 },
  // long vowel ほう + small っ
  { ja: "放っておく", reading: "ほうっておく", minWords: 1 },
];

/** One grammar-analysis answer, as parsed from the model. */
export interface GrammarAnswer {
  translation: string;
  tokens: { text?: string; reading?: string; pos?: string; meaning?: string }[];
  grammar: { pattern?: string; level?: string; explanation?: string }[];
}

/**
 * Grammar test set. `needs`: each group is a list of alternatives, and a
 * group counts when ANY of them appears in the grammar points the model gave
 * (pattern + explanation, lower-cased). `minTokens`: the sentence should be
 * split into at least this many pieces.
 */
export interface GrammarBenchItem {
  ja: string;
  needs: string[][];
  minTokens: number;
}
export const GRAMMAR_ITEMS: readonly GrammarBenchItem[] = [
  { ja: "雨が降っているにもかかわらず、彼は出かけた。", needs: [["にもかかわらず"], ["ている", "進行", "đang"]], minTokens: 6 },
  { ja: "日本語を勉強すればするほど、面白くなる。", needs: [["ほど"], ["くなる", "なる"]], minTokens: 6 },
  { ja: "先生に褒められて、嬉しかった。", needs: [["られ", "受身", "受け身", "bị động"], ["かった", "過去", "quá khứ"]], minTokens: 5 },
];

/** Speed scale: this latency or better = 100, this or worse = 0 (log scale in between). */
export const SPEED_FAST_MS = 2_000;
export const SPEED_SLOW_MS = 30_000;
/** Below this accuracy a service is shown but not ranked. */
export const MIN_ACCURACY = 75;
/** Default share of speed in the combined score. */
export const DEFAULT_SPEED_WEIGHT = 0.25;
/** Benchmark repetitions. */
export const DEFAULT_RUNS = 3;
export const MAX_RUNS = 5;

/** What one test item looked like and how the model did on it. */
export interface BenchDetail {
  id: number;
  kind: "translate" | "write" | "grammar" | "pronounce" | "verify";
  /** The word being tested and its meaning (grammar: the sentence). */
  term: string;
  meaning: string;
  /** translate: the Japanese sentence to translate. */
  source?: string;
  /** translate: the reference Vietnamese; write: the text the sentence had to contain. */
  expected?: string;
  /** translate: the verdict we expected for "word has this meaning". */
  expectMatch?: boolean;
  /** Did the model give a readable answer for this item? */
  answered: boolean;
  /** The model's Vietnamese (both kinds) and Japanese sentence (write). */
  vi?: string;
  ja?: string;
  matches?: boolean;
  /** translate (correct sense): 100 when a right Vietnamese rendering of the word appears, else 0. */
  terminology?: number;
  /** translate: 0–100 from the length ratio to the reference. */
  completeness?: number;
  /** translate: chrF 0–100. */
  chrf?: number;
  /** translate: the model's verdict matched ours. */
  matchOk?: boolean;
  /** write: 0 / 60 / 100. */
  writeScore?: number;
  /** grammar: share of expected grammar points named, annotated pieces vs needed, 0–100; the points the model named. */
  hit?: number;
  split?: number;
  points?: string[];
  /** pronounce: how close the hiragana / romaji are to the expected reading (0–100), words with a reading, and what the model gave. */
  readingScore?: number;
  romajiScore?: number;
  wordsScore?: number;
  gotReading?: string;
  gotRomaji?: string;
  gotViet?: string;
  /** verify: share of the wrong fields corrected right / of the right fields left alone (0–100, absent when the card has none), and the fixes the model gave. */
  fixScore?: number;
  keepScore?: number;
  gotFixes?: string;
}

/** One repetition of the benchmark, kept for the record (failures too). */
export interface BenchRun {
  ok: boolean;
  at: string;
  ms: number;
  accuracy?: number;
  answered?: number;
  error?: string;
}

/** Spread of the latency over the successful runs (ms). */
export interface LatencyStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdev: number;
  /** stdev / mean — 0 for a single run. */
  cv: number;
  /** Only with 5+ runs (with fewer it would just be the max). */
  p95?: number;
}

export interface BenchResult {
  ok: boolean;
  /** ISO time of the (last) run. */
  at: string;
  /** Latency of the batched call: the median over the successful runs. */
  ms: number;
  /** 0–100 accuracy (mean over the successful runs), see `ACCURACY_WEIGHTS`. */
  accuracy: number;
  /** 0–100 average chrF of the translations against the references. */
  chrf: number;
  /** 0–100 share of correct-sense items whose Vietnamese contains the word's rendering. */
  terminology: number;
  /** 0–100 length-vs-reference check of the translations. */
  completeness: number;
  /** 0–100 share of items whose "word has this meaning" verdict was right. */
  matchAcc: number;
  /** 0–100 sentence-writing check (word used, short, Japanese). */
  writeScore: number;
  items: number;
  /** How many items the model answered in a readable way. */
  answered: number;
  error?: string;
  /** Translate-only model: only the 10 translations were scored. */
  translateOnly?: boolean;
  /** Per-item breakdown of the last successful run, in test order. */
  details?: BenchDetail[];
  /** Start of the model's raw answer of the last successful run. */
  raw?: string;
  /** Characters of Vietnamese + Japanese produced in the run (for `charsPerSec`). */
  outChars?: number;
  /** Every repetition, failures included. */
  runs?: BenchRun[];
  /** Successful runs / all runs. */
  successRate?: number;
  latency?: LatencyStats;
  /** Median output characters per second — tokenizer-independent, informational only. */
  charsPerSec?: number;
  /** A newer attempt that failed while this (older) result was kept. */
  lastAttempt?: { at: string; error?: string; ms: number };
  /** Which task this result scores (absent on results from before per-task benchmarks). */
  task?: BenchTask;
  /** Result rebuilt from an older combined benchmark, not measured per task. */
  legacy?: boolean;
  /** grammar: mean share (0–100) of the expected grammar points named / pieces annotated / translation given. */
  grammarHit?: number;
  grammarSplit?: number;
  grammarTrans?: number;
  /** pronounce: mean 0–100 of hiragana exactness / romaji exactness / words given a reading / Vietnamese-style reading given. */
  pronounceReading?: number;
  pronounceRomaji?: number;
  pronounceWords?: number;
  pronounceViet?: number;
  /** verify: mean 0–100 of wrong fields corrected right / right fields left alone. */
  verifyFix?: number;
  verifyKeep?: number;
}

/** Lower-case, NFC, no punctuation, single-spaced. */
function normalise(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ngrams(s: string, n: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + n <= s.length; i++) {
    const g = s.slice(i, i + n);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * chrF (character n-gram F-score, n = 1–6, β = 2 → recall-weighted), 0–100.
 * A reference-based, deterministic, free metric that tolerates small wording
 * differences; it cannot tell a fluent paraphrase from an error, so it is only
 * part of the accuracy score.
 */
export function chrF(hyp: string, ref: string): number {
  const h = normalise(hyp).replace(/\s/g, "");
  const r = normalise(ref).replace(/\s/g, "");
  if (!h || !r) return 0;
  let p = 0;
  let rc = 0;
  let used = 0;
  for (let n = 1; n <= 6; n++) {
    const hg = ngrams(h, n);
    const rg = ngrams(r, n);
    const hTotal = [...hg.values()].reduce((a, b) => a + b, 0);
    const rTotal = [...rg.values()].reduce((a, b) => a + b, 0);
    if (hTotal === 0 || rTotal === 0) continue;
    let match = 0;
    for (const [g, c] of hg) match += Math.min(c, rg.get(g) ?? 0);
    p += match / hTotal;
    rc += match / rTotal;
    used++;
  }
  if (used === 0) return 0;
  p /= used;
  rc /= used;
  if (p + rc === 0) return 0;
  const beta2 = 4;
  return (100 * (1 + beta2) * p * rc) / (beta2 * p + rc);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp100 = (n: number) => Math.min(100, Math.max(0, n));

const words = (s: string) => normalise(s).split(" ").filter(Boolean);

/** Terminology: 100 when any accepted Vietnamese rendering of the word appears in the translation. */
export function terminologyScore(hyp: string, forms: readonly string[]): number {
  const h = ` ${normalise(hyp)} `;
  return forms.some((f) => h.includes(normalise(f))) ? 100 : 0;
}

/**
 * Completeness from the length ratio to the reference (in words): 100 within
 * 0.7–1.4×, falling linearly to 0 at 0.3× (something dropped) or 2.2× (padding).
 */
export function completenessScore(hyp: string, ref: string): number {
  const r = words(ref).length;
  const h = words(hyp).length;
  if (r === 0 || h === 0) return 0;
  const ratio = h / r;
  if (ratio < 0.7) return clamp100((100 * (ratio - 0.3)) / 0.4);
  if (ratio > 1.4) return clamp100((100 * (2.2 - ratio)) / 0.8);
  return 100;
}

/** The test items of one task (translate, write), in test order. */
/** The first `n` test items, repeating the fixed set when `n` is larger, so every service is measured on the same items. */
export function takeItems<T>(base: readonly T[], n?: number): T[] {
  const count = n && n > 0 ? Math.min(MAX_BENCH_ITEMS, Math.floor(n)) : base.length;
  return Array.from({ length: count }, (_, i) => base[i % base.length]);
}
export const MAX_BENCH_ITEMS = 40;

export const itemsOf = (task: "translate" | "write"): BenchItem[] => BENCH_ITEMS.filter((i) => i.task.kind === task);

/**
 * Turn the model's answers (by 1-based id within `items`) and the call time
 * into the result of ONE run. The accuracy is the weighted mean of the parts
 * the items can measure, re-normalised: translate items → chrF, terminology,
 * completeness, sense verdict; write items → the sentence check. A
 * translate-only model is judged on the first three alone.
 */
export function scoreItems(
  items: readonly BenchItem[],
  answers: Map<number, AiResult>,
  ms: number,
  raw?: string,
  translateOnly = false,
): BenchResult {
  const details: BenchDetail[] = [];
  let chrfSum = 0;
  let complSum = 0;
  let nTranslate = 0;
  let matchRight = 0;
  let termSum = 0;
  let nTerm = 0;
  let writeSum = 0;
  let nWrite = 0;
  let outChars = 0;
  items.forEach((item, i) => {
    const a = answers.get(i + 1);
    outChars += (a?.vi?.length ?? 0) + (a?.ja?.length ?? 0);
    const base = { id: i + 1, term: item.task.term, meaning: item.task.meaning, answered: Boolean(a), vi: a?.vi };
    if (item.task.kind === "translate") {
      nTranslate++;
      const c = a ? chrF(a.vi, item.ref ?? "") : 0;
      const compl = a ? completenessScore(a.vi, item.ref ?? "") : 0;
      const matchOk = Boolean(a) && a!.matches === item.expectMatch;
      chrfSum += c;
      complSum += compl;
      if (matchOk) matchRight++;
      let term: number | undefined;
      if (item.termForms) {
        term = a ? terminologyScore(a.vi, item.termForms) : 0;
        termSum += term;
        nTerm++;
      }
      details.push({
        ...base,
        kind: "translate",
        source: item.task.ja,
        expected: item.ref,
        expectMatch: item.expectMatch,
        matches: a?.matches,
        chrf: round1(c),
        completeness: round1(compl),
        terminology: term,
        matchOk,
      });
    } else if (!translateOnly) {
      nWrite++;
      const ja = a?.ja ?? "";
      const hasStem = Boolean(item.stem) && ja.includes(item.stem!);
      const w = !hasStem ? 0 : ja.length <= 25 ? 100 : 60;
      writeSum += w;
      details.push({ ...base, kind: "write", expected: item.stem, ja: a?.ja, writeScore: w });
    }
  });
  const chrf = nTranslate ? chrfSum / nTranslate : 0;
  const completeness = nTranslate ? complSum / nTranslate : 0;
  const terminology = nTerm ? termSum / nTerm : 0;
  const matchAcc = nTranslate ? (100 * matchRight) / nTranslate : 0;
  const writeScore = nWrite ? writeSum / nWrite : 0;
  const w = ACCURACY_WEIGHTS;
  const parts: [number, number][] = [];
  if (nTranslate) parts.push([w.chrf, chrf], [w.terminology, terminology], [w.completeness, completeness]);
  if (nTranslate && !translateOnly) parts.push([w.match, matchAcc]);
  if (nWrite) parts.push([w.write, writeScore]);
  const weight = parts.reduce((a, [x]) => a + x, 0);
  const accuracy = weight ? parts.reduce((a, [x, v]) => a + x * v, 0) / weight : 0;
  return {
    ok: answers.size > 0,
    at: new Date().toISOString(),
    ms,
    accuracy: round1(accuracy),
    chrf: round1(chrf),
    terminology: round1(terminology),
    completeness: round1(completeness),
    matchAcc: round1(matchAcc),
    writeScore: round1(writeScore),
    items: translateOnly ? nTranslate : items.length,
    answered: answers.size,
    translateOnly: translateOnly || undefined,
    details,
    raw: raw?.slice(0, 6000),
    outChars,
  };
}

/** The whole fixed set at once (translate + write in one batch). */
export const scoreBenchmark = (answers: Map<number, AiResult>, ms: number, raw?: string, translateOnly = false) =>
  scoreItems(BENCH_ITEMS, answers, ms, raw, translateOnly);

/** Pull `{items:[{id, translation, tokens, grammar}]}` out of the model's text, keyed by 1-based id. */
export function parseGrammar(text: string): Map<number, GrammarAnswer> {
  const out = new Map<number, GrammarAnswer>();
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  let data: unknown;
  try {
    data = JSON.parse(m ? m[0] : text);
  } catch {
    return out;
  }
  const arr = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return out;
  for (const row of arr as Record<string, unknown>[]) {
    const id = Number(row?.id);
    if (!Number.isFinite(id)) continue;
    out.set(id, {
      translation: typeof row.translation === "string" ? row.translation.trim() : "",
      tokens: Array.isArray(row.tokens) ? (row.tokens as GrammarAnswer["tokens"]).filter((t) => t && typeof t === "object") : [],
      grammar: Array.isArray(row.grammar) ? (row.grammar as GrammarAnswer["grammar"]).filter((g) => g && typeof g === "object") : [],
    });
  }
  return out;
}

/**
 * Grammar result of ONE run: accuracy 0–100, mean over the test sentences —
 * 60% the expected grammar points are named, 25% the sentence is split into
 * enough annotated pieces, 15% a Vietnamese translation is given. An
 * unanswered sentence scores 0.
 */
export function scoreGrammar(answers: Map<number, GrammarAnswer>, ms: number, raw?: string, list: readonly GrammarBenchItem[] = GRAMMAR_ITEMS): BenchResult {
  const details: BenchDetail[] = [];
  let hitSum = 0;
  let splitSum = 0;
  let transSum = 0;
  let outChars = 0;
  list.forEach((item, i) => {
    const a = answers.get(i + 1);
    const base = { id: i + 1, kind: "grammar" as const, term: item.ja, meaning: "", source: item.ja, answered: Boolean(a) };
    if (!a) {
      details.push({ ...base, expected: item.needs.map((g) => g[0]).join(" · "), hit: 0, split: 0 });
      return;
    }
    outChars += a.translation.length + a.grammar.length * 20;
    const hay = a.grammar.map((g) => `${g.pattern ?? ""} ${g.explanation ?? ""}`).join(" ").toLowerCase();
    const hit = (100 * item.needs.filter((alts) => alts.some((x) => hay.includes(x.toLowerCase()))).length) / item.needs.length;
    const annotated = a.tokens.filter((t) => (t.text ?? "").trim() && ((t.meaning ?? "").trim() || (t.pos ?? "").trim())).length;
    const split = 100 * Math.min(1, annotated / item.minTokens);
    const trans = a.translation ? 100 : 0;
    hitSum += hit;
    splitSum += split;
    transSum += trans;
    details.push({
      ...base,
      expected: item.needs.map((g) => g[0]).join(" · "),
      vi: a.translation,
      hit: round1(hit),
      split: round1(split),
      points: a.grammar.map((g) => g.pattern ?? "").filter(Boolean),
    });
  });
  const n = list.length;
  const hit = hitSum / n;
  const split = splitSum / n;
  const trans = transSum / n;
  return {
    ok: answers.size > 0,
    at: new Date().toISOString(),
    ms,
    task: "grammar",
    accuracy: round1(0.6 * hit + 0.25 * split + 0.15 * trans),
    chrf: 0,
    terminology: 0,
    completeness: 0,
    matchAcc: 0,
    writeScore: 0,
    grammarHit: round1(hit),
    grammarSplit: round1(split),
    grammarTrans: round1(trans),
    items: n,
    answered: answers.size,
    details,
    raw: raw?.slice(0, 6000),
    outChars,
  };
}

/** Pull `{items:[{id, reading, romaji, viet, words, tips}]}` out of the model's text, keyed by 1-based id. */
export function parsePronounce(text: string): Map<number, PronounceAnswer> {
  const out = new Map<number, PronounceAnswer>();
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  let data: unknown;
  try {
    data = JSON.parse(m ? m[0] : text);
  } catch {
    return out;
  }
  const arr = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return out;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  for (const row of arr as Record<string, unknown>[]) {
    const id = Number(row?.id);
    if (!Number.isFinite(id)) continue;
    out.set(id, {
      reading: str(row.reading),
      romaji: str(row.romaji),
      viet: str(row.viet),
      words: Array.isArray(row.words) ? (row.words as PronounceAnswer["words"]).filter((w) => w && typeof w === "object") : [],
      tips: Array.isArray(row.tips) ? (row.tips as unknown[]).filter((t): t is string => typeof t === "string") : [],
    });
  }
  return out;
}

/** Katakana → hiragana, then only the kana / letters are kept (no punctuation, spaces, long-vowel marks aside). */
const kanaOnly = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{Script=Hiragana}ー]/gu, "");

/** Romaji folded so macron / "ou" / "oo" spellings of a long vowel compare equal. */
const romajiFold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ou|oo/g, "o")
    .replace(/uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/ii/g, "i")
    .replace(/ee/g, "e");

/** Hepburn romaji of a hiragana string, only as precise as needed for `romajiFold` comparison. */
export function hiraganaToRomaji(h: string): string {
  const base: Record<string, string> = {
    あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
    ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
    ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o", ん: "n",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  };
  const small: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };
  let out = "";
  for (let i = 0; i < h.length; i++) {
    const c = h[i];
    if (c === "っ") {
      const next = base[h[i + 1]] ?? "";
      out += next.startsWith("ch") ? "t" : next[0] ?? "";
      continue;
    }
    if (c === "ー") continue;
    const b = base[c] ?? "";
    if (small[h[i + 1]] && b.endsWith("i")) {
      const stem = b === "shi" || b === "chi" || b === "ji" ? b.slice(0, -1) : b.slice(0, -1) + "y";
      out += stem + small[h[i + 1]].slice(1);
      i++;
    } else out += b;
  }
  return out;
}

/** Normalised edit similarity of two strings, 0–100 (100 = identical). */
function similarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return 100 * (1 - dp[b.length] / Math.max(a.length, b.length));
}

/**
 * Pronunciation result of ONE run, mean over the test sentences: 55% the
 * hiragana matches the expected reading, 20% the romaji matches the romaji of
 * that reading (long-vowel spellings folded), 15% the sentence is split into
 * enough words that each carry a reading, 10% an approximate Vietnamese-style
 * reading is given. An unanswered sentence scores 0.
 */
export function scorePronounce(answers: Map<number, PronounceAnswer>, ms: number, raw?: string, list: readonly PronounceBenchItem[] = PRONOUNCE_ITEMS): BenchResult {
  const details: BenchDetail[] = [];
  let readSum = 0;
  let romSum = 0;
  let wordSum = 0;
  let vietSum = 0;
  let outChars = 0;
  list.forEach((item, i) => {
    const a = answers.get(i + 1);
    const base = { id: i + 1, kind: "pronounce" as const, term: item.ja, meaning: "", source: item.ja, expected: item.reading, answered: Boolean(a) };
    if (!a) {
      details.push({ ...base, readingScore: 0, romajiScore: 0, wordsScore: 0 });
      return;
    }
    outChars += a.reading.length + a.romaji.length + a.viet.length;
    const reading = similarity(kanaOnly(a.reading), item.reading);
    const romaji = similarity(romajiFold(a.romaji), romajiFold(hiraganaToRomaji(item.reading)));
    const withReading = a.words.filter((w) => (w.text ?? "").trim() && (w.reading ?? "").trim()).length;
    const words = 100 * Math.min(1, withReading / item.minWords);
    const viet = a.viet ? 100 : 0;
    readSum += reading;
    romSum += romaji;
    wordSum += words;
    vietSum += viet;
    details.push({
      ...base,
      readingScore: round1(reading),
      romajiScore: round1(romaji),
      wordsScore: round1(words),
      gotReading: a.reading,
      gotRomaji: a.romaji,
      gotViet: a.viet,
    });
  });
  const n = list.length;
  const reading = readSum / n;
  const romaji = romSum / n;
  const words = wordSum / n;
  const viet = vietSum / n;
  return {
    ok: answers.size > 0,
    at: new Date().toISOString(),
    ms,
    task: "pronounce",
    accuracy: round1(0.55 * reading + 0.2 * romaji + 0.15 * words + 0.1 * viet),
    chrf: 0,
    terminology: 0,
    completeness: 0,
    matchAcc: 0,
    writeScore: 0,
    pronounceReading: round1(reading),
    pronounceRomaji: round1(romaji),
    pronounceWords: round1(words),
    pronounceViet: round1(viet),
    items: n,
    answered: answers.size,
    details,
    raw: raw?.slice(0, 6000),
    outChars,
  };
}

/** One vocabulary card of the proofreading test, with the fix each wrong field should get. */
export interface VerifyBenchItem {
  word: string;
  reading: string;
  hanViet: string;
  meaning: string;
  /** Sent like the deck check sends a doubtful reading: only the reading is judged and the meaning rides along as context. */
  readingOnly?: boolean;
  /** Only the fields that are wrong above: the corrected reading (hiragana), Hán Việt (UPPERCASE) or any acceptable Vietnamese meanings. */
  fix: { reading?: string; hanViet?: string; meaning?: string[] };
}
export const VERIFY_ITEMS: readonly VerifyBenchItem[] = [
  { word: "勉強", reading: "べんきょう", hanViet: "", meaning: "học tập", fix: {} },
  { word: "経済", reading: "けえざい", hanViet: "", meaning: "kinh tế", fix: { reading: "けいざい" } },
  { word: "約束", reading: "やくそく", hanViet: "", meaning: "cuộc họp", fix: { meaning: ["hứa", "hẹn", "giao ước"] } },
  { word: "電話", reading: "でんわ", hanViet: "", meaning: "điện thoại", fix: {} },
  { word: "図書館", reading: "としょかん", hanViet: "", meaning: "thư viện", fix: {} },
  // a word with several readings: にんき is right for "được ưa chuộng"
  { word: "人気", reading: "にんき", hanViet: "", meaning: "được ưa chuộng", fix: {} },
  { word: "学校", reading: "がっこ", hanViet: "", meaning: "trường học", fix: { reading: "がっこう" } },
  { word: "天気", reading: "てんき", hanViet: "", meaning: "thời tiết", fix: {} },
  // Hard readings, sent the way the deck check sends them (reading only, the meaning as context): every kanji fits its own
  // on/kun yet the word reads differently, or the reading belongs to another meaning.
  { word: "一人住まい", reading: "いちにんすまい", hanViet: "", meaning: "sống một mình", readingOnly: true, fix: { reading: "ひとりずまい" } },
  { word: "一日", reading: "いちにち", hanViet: "", meaning: "ngày mùng một", readingOnly: true, fix: { reading: "ついたち" } },
  { word: "大人", reading: "おとな", hanViet: "", meaning: "người lớn", readingOnly: true, fix: {} },
];

/** What the model said was wrong on one card; only corrections are present. */
export interface VerifyFix {
  reading?: string;
  hanViet?: string;
  meaning?: string;
}

/** Pull `{items:[{id, readingFix, hanVietFix, meaningFix}]}` out of the model's text, keyed by id. */
export function parseVerify(text: string): Map<number, VerifyFix> {
  const out = new Map<number, VerifyFix>();
  const m = /\{[\s\S]*\}/.exec(text);
  let data: unknown;
  try {
    data = JSON.parse(m ? m[0] : text);
  } catch {
    return out;
  }
  const arr = (data as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return out;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  for (const r of arr as Record<string, unknown>[]) {
    const id = Number(r?.id);
    if (!Number.isFinite(id)) continue;
    out.set(id, {
      reading: str(r.readingFix).slice(0, 100) || undefined,
      hanViet: str(r.hanVietFix).toLocaleUpperCase("vi").slice(0, 100) || undefined,
      meaning: str(r.meaningFix).slice(0, 200) || undefined,
    });
  }
  return out;
}

const hanVietFold = (s: string) => s.normalize("NFC").toLocaleUpperCase("vi").replace(/\s+/g, " ").trim();

/**
 * Proofreading result of ONE run: 60% the wrong fields are corrected right
 * (reading and Hán Việt must match, a meaning must contain an accepted
 * rendering), 40% the right fields are left alone (a false correction costs).
 * A card the model did not answer counts as "no corrections".
 */
export function scoreVerify(answers: Map<number, VerifyFix>, ms: number, raw?: string, list: readonly VerifyBenchItem[] = VERIFY_ITEMS): BenchResult {
  const details: BenchDetail[] = [];
  let fixSum = 0;
  let fixN = 0;
  let keepSum = 0;
  let keepN = 0;
  let outChars = 0;
  list.forEach((item, i) => {
    const a = answers.get(i + 1);
    let fix = 0;
    let fixes = 0;
    let keep = 0;
    let keeps = 0;
    const field = (name: keyof VerifyFix, given: string, right: boolean) => {
      if (!given) return;
      if (!right) {
        fixes++;
        const got = a?.[name];
        const want = item.fix[name];
        let ok = false;
        if (got && name === "reading") ok = kanaOnly(got) === want;
        else if (got && name === "hanViet") ok = hanVietFold(got) === want;
        else if (got && name === "meaning") ok = (want as string[]).some((w) => got.toLowerCase().includes(w));
        if (ok) fix += 100;
      } else {
        keeps++;
        if (!a?.[name]) keep += 100;
      }
    };
    field("reading", item.reading, item.fix.reading === undefined);
    field("hanViet", item.hanViet, item.fix.hanViet === undefined);
    field("meaning", item.readingOnly ? "" : item.meaning, item.fix.meaning === undefined);
    if (a) outChars += (a.reading?.length ?? 0) + (a.hanViet?.length ?? 0) + (a.meaning?.length ?? 0);
    fixSum += fix;
    fixN += fixes;
    keepSum += keep;
    keepN += keeps;
    details.push({
      id: i + 1,
      kind: "verify",
      term: item.word,
      meaning: item.meaning,
      source: `${item.reading} · ${item.meaning}`,
      answered: Boolean(a),
      fixScore: fixes ? round1(fix / fixes) : undefined,
      keepScore: keeps ? round1(keep / keeps) : undefined,
      gotFixes: a ? [a.reading, a.hanViet, a.meaning].filter(Boolean).join(" · ") : undefined,
    });
  });
  const fixAcc = fixN ? fixSum / fixN : 0;
  const keepAcc = keepN ? keepSum / keepN : 0;
  return {
    ok: answers.size > 0,
    at: new Date().toISOString(),
    ms,
    task: "verify",
    accuracy: round1(0.6 * fixAcc + 0.4 * keepAcc),
    chrf: 0,
    terminology: 0,
    completeness: 0,
    matchAcc: 0,
    writeScore: 0,
    verifyFix: round1(fixAcc),
    verifyKeep: round1(keepAcc),
    items: list.length,
    answered: answers.size,
    details,
    raw: raw?.slice(0, 6000),
    outChars,
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Latency statistics over the successful runs. */
export function latencyStats(ms: number[]): LatencyStats {
  const mean = avg(ms);
  const stdev = Math.sqrt(avg(ms.map((x) => (x - mean) ** 2)));
  const sorted = [...ms].sort((a, b) => a - b);
  return {
    mean: Math.round(mean),
    median: Math.round(median(ms)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdev: Math.round(stdev),
    cv: mean > 0 ? Math.round((stdev / mean) * 1000) / 1000 : 0,
    // Left out (not `undefined`) with fewer than 5 runs, so it is not stored as null.
    ...(ms.length >= 5 ? { p95: sorted[Math.ceil(0.95 * sorted.length) - 1] } : {}),
  };
}

/** One attempt: the result of a run that answered, or the failure of one that did not. */
export type BenchAttempt = { ok: true; result: BenchResult } | { ok: false; at: string; ms: number; error: string; raw?: string };

/**
 * Combine the repetitions into one result: accuracy parts are the mean of the
 * successful runs, latency is their median, the failures stay on record in
 * `runs` and lower `successRate`. All runs failing gives `ok: false`.
 */
export function aggregateRuns(attempts: BenchAttempt[], itemCount = BENCH_ITEMS.length): BenchResult {
  const runs: BenchRun[] = attempts.map((a) =>
    a.ok
      ? { ok: true, at: a.result.at, ms: a.result.ms, accuracy: a.result.accuracy, answered: a.result.answered }
      : { ok: false, at: a.at, ms: a.ms, error: a.error },
  );
  const good = attempts.flatMap((a) => (a.ok ? [a.result] : []));
  const lastAttempt = attempts[attempts.length - 1];
  if (good.length === 0) {
    const fail = lastAttempt as Extract<BenchAttempt, { ok: false }>;
    return {
      ok: false,
      at: fail.at,
      ms: fail.ms,
      accuracy: 0,
      chrf: 0,
      terminology: 0,
      completeness: 0,
      matchAcc: 0,
      writeScore: 0,
      items: itemCount,
      answered: 0,
      error: fail.error,
      raw: fail.raw,
      runs,
      successRate: 0,
    };
  }
  const last = good[good.length - 1];
  const mean = (f: (r: BenchResult) => number) => round1(avg(good.map(f)));
  const latency = latencyStats(good.map((r) => r.ms));
  const opt = (f: (r: BenchResult) => number | undefined) =>
    good.some((r) => f(r) !== undefined) ? mean((r) => f(r) ?? 0) : undefined;
  return {
    ok: true,
    at: last.at,
    ms: latency.median,
    accuracy: mean((r) => r.accuracy),
    chrf: mean((r) => r.chrf),
    terminology: mean((r) => r.terminology),
    completeness: mean((r) => r.completeness),
    matchAcc: mean((r) => r.matchAcc),
    writeScore: mean((r) => r.writeScore),
    grammarHit: opt((r) => r.grammarHit),
    grammarSplit: opt((r) => r.grammarSplit),
    grammarTrans: opt((r) => r.grammarTrans),
    pronounceReading: opt((r) => r.pronounceReading),
    pronounceRomaji: opt((r) => r.pronounceRomaji),
    pronounceWords: opt((r) => r.pronounceWords),
    pronounceViet: opt((r) => r.pronounceViet),
    verifyFix: opt((r) => r.verifyFix),
    verifyKeep: opt((r) => r.verifyKeep),
    items: last.items,
    answered: Math.round(avg(good.map((r) => r.answered))),
    translateOnly: last.translateOnly,
    details: last.details,
    raw: last.raw,
    runs,
    successRate: Math.round((good.length / attempts.length) * 1000) / 1000,
    latency,
    charsPerSec: Math.round(median(good.map((r) => ((r.outChars ?? 0) / Math.max(1, r.ms)) * 1000))),
  };
}

/**
 * Speed score 0–100 on a fixed log scale: `fastMs` or better = 100, `slowMs` or
 * worse = 0. Absolute (not relative to the other services), so a score does not
 * change when another service is added or removed, and one very slow service
 * is just clipped at 0 instead of stretching the scale.
 */
export function speedScore(ms: number, fastMs = SPEED_FAST_MS, slowMs = SPEED_SLOW_MS): number {
  if (!(ms > 0)) return 0;
  return clamp100(100 * (1 - Math.log(ms / fastMs) / Math.log(slowMs / fastMs)));
}

export interface RankOptions {
  /** Share of speed in the combined score (0–1). */
  speedWeight?: number;
  /** Services below this accuracy are shown but not ranked. */
  minAccuracy?: number;
  fastMs?: number;
  slowMs?: number;
}

export interface Ranked {
  id: string;
  accuracy: number;
  ms: number;
  speed: number;
  successRate: number;
  /** `((1−w)·accuracy + w·speed) × successRate`. */
  final: number;
  /** Reaches the minimum accuracy. */
  eligible: boolean;
  /** Not beaten on both accuracy and speed by another eligible service. */
  pareto: boolean;
}

/**
 * Ranks the services that have a successful benchmark: eligible ones first by
 * `final` (ties: accuracy, then speed), then those below the accuracy bar.
 * Failed / unmeasured services are absent.
 */
export function rankServices(
  list: { id: string; bench?: Pick<BenchResult, "ok" | "accuracy" | "ms" | "successRate"> | null }[],
  opts: RankOptions = {},
): Ranked[] {
  const w = Math.min(1, Math.max(0, opts.speedWeight ?? DEFAULT_SPEED_WEIGHT));
  const minAcc = opts.minAccuracy ?? MIN_ACCURACY;
  const rows: Ranked[] = list
    .filter((s) => s.bench?.ok && s.bench.ms > 0)
    .map((s) => {
      const b = s.bench!;
      const speed = speedScore(b.ms, opts.fastMs, opts.slowMs);
      const successRate = b.successRate ?? 1;
      return {
        id: s.id,
        accuracy: b.accuracy,
        ms: b.ms,
        speed: round1(speed),
        successRate,
        final: round1(((1 - w) * b.accuracy + w * speed) * successRate),
        eligible: b.accuracy >= minAcc,
        pareto: false,
      };
    });
  const eligible = rows.filter((r) => r.eligible);
  for (const r of eligible) {
    r.pareto = !eligible.some((o) => o !== r && o.accuracy >= r.accuracy && o.speed >= r.speed && (o.accuracy > r.accuracy || o.speed > r.speed));
  }
  return rows.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) || b.final - a.final || b.accuracy - a.accuracy || b.speed - a.speed,
  );
}

export interface BestOf {
  overall?: string;
  accuracy?: string;
  speed?: string;
  value?: string;
}

/**
 * The four views, among eligible services only:
 * overall = highest final; accuracy = highest accuracy (within 1 point the faster
 * one wins); speed = highest speed score; value = the fastest of the Pareto
 * services that are within 5 accuracy points of the best.
 */
export function bestOf(ranked: Ranked[]): BestOf {
  const ok = ranked.filter((r) => r.eligible);
  if (ok.length === 0) return {};
  const fastest = (xs: Ranked[]) => [...xs].sort((a, b) => b.speed - a.speed || b.accuracy - a.accuracy)[0];
  const maxAcc = Math.max(...ok.map((r) => r.accuracy));
  return {
    overall: ok[0].id,
    accuracy: fastest(ok.filter((r) => r.accuracy >= maxAcc - 1)).id,
    speed: fastest(ok).id,
    value: fastest(ok.filter((r) => r.pareto && r.accuracy >= maxAcc - 5)).id,
  };
}

/** One line of a task's benchmark history: how a past run of that task went. */
export interface BenchHistoryEntry {
  at: string;
  ok: boolean;
  accuracy: number;
  ms: number;
  successRate: number;
  /** Repetitions in that run. */
  runs: number;
  error?: string;
}
export type BenchHistory = Partial<Record<BenchTask, BenchHistoryEntry[]>>;
export const HISTORY_LIMIT = 30;

export const historyEntry = (r: BenchResult): BenchHistoryEntry => ({
  at: r.at,
  ok: r.ok,
  accuracy: r.accuracy,
  ms: r.ms,
  successRate: r.successRate ?? (r.ok ? 1 : 0),
  runs: r.runs?.length ?? 1,
  ...(r.error ? { error: r.error.slice(0, 200) } : {}),
});

/**
 * A result for one task rebuilt from an OLD combined benchmark (translate +
 * write in one call), so scores measured before per-task benchmarks stay
 * visible until the service is scored again. Grammar was never measured then.
 */
export function legacyTaskResult(bench: BenchResult | null | undefined, task: BenchTask): BenchResult | undefined {
  if (!bench?.ok || bench.task || task === "grammar" || task === "pronounce" || task === "verify") return undefined;
  if (task === "write" && bench.translateOnly) return undefined;
  const details = bench.details?.filter((d) => d.kind === task);
  const w = ACCURACY_WEIGHTS;
  const accuracy =
    task === "translate"
      ? round1(
          (w.chrf * bench.chrf + w.terminology * bench.terminology + w.completeness * bench.completeness + (bench.translateOnly ? 0 : w.match * bench.matchAcc)) /
            (w.chrf + w.terminology + w.completeness + (bench.translateOnly ? 0 : w.match)),
        )
      : bench.writeScore;
  return { ...bench, task, legacy: true, accuracy, details, items: details?.length ?? bench.items };
}
