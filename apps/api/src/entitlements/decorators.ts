import { SetMetadata } from "@nestjs/common";

/**
 * Opt-in entitlements metadata (P5-QUOTA-04). The global guards only act on
 * routes that declare one of these — everything else passes through, so
 * existing features keep working before a `FeatureConfig` row exists.
 *
 * - `@RequireEntitlement("kaiwa")` → 403 when the feature is off or the
 *   caller's plan has no access row. Checked BEFORE the handler runs.
 * - `@Quota("kaiwa", { amount: 1 })` → books capacity before the handler and
 *   settles / releases it on the outcome (P5-QUOTA-03/06), so a crashed or
 *   cancelled job never leaks quota.
 */

export const REQUIRED_FEATURE = "entitlements:feature";
export const QUOTA_USAGE = "entitlements:quota";

export interface QuotaUse {
  featureKey: string;
  amount?: number;
}

/** The handler needs the learner's access to this feature (403 when off / no plan row). */
export const RequireEntitlement = (featureKey: string) =>
  SetMetadata(REQUIRED_FEATURE, featureKey);

/** Meter the handler's work against the caller's period quota (429 when BLOCK-exhausted). */
export const Quota = (featureKey: string, amount = 1) =>
  SetMetadata(
    QUOTA_USAGE,
    { featureKey, amount },
  );

/** Reservation attached to the request by `QuotaGuard`; settled/released by `QuotaInterceptor`. */
export interface QuotaBooking {
  reservationId: string;
  featureKey: string;
}
