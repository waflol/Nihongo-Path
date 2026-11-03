import { cookies } from "next/headers";
import { apiFetch, ApiError } from "./api";
import { SESSION_COOKIE } from "./constants";

/** Re-exported so existing callers keep `import { SESSION_COOKIE } from "session"`. */
export { SESSION_COOKIE };

/**
 * Server-side session helpers (P2-UI-05).
 *
 * The *refresh* token lives in an httpOnly cookie (`np_session`) — it is set
 * and cleared only by Route Handlers, never exposed to client JavaScript
 * (the checklist requirement: "Không lưu refresh token ở nơi script đọc
 * được"). These helpers read that cookie on the server, exchange it for a
 * short-lived access token via the API's `/auth/verify` (no rotation, so a
 * page render does not burn a rotation), and return the caller's identity.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: string;
  lang: string;
}

export interface SessionState {
  authenticated: boolean;
  user: SessionUser | null;
  /** Bearer access token valid for the lifetime of this response. */
  accessToken: string | null;
}

/** Refresh-token lifetime — must not exceed the API's refresh TTL. */
const REFRESH_COOKIE_MAX_AGE_S = 7 * 24 * 3600;

/** Read the session cookie + verify it against the API. */
export async function getSession(): Promise<SessionState> {
  const store = await cookies();
  const refreshToken = store.get(SESSION_COOKIE)?.value;
  if (!refreshToken) {
    return { authenticated: false, user: null, accessToken: null };
  }

  try {
    const res = await apiFetch<{
      user: SessionUser;
      accessToken: string;
    }>("/auth/verify", {
      method: "POST",
      body: { refreshToken },
    });
    return {
      authenticated: true,
      user: res.user,
      accessToken: res.accessToken,
    };
  } catch (error) {
    // Unknown / expired / revoked refresh token → treat as signed out.
    if (error instanceof ApiError) {
      return { authenticated: false, user: null, accessToken: null };
    }
    throw error;
  }
}

export interface SetSessionCookieOptions {
  /** `secure` in production, `httpOnly` always, site-scoped same-site. */
  secure?: boolean;
}

/**
 * Set the httpOnly refresh cookie (after login / register / refresh).
 * Must be called from a Route Handler (only there can outgoing cookies be
 * mutated — Next 16 constraint).
 */
export async function setSessionCookie(
  refreshToken: string,
  opts: SetSessionCookieOptions = {},
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: opts.secure ?? process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_S,
  });
}

/** Clear the session cookie (logout). Route Handler only. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
