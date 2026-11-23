import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { firstValueFrom, from, throwError } from "rxjs";
import { ForbiddenException, HttpException } from "@nestjs/common";
import { QuotaService } from "./quota.service.js";
import { EntitlementGuard, QuotaGuard, QuotaInterceptor } from "./guards.js";
import { REQUIRED_FEATURE, QUOTA_USAGE, QuotaBooking } from "./decorators.js";

const USER_ID = new Types.ObjectId().toString();

/** Compact in-memory models (same shape as `quota.service.spec.ts`). */
function buildService() {
  const configs = new Map<string, Record<string, unknown>>([
    [
      "kaiwa",
      {
        featureKey: "kaiwa",
        enabled: true,
        limits: [
          { plan: "FREE", limit: 1 },
          { plan: "PRO", limit: 50 },
        ],
        period: "MONTH",
        tz: "Asia/Ho_Chi_Minh",
        overLimit: "BLOCK",
      },
    ],
  ]);
  const users = new Map<string, { plan: string; status: string }>([
    [USER_ID, { plan: "FREE", status: "ACTIVE" }],
  ]);
  const reservations = new Map<string, Record<string, unknown>>();
  const usage: Record<string, unknown>[] = [];

  const sumCounted = (featureKey: string, period: string): number => {
    let total = 0;
    for (const r of reservations.values()) {
      if (String(r.user) !== USER_ID) continue;
      if (r.featureKey !== featureKey || r.period !== period) continue;
      if (r.state !== "RESERVED" && r.state !== "SETTLED") continue;
      total += (r.amount as number) ?? 1;
    }
    return total;
  };

  const configModel = {
    findOne: ({ featureKey }: { featureKey: string }) => ({
      lean: async () => configs.get(featureKey) ?? null,
    }),
  };
  const userModel = {
    findById: (id: string) => ({
      lean: async () => {
        const u = users.get(id);
        return u ? ({ _id: new Types.ObjectId(id), ...u } as never) : null;
      },
    }),
  };
  const reservationModel = {
    create: (d: Record<string, unknown>) => {
      const _id = new Types.ObjectId();
      const doc = { _id, state: "RESERVED", reason: undefined, ...d };
      reservations.set(String(_id), doc);
      return Promise.resolve(doc);
    },
    findById: (id: string) => ({
      exec: async () => {
        const doc = reservations.get(id);
        if (!doc) return null;
        (doc as { save?: () => Promise<void> }).save = async () => {};
        return doc;
      },
    }),
    deleteOne: async ({ _id }: { _id: unknown }) => ({
      deletedCount: reservations.delete(String(_id)) ? 1 : 0,
    }),
    aggregate: (stages: { $match?: Record<string, unknown> }[]) => ({
      exec: async () => {
        const m = stages.find((s) => s.$match)?.$match as
          | { featureKey?: string; period?: string }
          | undefined;
        return [
          { _id: null, total: m?.featureKey && m.period ? sumCounted(m.featureKey, m.period) : 0 },
        ];
      },
    }),
  };
  const usageModel = {
    create: (d: Record<string, unknown>) => {
      usage.push(d);
      return Promise.resolve(d);
    },
  };

  const svc = new QuotaService(
    configModel as never,
    reservationModel as never,
    usageModel as never,
    userModel as never,
  );
  return { svc, reservations, usage, configs, users };
}

/** Fake reflector: returns per-key metadata like Nest does. */
const fakeReflector = (meta: Record<string, unknown>) =>
  ({
    getAllAndOverride: (key: string) => meta[key],
  }) as never;

/** Fake execution context wrapping a mutable request object. */
const fakeContext = (req: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}) as never,
    getClass: () => (class {}) as never,
  }) as never;

