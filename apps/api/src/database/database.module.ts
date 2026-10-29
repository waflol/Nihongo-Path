import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

/**
 * Placeholder module class used as the anchor for `buildDatabaseModule()`.
 */
@Module({})
export class DatabaseModule {}

/**
 * Builds the module that registers the MongoDB connection.
 *
 * The decision is made at module-evaluation time from `process.env.MONGODB_URL`
 * (populated by `src/bootstrap/env.js`, which `app.module.ts` imports first):
 *
 * - URL present → `MongooseModule.forRootAsync` with a short server selection
 *   timeout and no retries: if the database is unreachable the application
 *   fails to start with a clear error (fail-fast by design — a misconfigured
 *   deployment must not silently run without its database).
 * - URL absent → no Mongoose module is registered at all. `HealthService`
 *   injects the connection with `@Optional()`, so it receives `undefined`
 *   and readiness reports `not-configured`; the API keeps running (graceful
 *   degradation — the local development mode where no mongod exists).
 *
 * This also avoids a crash path verified with `mongoose@8`: creating a
 * connection with a missing/unreachable URL produces an unhandled rejection,
 * so in the "absent" case we never create a connection.
 */
export function buildDatabaseModule(): DynamicModule {
  const url = process.env.MONGODB_URL?.trim();

  if (!url) {
    return { module: DatabaseModule };
  }

  return {
    module: DatabaseModule,
    imports: [
      MongooseModule.forRootAsync({
        useFactory: () => ({
          uri: url,
          // Keep startup snappy and deterministic.
          serverSelectionTimeoutMS: 5_000,
          retryAttempts: 0,
          retryDelay: 0,
        }),
      }),
    ],
  };
}
