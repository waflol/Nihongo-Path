/**
 * Validated application environment (mirrors `apps/api/.env.example`).
 * All secrets must come from the environment/secret manager — never committed.
 */
export interface Env {
  /** Runtime environment name. */
  NODE_ENV: "development" | "test" | "production";
  /** Port the API listens on. */
  PORT: number;
  /** Allowed browser origin(s) for CORS, comma-separated. */
  WEB_ORIGIN?: string;
  /**
   * MongoDB connection string (`MONGODB_URL`). May be omitted in local dev
   * (graceful degradation: the API runs without a database and readiness
   * reports `not-configured`).
   */
  MONGODB_URL?: string;
  /** When true, a missing MONGODB_URL fails startup with a clear error. */
  MONGODB_URL_REQUIRED: boolean;

  // --- Auth (Phase P2). All optional: the API boots without them; the auth
  // endpoints simply refuse to run until the required subset is present. ---
  /** HMAC secret for access tokens (never logged). */
  JWT_ACCESS_SECRET?: string;
  /** Access-token TTL, e.g. `15m`. */
  JWT_ACCESS_EXPIRES_IN?: string;
  /** HMAC secret for refresh tokens (distinct from access, never logged). */
  JWT_REFRESH_SECRET?: string;
  /** Refresh-token TTL, e.g. `7d`. */
  JWT_REFRESH_EXPIRES_IN?: string;

  // --- Google sign-in (ID-token verification). Optional. ---
  /** Google OAuth client ID (`...apps.googleusercontent.com`). */
  GOOGLE_CLIENT_ID?: string;
  /** Google OAuth client secret (never logged). */
  GOOGLE_CLIENT_SECRET?: string;
  /** Callback/redirect URI the client was registered with. */
  GOOGLE_CALLBACK_URL?: string;

  // --- Admin bootstrap (P2-USER-02). Opt-in: both must be present. ---
  /** Admin account email to ensure at startup (role ADMIN, manual email credential). */
  ADMIN_EMAIL?: string;
  /** Initial password for `ADMIN_EMAIL` (used only on the create path, min 8 chars). */
  ADMIN_PASS?: string;

  /** Redis connection URL (optional): shared AI-result cache + task view in the admin. */
  REDIS_URL?: string;

  // --- AI example sentences (optional, free Google AI Studio tier). ---
  /** Secret that encrypts AI keys stored by the admin page (default: JWT_ACCESS_SECRET). */
  AI_KEY_SECRET?: string;
  /** Gemini API key; unset = no AI (examples then use Tatoeba only). */
  GEMINI_API_KEY?: string;
  /** Model name (default `gemini-3.8-flash`). */
  GEMINI_MODEL?: string;
  /** Max requests per minute (default 10 — keep at or under the free quota). */
  GEMINI_RPM?: string;
}
