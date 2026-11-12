/**
 * Ranking of benchmarked AI services — the same formulas as the server
 * (`apps/api/src/ai/ai-benchmark.ts`: `speedScore`, `rankServices`, `bestOf`),
 * so the sliders can re-rank live without a round trip. Keep the two in step;
 * the server's spec pins the numbers (e.g. 6.6 s → speed 55.9, final 81.6 at 70/30).
 */

/** This latency or better = 100, this or worse = 0 (log scale in between). */
export const SPEED_FAST_MS = 2_000;
export const SPEED_SLOW_MS = 30_000;
export const MIN_ACCURACY = 75;
export const DEFAULT_SPEED_WEIGHT = 0.25;

const clamp100 = (n: number) => Math.min(100, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function speedScore(ms: number): number {
  if (!(ms > 0)) return 0;
  return clamp100(100 * (1 - Math.log(ms / SPEED_FAST_MS) / Math.log(SPEED_SLOW_MS / SPEED_FAST_MS)));
}

/** The jobs scored separately; each has its own priority order (mirrors the server's `BenchTask`). */
export type BenchTask = "translate" | "write" | "grammar" | "pronounce" | "verify";
export const TASK_LABELS: Record<BenchTask, string> = { translate: "Dịch", write: "Đặt câu", grammar: "Phân tích ngữ pháp", pronounce: "Kiểm tra từ vựng", verify: "Kiểm tra từ vựng" };

export interface RankInput {
  id: string;
  bench?: { ok: boolean; accuracy: number; ms: number; successRate?: number } | null;
}

export interface Ranked {
  id: string;
  accuracy: number;
  ms: number;
  /** Speed score 0–100. */
  speed: number;
  successRate: number;
  /** `((1−w)·accuracy + w·speed) × successRate`. */
  final: number;
  /** Reaches the minimum accuracy. */
  eligible: boolean;
  /** Not beaten on both accuracy and speed by another eligible service. */
  pareto: boolean;
}

export function rankServices(list: RankInput[], speedWeight = DEFAULT_SPEED_WEIGHT, minAccuracy = MIN_ACCURACY): Ranked[] {
  const w = Math.min(1, Math.max(0, speedWeight));
  const rows: Ranked[] = list
    .filter((s) => s.bench?.ok && s.bench.ms > 0)
    .map((s) => {
      const b = s.bench!;
      const speed = speedScore(b.ms);
      const successRate = b.successRate ?? 1;
      return {
        id: s.id,
        accuracy: b.accuracy,
        ms: b.ms,
        speed: round1(speed),
        successRate,
        final: round1(((1 - w) * b.accuracy + w * speed) * successRate),
        eligible: b.accuracy >= minAccuracy,
        pareto: false,
      };
    });
  const eligible = rows.filter((r) => r.eligible);
  for (const r of eligible) {
    r.pareto = !eligible.some((o) => o !== r && o.accuracy >= r.accuracy && o.speed >= r.speed && (o.accuracy > r.accuracy || o.speed > r.speed));
  }
  return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.final - a.final || b.accuracy - a.accuracy || b.speed - a.speed);
}

export interface BestOf {
  overall?: string;
  accuracy?: string;
  speed?: string;
  value?: string;
}

/** The four views among eligible services (see the server's `bestOf`). */
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
