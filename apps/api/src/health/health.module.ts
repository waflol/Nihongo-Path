import { Module } from "@nestjs/common";
import { buildDatabaseModule } from "../database/database.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

/**
 * Health endpoints module.
 *
 * `buildDatabaseModule()` is imported so that the mongoose connection token
 * exists in the injector when `HealthService` is instantiated:
 * - `MONGODB_URL` set  → `MongooseModule` provides a real connection.
 * - `MONGODB_URL` absent → no provider; the service's `@Optional()`
 *   injection yields `null` and readiness reports `not-configured`.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
  imports: [buildDatabaseModule()],
})
export class HealthModule {}
