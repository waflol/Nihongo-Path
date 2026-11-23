import {
  CanActivate,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Observable } from "rxjs";
import { catchError, from, mergeMap, switchMap, throwError } from "rxjs";
import type { AuthUser } from "../auth/auth.types.js";
import {
  REQUIRED_FEATURE,
  QuotaBooking,
  QUOTA_USAGE,
  type QuotaUse,
} from "./decorators.js";
import { QuotaService } from "./quota.service.js";

interface WithUser {
  user?: AuthUser;
  [key: string]: unknown;
}

function caller(ctx: ExecutionContext): AuthUser {
  const req = ctx.switchToHttp().getRequest<WithUser>();
  return (req.user ?? {}) as AuthUser;
}

function isOperator(user: AuthUser): boolean {
  return user.role === "ADMIN" || user.role === "SUPER_ADMIN";
}

/**
 * Opt-in entitlements guards + interceptor (P5-QUOTA-04/06). They run in the
 * fixed global order (architecture §4.3) *after* `RolesGuard`:
 *
 * - `EntitlementGuard` enforces `@RequireEntitlement(key)`: 403 when the
 *   feature is off or the caller's plan has no access row.
 * - `QuotaGuard` enforces `@Quota(key, amount)`: books capacity, stores the
 *   booking on the request, and 429s when a BLOCK-policy limit is exhausted.
 * - `QuotaInterceptor` (global `APP_INTERCEPTOR`) closes the booking: on a
 *   success it settles, on any thrown error it releases — the "reserve →
 *   settle → release" contract from spec §6.2. Requests without a booking
 *   (no `@Quota`) pass through untouched.
 *
 * Operators are exempted so admins are never metered. A missing `FeatureConfig`
 * row means the feature is ungated: the guards pass and no accounting happens,
 * which is what lets new features ship ahead of their config row.
 */
@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quota: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(REQUIRED_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;
    const user = caller(context);
    if (!user.sub || isOperator(user)) return true;
    await this.quota.checkAccess(user.sub, feature);
    return true;
  }
}

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quota: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const use = this.reflector.getAllAndOverride<QuotaUse>(QUOTA_USAGE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!use) return true;
    const req = context.switchToHttp().getRequest<WithUser>();
    const user = caller(context);
    if (!user.sub || isOperator(user)) return true;
    const res = await this.quota.reserve(user.sub, use.featureKey, use.amount ?? 1);
    if (res.gated && res.reservationId) {
      (req as { quotaBooking?: QuotaBooking }).quotaBooking = {
        reservationId: res.reservationId,
        featureKey: use.featureKey,
      };
    }
    return true;
  }
}

/**
 * Closes a `QuotaGuard` booking on the handler's outcome (P5-QUOTA-03).
 * Settlement / release is awaited **before the response completes** so the
 * ledger is consistent the moment the caller sees the result — the
 * "quyết toán khi thành công; giải phóng khi thất bại/hủy" contract (spec
 * §6.2). A failure of the bookkeeping itself is swallowed, never masking the
 * handler's own success or error.
 */
@Injectable()
export class QuotaInterceptor implements NestInterceptor {
  constructor(private readonly quota: QuotaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const booking = (
      context.switchToHttp().getRequest<{ quotaBooking?: QuotaBooking }>()
    ).quotaBooking;
    if (!booking) return next.handle();
    return next.handle().pipe(
      mergeMap(async (result) => {
        // Awaited so the ledger is consistent the instant the caller sees the
        // result (spec §6.2). A bookkeeping failure must not mask it.
        await this.quota.settle(booking.reservationId).catch(() => undefined);
        return result;
      }),
      catchError((error) =>
        // `from` + `switchMap` so the release is awaited before the error is
        // re-thrown; a `throwError` from an async projection would be emitted
        // as a value, not propagated.
        from(this.quota.release(booking.reservationId, "job-failed").catch(() => undefined)).pipe(
          switchMap(() => throwError(() => error)),
        ),
      ),
    );
  }
}
