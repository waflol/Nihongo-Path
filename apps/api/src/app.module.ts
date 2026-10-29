import "./bootstrap/env.js";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { validateEnv } from "./config/env.validation.js";
import { buildDatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";

/**
 * NOTE: the very first import (`./bootstrap/env.js`) loads `.env` /
 * `.env.local` into `process.env` before anything else in this module
 * evaluates. That matters because `buildDatabaseModule()` below reads
 * `process.env.MONGODB_URI` at module-evaluation time (ESM evaluates
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
