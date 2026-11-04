import type { Role } from "../common/roles.js";

/**
 * Verified access-token payload. `AuthGuard` verifies the Bearer token and
 * attaches this to `request.user`; `@CurrentUser()` returns it.
 */
export interface AuthUser {
  /** MongoDB user id. */
  sub: string;
  role: Role;
  lang: string;
}

/** Public, safe-to-return user shape (never includes password hashes). */
export interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  role: Role;
  lang: string;
  /** IANA time zone (P3-SRS-05); the SRS scheduler's day boundary. */
  timezone: string;
  status: string;
  createdAt: string;
}

/** Response of register / login / refresh (P2-AUTH-04, ADR-auth-provider). */
export interface AuthTokensResponse {
  user: PublicUser;
  accessToken: string;
  /**
   * Opaque refresh token. The API also mirrors it into an httpOnly cookie
   * (Path=/auth) so the UI never sees it in JavaScript-reachable storage
   * (P2-UI-05).
   */
  refreshToken: string;
  tokenType: "Bearer";
  accessExpiresAt: string;
  refreshExpiresAt: string;
}
