/** Only same-site absolute paths — rejects `//host` and `/\host` open redirects and auth-page loops. */
export function isSafeFrom(value: string | null | undefined): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return false;
  }
  return !/^\/(login|register|admin\/login)(\/|\?|#|$)/.test(value);
}
