/**
 * Timezone-aware day boundaries for SRS (P3-SRS-05, spec §4.4 "xử lý
 * timezone, ngày ôn").
 *
 * A card's due date is anchored to the START of the user's LOCAL calendar day
 * so a review scheduled "N days later" lands on a sensible day *for them*,
 * whatever IANA zone they chose. Two users reviewing the same instant in
 * different zones get due dates that are correct on each of their calendars
 * (T-P3-05). Changing the profile timezone only re-anchors *future*
 * scheduling (T-P3-12) — the algorithm state itself is zone-agnostic.
 *
 * No external dependency: `Intl.DateTimeFormat` parts are the only standard
 * way to map a UTC instant to an IANA zone without a tz-data package.
 */

/** Milliseconds in one day. */
export const DAY_MS = 86_400_000;

/**
 * The UTC instant of LOCAL MIDNIGHT (00:00 wall time) of the day that
 * contains `epochMs`, in `timeZone`.
 *
 * `timeZone` must be a valid IANA id — it is validated at the profile write
 * boundary, and `Intl.DateTimeFormat` throws `RangeError` on an unknown zone,
 * which callers surface as 400 rather than silently falling back to UTC.
 */
export function localStartOfDay(epochMs: number, timeZone: string): number {
  const [y, m, d] = wallClockParts(epochMs, timeZone);
  // `m` is already 0-based from `wallClockParts`.
  let midnight = Date.UTC(y, m, d);
  // Local wall time = UTC + offset, so local midnight is `offset` before the
  // wall-clock date. The offset can differ between the two instants (DST at
  // midnight is rare but real) — correct with one extra pass.
  const offset = zoneOffsetMs(midnight, timeZone);
  midnight -= offset;
  const corrected = zoneOffsetMs(midnight, timeZone);
  if (corrected !== offset) midnight -= corrected - offset;
  return midnight;
}

/** `YYYY-MM-DD` of the user's local date containing `epochMs` (stable day key). */
export function localDayKey(epochMs: number, timeZone: string): string {
  const [y, m, d] = wallClockParts(epochMs, timeZone);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Wall-clock date parts of `epochMs` in `timeZone`: `[year, month0, day]`. */
function wallClockParts(epochMs: number, timeZone: string): [number, number, number] {
  const parts = partsInZone(epochMs, timeZone);
  return [Number(parts.year), Number(parts.month) - 1, Number(parts.day)];
}

/** Building an Intl formatter is expensive — keep one per zone. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsInZone(epochMs: number, timeZone: string): Record<string, string> {
  let fmt = FORMATTERS.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    });
    FORMATTERS.set(timeZone, fmt);
  }
  const out: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(epochMs)) {
    if (type !== "literal") out[type] = value;
  }
  return out;
}

/**
 * The zone's UTC offset (ms, positive = ahead of UTC) that applies at
 * `epochMs`. Classic trick: format the instant as wall-clock parts, rebuild
 * those digits as-if-UTC, and the difference is the offset.
 */
function zoneOffsetMs(epochMs: number, timeZone: string): number {
  const p = partsInZone(epochMs, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - (epochMs - (epochMs % 1000));
}
