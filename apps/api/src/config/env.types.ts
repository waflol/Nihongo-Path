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
}
