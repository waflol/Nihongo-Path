import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch, ApiError } from "@/lib/api";
import {
  clearSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "@/lib/session";

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * POST /api/auth/refresh
 *
 * Rotates the refresh token: the API revokes the presented one and mints a
 * fresh pair (ADR-auth-provider). The NEW refresh token replaces the cookie;
 * the response carries no secrets to the browser.
 */
export async function POST() {
  const store = await cookies();
  const current = store.get(SESSION_COOKIE)?.value;
  if (!current) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let result: RefreshResult;
  try {
    result = await apiFetch<RefreshResult>("/auth/refresh", {
      method: "POST",
      body: { refreshToken: current },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // Stale/expired → drop the cookie so the UI can redirect to /login.
      await clearSessionCookie();
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    throw error;
  }

  await clearSessionCookie();
  await setSessionCookie(result.refreshToken, {
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}
