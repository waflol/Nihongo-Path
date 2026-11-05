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
  kind: "translate" | "write";
  /** The word being tested and its meaning. */
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

/** Turn the model's answers (by 1-based item id) and the call time into the result of ONE run. */
export function scoreBenchmark(
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
  BENCH_ITEMS.forEach((item, i) => {
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
  // A translator is judged on translation alone: the first three parts, re-normalised.
  const accuracy = translateOnly
    ? (w.chrf * chrf + w.terminology * terminology + w.completeness * completeness) / (w.chrf + w.terminology + w.completeness)
    : w.chrf * chrf + w.terminology * terminology + w.completeness * completeness + w.match * matchAcc + w.write * writeScore;
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
    items: translateOnly ? nTranslate : BENCH_ITEMS.length,
    answered: answers.size,
    translateOnly: translateOnly || undefined,
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
export function aggregateRuns(attempts: BenchAttempt[]): BenchResult {
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
      items: BENCH_ITEMS.length,
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
