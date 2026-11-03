/**
 * Parse a `ms`-style duration string (`"15m"`, `"7d"`, `"30"`) into
 * milliseconds. A bare number means seconds. Missing/invalid → `fallbackMs`.
 *
 * Used for `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (P2-AUTH-05).
 */
const UNIT_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function parseDurationMs(
  value: string | undefined,
  fallbackMs: number,
): number {
  const raw = value?.trim();
  if (!raw || raw.length === 0) {
    return fallbackMs;
  }
  const match = /^(\d+)([smhd]?)$/.exec(raw);
  if (!match) {
    return fallbackMs;
  }
  const amount = Number(match[1]);
  const unit = (match[2] || "s") as keyof typeof UNIT_MS;
  return amount * UNIT_MS[unit];
}
