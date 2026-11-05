const SENSITIVE = /pass|token|secret|authorization|cookie/i;

/** Drop sensitive keys and cap depth / array length of anything we persist. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : scrub(v, depth + 1)]),
  );
}
