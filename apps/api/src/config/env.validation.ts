import type { Env } from "./env.types.js";

const NODE_ENVS = ["development", "test", "production"] as const;
const DEFAULT_PORT = 3000;

/** Coerces a raw env value to a trimmed string, or `undefined` when empty. */
function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  const raw = toOptionalString(value);
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function isValidMongoUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "mongodb:" || protocol === "mongodb+srv:";
  } catch {
    return false;
  }
}

/**
 * Validates raw environment config into a typed `Env` object (passed to
 * `ConfigModule.forRoot({ validate })`). Throws with an actionable message
 * when a value is missing or malformed — failing fast at startup.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const nodeEnvRaw = toOptionalString(config.NODE_ENV) ?? "development";
  if (!(NODE_ENVS as readonly string[]).includes(nodeEnvRaw)) {
    throw new Error(
      `NODE_ENV must be one of ${NODE_ENVS.join(", ")} — got "${nodeEnvRaw}".`,
    );
  }

  const portRaw = toOptionalString(config.PORT) ?? String(DEFAULT_PORT);
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535 — got "${portRaw}".`,
    );
  }

  const mongodbUrl = toOptionalString(config.MONGODB_URL);
  if (mongodbUrl !== undefined && !isValidMongoUrl(mongodbUrl)) {
    throw new Error(
      'MONGODB_URL must be a valid "mongodb://" or "mongodb+srv://" connection string.',
    );
  }

  const mongodbUrlRequired = parseBool(config.MONGODB_URL_REQUIRED, false);
  if (mongodbUrlRequired && mongodbUrl === undefined) {
    throw new Error(
      "MONGODB_URL is required (MONGODB_URL_REQUIRED=true) but was not provided. " +
        "Set MONGODB_URL in the environment or set MONGODB_URL_REQUIRED=false.",
    );
  }

  return {
    NODE_ENV: nodeEnvRaw as Env["NODE_ENV"],
    PORT: port,
    WEB_ORIGIN: toOptionalString(config.WEB_ORIGIN),
    MONGODB_URL: mongodbUrl,
    MONGODB_URL_REQUIRED: mongodbUrlRequired,
    // Auth (P2) — optional; the auth module refuses to serve when the
    // required subset is missing, so no fail-fast here.
    JWT_ACCESS_SECRET: toOptionalString(config.JWT_ACCESS_SECRET),
    JWT_ACCESS_EXPIRES_IN: toOptionalString(config.JWT_ACCESS_EXPIRES_IN),
    JWT_REFRESH_SECRET: toOptionalString(config.JWT_REFRESH_SECRET),
    JWT_REFRESH_EXPIRES_IN: toOptionalString(config.JWT_REFRESH_EXPIRES_IN),
    GOOGLE_CLIENT_ID: toOptionalString(config.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: toOptionalString(config.GOOGLE_CLIENT_SECRET),
    GOOGLE_CALLBACK_URL: toOptionalString(config.GOOGLE_CALLBACK_URL),
    // Admin bootstrap (P2-USER-02): opt-in — both must be set for the
    // AdminBootstrapService to act; either alone is a no-op.
    ADMIN_EMAIL: toOptionalString(config.ADMIN_EMAIL),
    ADMIN_PASS: toOptionalString(config.ADMIN_PASS),
    // AI example sentences (optional).
    AI_KEY_SECRET: toOptionalString(config.AI_KEY_SECRET),
    GEMINI_API_KEY: toOptionalString(config.GEMINI_API_KEY),
    GEMINI_MODEL: toOptionalString(config.GEMINI_MODEL),
    GEMINI_RPM: toOptionalString(config.GEMINI_RPM),
  };
}
