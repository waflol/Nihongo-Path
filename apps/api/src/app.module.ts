import "./bootstrap/env.js";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { validateEnv } from "./config/env.validation.js";
import { buildDatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { buildAuthModule } from "./auth/auth.module.js";
import { buildUsersModule } from "./users/users.module.js";
import { buildContentModule } from "./content/content.module.js";

/**
 * NOTE: the very first import (`./bootstrap/env.js`) loads `.env` /
 * `.env.local` into `process.env` before anything else in this module
 * evaluates. That matters because `buildDatabaseModule()`,
 * `buildAuthModule()`, `buildUsersModule()` and `buildContentModule()` below
 * each read `process.env.MONGODB_URL` at module-evaluation time (ESM evaluates
 * statically-imported modules before the importing module's body).
 */
@Module({
  imports: [
    // `.env` is already loaded by `./bootstrap/env.js` above, so the
    // ConfigModule only needs to VALIDATE `process.env` (fail fast on a
    // missing/malformed value) — it does not re-read env files.
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    buildDatabaseModule(),
    HealthModule,
    // Phase P2 (Identity & Content). Each builder degrades to an empty
    // module when `MONGODB_URL` is unset, so the app still boots without a
    // database; the sign-in / content / profile routes are simply absent.
    // `buildAuthModule()` registers the global `AuthGuard` + `RolesGuard`
    // (architecture §4.3) and the identity models, shared by the others.
    buildAuthModule(),
    buildUsersModule(),
    buildContentModule(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
