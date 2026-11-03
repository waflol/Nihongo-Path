import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { SESSION_COOKIE, clearSessionCookie } from "@/lib/session";

/**
 * POST /api/auth/logout
 *
 * Revokes the presented refresh token on the API (rotation already means a
 * stale token cannot be reused, T-P2-10) and clears the httpOnly cookie.
 * Idempotent: logging out when not signed in still clears the cookie.
 */
export async function POST() {
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;

  // Revoke server-side so the token is dead in the DB, not just gone from
  // the browser. Ignore failures — the cookie is cleared regardless.
  if (current) {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: { refreshToken: current },
    }).catch(() => undefined);
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
