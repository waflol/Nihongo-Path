import { Module, type DynamicModule } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { buildAuthModule } from "../auth/auth.module.js";
import { FeatureConfig, FeatureConfigSchema } from "./schemas/feature-config.schema.js";
import {
  QuotaReservation,
  QuotaReservationSchema,
  UsageRecord,
  UsageRecordSchema,
} from "./schemas/quota-record.schema.js";
import { QuotaService } from "./quota.service.js";
import { EntitlementsService } from "./entitlements.service.js";
import {
  AdminEntitlementsController,
  EntitlementsController,
} from "./entitlements.controller.js";
import { EntitlementGuard, QuotaGuard, QuotaInterceptor } from "./guards.js";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

/**
 * Entitlements + quotas (P5-QUOTA-01/03, P5-ADMIN-04): a data-driven
 * `FeatureConfig` row per metered feature, a reservation ledger
 * (`quota_reservations` + `usage_records`) with reserve→settle→release, and
 * the admin config surface. Graceful-degrade contract like every other
 * feature module: no `MONGODB_URL` → empty module (the opt-in guards simply
 * have nothing to meter, so ungated features keep working).
 */
export function buildEntitlementsModule(): DynamicModule {
  if (!process.env.MONGODB_URL?.trim()) {
    return { module: EntitlementsModule };
  }
  return {
    module: EntitlementsModule,
    imports: [
      // Identity models (`User`) are re-exported by `buildAuthModule()`.
      buildAuthModule(),
      MongooseModule.forFeature([
        { name: FeatureConfig.name, schema: FeatureConfigSchema },
        { name: QuotaReservation.name, schema: QuotaReservationSchema },
        { name: UsageRecord.name, schema: UsageRecordSchema },
      ]),
    ],
    controllers: [EntitlementsController, AdminEntitlementsController],
    providers: [
      QuotaService,
      EntitlementsService,
      // Global, in the fixed §4.3 order (after `RolesGuard` from AuthModule):
      // entitlement access first, then the metering reservation.
      { provide: APP_GUARD, useClass: EntitlementGuard },
      { provide: APP_GUARD, useClass: QuotaGuard },
      { provide: APP_INTERCEPTOR, useClass: QuotaInterceptor },
    ],
    // Re-export so other modules can `@Injectable`-consume the quota service.
    exports: [QuotaService],
  };
}

/** Empty placeholder returned when no `MONGODB_URL` is configured. */
@Module({})
export class EntitlementsModule {}
