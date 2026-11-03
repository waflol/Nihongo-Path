import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "../common/roles.js";
import { parseDurationMs } from "../common/duration.js";

/** Verified access-token payload. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
  lang: string;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
}

const b64url = (buf: Buffer): string =>
  buf.toString("base64url");

/**
 * Access-token service (P2-AUTH-05, ADR-auth-provider).
 *
 * - Access: **HS256 JWT** signed with `JWT_ACCESS_SECRET`, short TTL
 *   (`JWT_ACCESS_EXPIRES_IN`, default `15m`). Stateless — no DB hit per request.
 * - Refresh: opaque token, NOT handled here; `AuthService` owns its rotation
 *   in `auth_sessions` so it can be revoked.
 *
 * A missing secret makes the whole auth surface refuse to run (503) — it is
 * optional by design but never silently unusable. No external `jsonwebtoken`
 * dependency: the HS256 format is small and auditable.
 */
@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get<string>("JWT_ACCESS_SECRET") ?? "";
  }

  /** True when the access-token secret is configured (auth is usable). */
  get isConfigured(): boolean {
    return this.secret.length > 0;
  }

  private accessTtlMs(): number {
    return parseDurationMs(
      this.config.get<string>("JWT_ACCESS_EXPIRES_IN"),
      15 * 60_000,
    );
  }

  /** Mint a short-lived HS256 access token. */
  signAccessToken(user: {
    id: string;
    role: Role;
    lang: string;
  }): { token: string; expiresAt: Date } {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + Math.floor(this.accessTtlMs() / 1000);

    const header = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
    const payload = b64url(
      Buffer.from(JSON.stringify({ sub: user.id, role: user.role, lang: user.lang, iat, exp })),
    );
    const signature = this.hmac(`${header}.${payload}`);

    const token = `${header}.${payload}.${signature}`;
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /**
   * Verify + decode a Bearer access token. Throws a generic 401 on any
   * invalid/expired token (T-P2-08) — it never reveals which check failed.
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw this.invalid();
    }
    const [header, payload, signature] = parts;

    // Signature first (the security-critical check). A malformed token may
    // carry a signature of the wrong length — guard before the constant-time
    // compare (which throws on a length mismatch).
    const expected = this.hmac(`${header}.${payload}`);
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (
      sigBuf.length !== expBuf.length ||
      !timingSafeEqual(sigBuf, expBuf)
    ) {
      throw this.invalid();
    }

    let decoded: { sub?: string; role?: Role; lang?: string; exp?: number; iat?: number };
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw this.invalid();
    }

    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.role !== "string" ||
      typeof decoded.lang !== "string" ||
      typeof decoded.exp !== "number"
    ) {
      throw this.invalid();
    }

    // Expiry — a past `exp` is rejected (T-P2-08).
    if (decoded.exp * 1000 <= Date.now()) {
      throw this.invalid();
    }

    return {
      sub: decoded.sub,
      role: decoded.role,
      lang: decoded.lang,
      iat: decoded.iat ?? 0,
      exp: decoded.exp,
    };
  }

  private hmac(input: string): string {
    return createHmac("sha256", this.secret)
      .update(input)
      .digest("base64url");
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException("Invalid or expired access token");
  }
}
