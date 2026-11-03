/**
 * Bare constants importable from any context — including `proxy.ts` (the
 * Next 16 Edge/CDN-safe entrypoint must not pull in server-only modules like
 * `next/headers`). Keep this file import-free.
 */

/** httpOnly cookie holding the *refresh* token (P2-UI-05). */
export const SESSION_COOKIE = "np_session";
