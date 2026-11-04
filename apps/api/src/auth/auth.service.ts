import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { OAuth2Client, type LoginTicket } from "google-auth-library";
import { randomBytes } from "node:crypto";
import { parseDurationMs } from "../common/duration.js";
import {
  hashPassword,
  verifyPassword,
} from "../common/password.js";
import type { AuthTokensResponse, PublicUser } from "./auth.types.js";
import {
  AuthAccount,
  AuthAccountDocument,
  AuthProvider,
} from "../users/schemas/auth-account.schema.js";
import { User, UserDocument, USER_STATUSES } from "../users/schemas/user.schema.js";
import { AuthSession, AuthSessionDocument } from "./schemas/auth-session.schema.js";
import { TokenService } from "./token.service.js";

const REFRESH_TOKEN_BYTES = 16; // 128-bit opaque refresh token (hex)

export interface RegisterEmailInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface GoogleCredentialInput {
  /** Google One-Tap ID token (JWT), or an OAuth ID-token exchange result. */
  credential: string;
}

/**
 * Sign-in / sign-up across the two decided providers (ADR-auth-provider):
 * email + password and Google ID-token. Both mint the same token pair and
 * link to the same `users` row (P2-AUTH-04).
 *
 * Security notes:
 * - Wrong-password and unknown-email both surface as the SAME generic 401
 *   ("Invalid credentials") — the endpoint never reveals whether an account
 *   exists (T-P2-02).
 * - Google ID tokens are verified against `GOOGLE_CLIENT_ID` + issuer check
 *   before any account is touched; unverified credentials are rejected with
 *   401.
 * - Refresh rotation: `refresh()` revokes the presented session and mints a
 *   new one, so a replayed token is stale (T-P2-08 / T-P2-10).
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name)
    private readonly user: Model<UserDocument>,
    @InjectModel(AuthAccount.name)
    private readonly account: Model<AuthAccountDocument>,
    @InjectModel(AuthSession.name)
    private readonly session: Model<AuthSessionDocument>,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Access-token minting requires `JWT_ACCESS_SECRET`. When absent, the whole
   * auth surface refuses to run (503) — it is optional by design, but never
   * silently unusable.
   */
  assertConfigured(provider?: AuthProvider): void {
    if (!this.tokens.isConfigured) {
      throw new ServiceUnavailableException(
        "Authentication is not configured (JWT_ACCESS_SECRET missing)",
      );
    }
    if (provider === "google" && !this.googleClient) {
      throw new ServiceUnavailableException(
        "Google sign-in is not configured (GOOGLE_CLIENT_ID missing)",
      );
    }
  }

  // ── email + password ─────────────────────────────────────────────────

  async registerEmail(input: RegisterEmailInput): Promise<AuthTokensResponse> {
    this.assertConfigured();
    const email = this.normalizeEmail(input.email);

    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException("Account already exists");
    }

    const [doc] = await this.createUserWithAccount({
      email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName?.trim() || undefined,
      provider: "email",
      providerAccountId: email,
    });

    return this.mintSession(doc, "register");
  }

  async loginEmail(input: {
    email: string;
    password: string;
  }): Promise<AuthTokensResponse> {
    this.assertConfigured();
    const email = this.normalizeEmail(input.email);

    // Deliberate: both "no such user" and "wrong password" fall through to
    // the single generic 401 below (T-P2-02 — no existence oracle).
    const doc = await this.findByEmail(email);
    if (!doc || !doc.passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }
    const ok = await verifyPassword(input.password, doc.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }
    this.assertActive(doc);

    return this.mintSession(doc, "login");
  }

  // ── Google ID token ──────────────────────────────────────────────────

  async loginGoogle(input: GoogleCredentialInput): Promise<AuthTokensResponse> {
    this.assertConfigured("google");

    const ticket = await this.verifyGoogleIdToken(input.credential);
    const payload = ticket.getPayload();
    const sub = ticket.getUserId();
    if (!sub || !payload) {
      throw new UnauthorizedException("Invalid Google credential");
    }

    let accountDoc = await this.account
      .findOne({
        provider: "google",
        providerAccountId: sub,
      })
      .exec();

    if (accountDoc) {
      // Existing account — load its user, lock out suspended.
      const doc = await this.user.findById(accountDoc.user).exec();
      if (!doc) {
        // Orphaned link — cannot sign in, do not auto-heal silently.
        throw new ForbiddenException("Account link is broken");
      }
      this.assertActive(doc);
      return this.mintSession(doc, "login");
    }

    // First sign-in: create the user + link it to this Google identity.
    const email =
      payload.email_verified && payload.email
        ? this.normalizeEmail(payload.email)
        : undefined;
    const [doc] = await this.createUserWithAccount({
      email,
      passwordHash: null,
      displayName: (payload as { name?: string }).name || undefined,
      provider: "google",
      providerAccountId: sub,
    });
    return this.mintSession(doc, "register");
  }

  // ── refresh / logout ─────────────────────────────────────────────────

  async refresh(
    refreshToken: string,
    userAgent?: string,
  ): Promise<AuthTokensResponse> {
    this.assertConfigured();
    const current = await this.session
      .findOne({ token: refreshToken, revokedAt: { $eq: null } })
      .exec();

    if (!current || current.expiresAt.getTime() <= Date.now()) {
      // Either unknown or expired — a generic 401 (T-P2-08).
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    // Rotate: revoke the presented session, then mint a fresh one.
    current.revokedAt = new Date();
    await current.save();

    const doc = await this.user.findById(current.user).exec();
    if (!doc) {
      throw new ForbiddenException("Account no longer exists");
    }
    this.assertActive(doc);

    return this.mintSession(doc, "refresh", userAgent);
  }

  async logout(refreshToken: string): Promise<void> {
    this.assertConfigured();
    const current = await this.session
      .findOne({ token: refreshToken, revokedAt: { $eq: null } })
      .exec();
    if (current) {
      current.revokedAt = new Date();
      await current.save();
    }
  }

  /**
   * Verify a refresh token WITHOUT rotating it. Used by the UI's server
   * layer (Next server components / route handlers) to establish "am I
   * logged in?" and mint a fresh short-lived access token, without burning a
   * rotation every render. A revoked or expired token → 401.
   */
  async verifyRefresh(refreshToken: string): Promise<{
    user: PublicUser;
    accessToken: string;
    accessExpiresAt: string;
  }> {
    this.assertConfigured();
    const current = await this.session
      .findOne({ token: refreshToken, revokedAt: { $eq: null } })
      .exec();

    if (!current || current.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    const doc = await this.user.findById(current.user).exec();
    if (!doc) {
      throw new ForbiddenException("Account no longer exists");
    }
    this.assertActive(doc);

    const { token: accessToken, expiresAt: accessExpiresAt } =
      this.tokens.signAccessToken({ id: doc.id, role: doc.role, lang: doc.lang });

    return {
      user: {
        id: doc.id,
        email: doc.email ?? null,
        displayName: doc.displayName ?? null,
        role: doc.role,
        lang: doc.lang,
        timezone: doc.timezone ?? "Asia/Ho_Chi_Minh",
        status: doc.status,
        createdAt: doc.createdAt.toISOString(),
      },
      accessToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
    };
  }

  // ── internals ────────────────────────────────────────────────────────

  private get googleClient(): OAuth2Client | null {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    const clientSecret = this.config.get<string>("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return null;
    }
    return new OAuth2Client(clientId, clientSecret);
  }

  private async verifyGoogleIdToken(credential: string): Promise<LoginTicket> {
    const client = this.googleClient;
    if (!client) {
      throw new ServiceUnavailableException("Google sign-in is not configured");
    }
    const audience = this.config.get<string>("GOOGLE_CLIENT_ID");
    try {
      return await client.verifyIdToken({
        idToken: credential,
        audience,
      });
    } catch (error) {
      this.logger.warn(
        `Google ID token rejected: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException("Invalid Google credential");
    }
  }

  private async findByEmail(email: string) {
    return this.user.findOne({ email }).exec();
  }

  private normalizeEmail(raw: string): string {
    const email = raw.trim().toLowerCase();
    if (email.length === 0 || email.length > 320 || !email.includes("@")) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return email;
  }

  private assertActive(doc: UserDocument): void {
    if (doc.status !== USER_STATUSES[0]) {
      throw new ForbiddenException("Account is not active");
    }
  }

  private async createUserWithAccount(input: {
    email?: string;
    passwordHash: string | null;
    displayName?: string;
    provider: AuthProvider;
    providerAccountId: string;
  }): Promise<[UserDocument, AuthAccountDocument]> {
    const userDoc = await this.user
      .create({
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
      });

    const accountDoc = await this.account.create({
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      user: userDoc._id,
      manual: false,
    });

    userDoc.authAccounts = [accountDoc._id];
    await userDoc.save();

    return [userDoc, accountDoc];
  }

  private async mintSession(
    doc: UserDocument,
    _context: string,
    userAgent?: string,
  ): Promise<AuthTokensResponse> {
    const publicUser: PublicUser = {
      id: doc.id,
      email: doc.email ?? null,
      displayName: doc.displayName ?? null,
      role: doc.role,
      lang: doc.lang,
      timezone: doc.timezone ?? "Asia/Ho_Chi_Minh",
      status: doc.status,
      createdAt: doc.createdAt.toISOString(),
    };

    const { token: accessToken, expiresAt: accessExpiresAt } =
      this.tokens.signAccessToken({
        id: doc.id,
        role: doc.role,
        lang: doc.lang,
      });

    const refreshExpiresAt = this.newRefreshExpiresAt();
    const refreshRecord = await this.session.create({
      user: doc._id,
      token: this.randomToken(),
      expiresAt: refreshExpiresAt,
      userAgent,
    });

    return {
      user: publicUser,
      accessToken,
      refreshToken: refreshRecord.token,
      tokenType: "Bearer",
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }

  private randomToken(): string {
    // Opaque 128-bit refresh token; Node's crypto random is a CSPRNG.
    return randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
  }

  private newRefreshExpiresAt(): Date {
    const ms = parseDurationMs(
      this.config.get<string>("JWT_REFRESH_EXPIRES_IN"),
      7 * 24 * 3_600_000,
    );
    return new Date(Date.now() + ms);
  }
}