describe("EntitlementGuard (P5-QUOTA-04)", () => {
  it("passes through when the route has no @RequireEntitlement", async () => {
    const { svc } = buildService();
    const guard = new EntitlementGuard(fakeReflector({}), svc);
    const ctx = fakeContext({ user: { sub: USER_ID, role: "USER", lang: "vi" } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("exempts operators even when the feature is disabled", async () => {
    const { svc, configs } = buildService();
    configs.set("kaiwa", { ...configs.get("kaiwa")!, enabled: false });
    const guard = new EntitlementGuard(fakeReflector({ [REQUIRED_FEATURE]: "kaiwa" }), svc);
    const ctx = fakeContext({ user: { sub: "admin", role: "ADMIN", lang: "vi" } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it("403s a learner whose plan has no access row", async () => {
    const { svc, users } = buildService();
    users.set(USER_ID, { plan: "VIP", status: "ACTIVE" }); // VIP row absent from kaiwa
    const guard = new EntitlementGuard(fakeReflector({ [REQUIRED_FEATURE]: "kaiwa" }), svc);
    const ctx = fakeContext({ user: { sub: USER_ID, role: "USER", lang: "vi" } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("passes a learner whose plan row exists", async () => {
    const { svc } = buildService();
    const guard = new EntitlementGuard(fakeReflector({ [REQUIRED_FEATURE]: "kaiwa" }), svc);
    const ctx = fakeContext({ user: { sub: USER_ID, role: "USER", lang: "vi" } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});

describe("QuotaGuard (P5-QUOTA-03/04)", () => {
  it("books capacity on the request for a metered learner call", async () => {
    const { svc, reservations } = buildService();
    const guard = new QuotaGuard(fakeReflector({ [QUOTA_USAGE]: { featureKey: "kaiwa", amount: 1 } }), svc);
    const req: Record<string, unknown> = { user: { sub: USER_ID, role: "USER", lang: "vi" } };
    await guard.canActivate(fakeContext(req));
    expect(reservations.size).toBe(1);
    const booking = req.quotaBooking as QuotaBooking;
    expect(booking.featureKey).toBe("kaiwa");
    expect(reservations.has(booking.reservationId)).toBe(true);
  });

  it("does not book for operators", async () => {
    const { svc, reservations } = buildService();
    const guard = new QuotaGuard(fakeReflector({ [QUOTA_USAGE]: { featureKey: "kaiwa" } }), svc);
    const req: Record<string, unknown> = { user: { sub: "admin", role: "ADMIN", lang: "vi" } };
    await guard.canActivate(fakeContext(req));
    expect(reservations.size).toBe(0);
    expect(req.quotaBooking).toBeUndefined();
  });

  it("does not book when the route is not metered", async () => {
    const { svc, reservations } = buildService();
    const guard = new QuotaGuard(fakeReflector({}), svc);
    await guard.canActivate(fakeContext({ user: { sub: USER_ID, role: "USER", lang: "vi" } }));
    expect(reservations.size).toBe(0);
  });

  it("429s and rolls back when the caller hits a BLOCK limit", async () => {
    const { svc, reservations } = buildService(); // FREE limit = 1
    const guard = new QuotaGuard(fakeReflector({ [QUOTA_USAGE]: { featureKey: "kaiwa" } }), svc);
    const req: Record<string, unknown> = { user: { sub: USER_ID, role: "USER", lang: "vi" } };
    await guard.canActivate(fakeContext(req)); // books the 1 slot
    const second = fakeContext({ ...req }); // fresh request, same user
    await expect(guard.canActivate(second)).rejects.toBeInstanceOf(HttpException);
    // Only the first booking survives (the over-reservation was rolled back).
    expect(reservations.size).toBe(1);
  });
});

describe("QuotaInterceptor (P5-QUOTA-03: settle on success, release on error)", () => {
  it("settles the booking when the handler succeeds", async () => {
    const { svc, reservations, usage } = buildService();
    const guard = new QuotaGuard(fakeReflector({ [QUOTA_USAGE]: { featureKey: "kaiwa" } }), svc);
    const req: Record<string, unknown> = { user: { sub: USER_ID, role: "USER", lang: "vi" } };
    await guard.canActivate(fakeContext(req));
    const booking = req.quotaBooking as QuotaBooking;

    const interceptor = new QuotaInterceptor(svc);
    const ctx = fakeContext(req);
    const out = interceptor.intercept(ctx, { handle: () => from([{ ok: true }]) } as never);
    await firstValueFrom(out);

    expect(reservations.get(booking.reservationId)?.state).toBe("SETTLED");
    expect(usage).toHaveLength(1);
  });

  it("releases the booking when the handler throws", async () => {
    const { svc, reservations, usage } = buildService();
    const guard = new QuotaGuard(fakeReflector({ [QUOTA_USAGE]: { featureKey: "kaiwa" } }), svc);
    const req: Record<string, unknown> = { user: { sub: USER_ID, role: "USER", lang: "vi" } };
    await guard.canActivate(fakeContext(req));
    const booking = req.quotaBooking as QuotaBooking;

    const interceptor = new QuotaInterceptor(svc);
    const ctx = fakeContext(req);
    const out = interceptor.intercept(ctx, {
      handle: () => throwError(() => new Error("job failed")),
    } as never);
    await expect(firstValueFrom(out)).rejects.toThrow("job failed");

    expect(reservations.get(booking.reservationId)?.state).toBe("RELEASED");
    expect(usage).toHaveLength(0);
  });

  it("is a no-op for requests without a booking", async () => {
    const { svc, usage } = buildService();
    const interceptor = new QuotaInterceptor(svc);
    const ctx = fakeContext({ user: { sub: USER_ID, role: "USER", lang: "vi" } });
    const out = interceptor.intercept(ctx, { handle: () => from([1, 2]) } as never);
    await expect(firstValueFrom(out)).resolves.toBe(1);
    expect(usage).toHaveLength(0);
  });
});
