import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Proxy (Next 16's successor to `middleware.ts`, P2-UI-03).
 *
 * Protects the private routes by the *presence* of the session cookie. This
 * is a fast, cookie-presence gate only — real authorization happens
 * server-side: `getSession()` verifies the refresh token against the API and
 * the backend guards enforce role/entitlement on every request. Proxy must
 * stay dependency-free (it can run on the CDN), so it only reads the cookie
 * name from `lib/constants` (a bare string, no server-only imports).
 *
 * - No cookie → redirect to `/login` (remembers intended destination in `?from=`).
 * - Cookie present → allow; the page's server code does the real check.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (hasSession) {
    return NextResponse.next();
  }

  const from = request.nextUrl.pathname + request.nextUrl.search;
  const loginUrl = new URL("/login", request.url);
  if (from && from !== "/login") {
    loginUrl.searchParams.set("from", from);
  }
  return NextResponse.redirect(loginUrl);
}

/** Only run on the private routes — keep it off static files and public pages. */
export const config = {
  matcher: ["/learn/:path*", "/admin/:path*"],
};
