/**
 * Pure helpers for review timestamps and ordering (plan-fsrs-6 D5).
 * No clock, no I/O: `now` is always passed in.
 */

export const MAX_BACKDATE_MS = 7 * 86_400_000;
export const MAX_FUTURE_MS = 2 * 60_000;

/**
 * Accept the client's `reviewedAt` when it lies in `[now − 7d, now + 2min]`
 * and does not go back before the card's previous review; otherwise fall
 * back to server `now` and flag it.
 */
export function resolveReviewedAt(
  clientMs: number | undefined,
  now: number,
  prevReviewMs?: number,
): { at: number; clockAdjusted: boolean } {
  if (clientMs === undefined) return { at: now, clockAdjusted: false };
  const ok =
    Number.isFinite(clientMs) &&
    clientMs >= now - MAX_BACKDATE_MS &&
    clientMs <= now + MAX_FUTURE_MS &&
    (prevReviewMs === undefined || clientMs >= prevReviewMs);
  return ok ? { at: clientMs, clockAdjusted: false } : { at: now, clockAdjusted: true };
}

/** Stable sort by client time (undefined → keeps arrival order, last). */
export function orderReviews<T extends { reviewedAt?: number }>(items: T[]): T[] {
  return items
    .map((v, i) => ({ v, i }))
    .sort((a, b) => {
      const x = a.v.reviewedAt ?? Number.POSITIVE_INFINITY;
      const y = b.v.reviewedAt ?? Number.POSITIVE_INFINITY;
      return x === y ? a.i - b.i : x - y;
    })
    .map((e) => e.v);
}
