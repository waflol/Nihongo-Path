/**
 * What is left of the per-service benchmark: the task names, the result a
 * service stores per task (written by the evaluation benchmark, `src/eval`),
 * ranking by accuracy + speed, the run history, chrF, and the answer parsers
 * the playground and the deck check still use. The old fixed test sets and
 * their scorers were replaced by the evaluation benchmark.
 */

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

/** One grammar-analysis answer, as parsed from the model. */
export interface GrammarAnswer {
  translation: string;
  tokens: { text?: string; reading?: string; pos?: string; meaning?: string }[];
  grammar: { pattern?: string; level?: string; explanation?: string }[];
}

/** Speed scale: this latency or better = 100, this or worse = 0 (log scale in between). */
export const SPEED_FAST_MS = 2_000;
export const SPEED_SLOW_MS = 30_000;
/** Below this accuracy a service is shown but not ranked. */
export const MIN_ACCURACY = 75;
/** Default share of speed in the combined score. */
export const DEFAULT_SPEED_WEIGHT = 0.25;

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
  /** ISO time of the run. */
  at: string;
  /** Typical latency of one call for this task (ms). */
  ms: number;
  /** 0–100 score of the task. */
  accuracy: number;
  items: number;
  /** How many items were answered in a readable way. */
  answered: number;
  error?: string;
  runs?: BenchRun[];
  /** Share (0–1) of the items that did not end in an error. */
  successRate?: number;
  latency?: LatencyStats;
  /** A newer attempt that failed while this (older) result was kept. */
  lastAttempt?: { at: string; error?: string; ms: number };
  task?: BenchTask;
  /** Written by the evaluation benchmark (`src/eval`): the run it came from, its label and dataset task. Results without it are from the retired fixed benchmark and are ignored. */
  source?: "eval";
  evalRunId?: string;
  evalLabel?: string;
  evalTask?: string;
  /** Share (0–100) of the run's results at or above its pass threshold. */
  passRate?: number;
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
const clamp100 = (n: number) => Math.min(100, Math.max(0, n));

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
