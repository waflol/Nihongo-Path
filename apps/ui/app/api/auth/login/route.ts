import { NextResponse } from "next/server";
import { apiFetch, ApiError } from "@/lib/api";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

interface LoginResult {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    role: string;
    lang: string;
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * POST /api/auth/login
 *
 * Two providers (ADR-auth-provider):
 * - `{ email, password }` → email/password sign-in.
 * - `{ google: credential }` → Google ID-token sign-in.
 *
 * On success the *refresh* token is stored in an httpOnly cookie (the client
 * never sees it). The response carries only the public user shape — the
 * access token is intentionally NOT returned to the browser; server-side
 * routes exchange the cookie for it on demand (P2-UI-05).
 */
export async function POST(request: Request) {
  let body: { email?: string; password?: string; google?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad request" },
      { status: 400 },
    );
  }

  let result: LoginResult;
  try {
    if (body.google) {
      result = await apiFetch<LoginResult>("/auth/google/login", {
        method: "POST",
        body: { credential: body.google },
      });
    } else if (body.email && body.password) {
      result = await apiFetch<LoginResult>("/auth/email/login", {
        method: "POST",
        body: { email: body.email, password: body.password },
      });
    } else {
      return NextResponse.json(
        { error: "Cần email+mật khẩu hoặc Google credential" },
        { status: 400 },
      );
    }
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 429) {
        const wait = (error.body as { retryAfterSeconds?: number } | null)
          ?.retryAfterSeconds;
        return NextResponse.json(
          {
            error: `Đăng nhập quá nhiều lần, thử lại sau${wait ? ` ${wait} giây` : " ít phút"}`,
          },
          { status: 429 },
        );
      }
      const status =
        error.status === 401 ? 401 : error.status >= 500 ? 502 : 400;
      return NextResponse.json(
        { error: "Email hoặc mật khẩu không đúng" },
        { status },
      );
    }
    throw error;
  }

  // Replace any stale session: clear first, then set the new refresh cookie
  // (a later `delete` in the same response would wipe the cookie we just set).
  await clearSessionCookie();
  await setSessionCookie(result.refreshToken, {
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({
    ok: true,
    user: result.user,
  });
}
