import dotenv from "dotenv";

/**
 * Loads `.env` files before NestJS modules are evaluated (side-effect module).
 *
 * `buildDatabaseModule()` (called from `AppModule`) reads
 * `process.env.MONGODB_URL` at module-evaluation time to decide whether to
 * register MongoDB. ESM evaluates statically-imported modules before a
 * module body, so `app.module.ts` imports THIS file first to make the
 * variable available that early.
 *
 * `dotenv` never overrides variables already present in the real environment
 * (or set by an earlier `config()` call), so:
 *   - the host environment always wins over files,
 *   - `.env` wins over `.env.local` (loaded first).
 * Missing files are silently skipped — local dev without any env file still
 * works (MONGODB_URL stays undefined → graceful degradation).
 */
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
