import { describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { ForbiddenException, HttpException, NotFoundException } from "@nestjs/common";
import { QuotaService } from "./quota.service.js";

const USER_ID = new Types.ObjectId().toString();

/**
 * In-memory models mirroring the exact Mongoose chain `QuotaService` uses
 * (`.lean()`, `.exec()`, `.create`, `.aggregate`), so the reserve→settle→
 * release lifecycle and the BLOCK-vs-ALLOW policies are testable without a
 * database (checklist: "gọi service" + "giả lập thời gian"). The reservation
 * store is a plain Map; `aggregate` is rebuilt from it using the same
 * (user, featureKey, period, counted-state) predicate the service $matches.
 */
function build() {
  const users = new Map<string, { plan: string; status: string }>([
    [USER_ID, { plan: "FREE", status: "ACTIVE" }],
  ]);
  const configs = new Map<string, Record<string, unknown>>([]);
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
      lean: async () => {
        const doc = configs.get(featureKey);
        return doc ? ({ ...doc } as never) : null;
      },
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
        // Return the live stored reference (like Mongoose's hydrated doc): the
        // service mutates `doc.state` / `doc.reason` then `save()`s, so the
        // mutation must land in the same object the Map holds.
        const doc = reservations.get(id);
        if (!doc) return null;
        (doc as { save?: () => Promise<void> }).save = async () => {};
        return doc;
      },
    }),
    deleteOne: async ({ _id }: { _id: unknown }) => ({
      deletedCount: reservations.delete(String(_id)) ? 1 : 0,
    }),
    // Rebuild the $match + $group the service runs, over the in-memory store.
    aggregate: (stages: { $match?: Record<string, unknown> }[]) => ({
      exec: async () => {
        const m = stages.find((s) => s.$match)?.$match as
          | { featureKey?: string; period?: string }
          | undefined;
        return [
          {
            _id: null,
            total: m?.featureKey && m.period ? sumCounted(m.featureKey, m.period) : 0,
          },
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

  return { svc, configs, reservations, usage, users };
}

function kaiwaConfig(over: "BLOCK" | "ALLOW", limit = 2) {
  return {
    featureKey: "kaiwa",
    enabled: true,
    limits: [
      { plan: "FREE", limit },
      { plan: "PRO", limit: 50 },
      { plan: "VIP", limit: null },
    ],
    period: "MONTH",
    tz: "Asia/Ho_Chi_Minh",
    overLimit: over,
  };
}

describe("QuotaService (P5-QUOTA-03/05)", () => {
  it("checkAccess: ungated when there is no config row", async () => {
    const { svc } = build();
    await expect(svc.checkAccess(USER_ID, "nope")).resolves.toBeUndefined();
  });

  it("checkAccess: 403 when the feature is disabled", async () => {
    const { svc, configs } = build();
    configs.set("kaiwa", { ...kaiwaConfig("BLOCK"), enabled: false });
    await expect(svc.checkAccess(USER_ID, "kaiwa")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("checkAccess: 403 when the caller's plan has no access row", async () => {
    const { svc, configs } = build();
    configs.set("kaiwa", {
      ...kaiwaConfig("BLOCK"),
      limits: [{ plan: "PRO", limit: 10 }], // FREE row removed
    });
    await expect(svc.checkAccess(USER_ID, "kaiwa")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("checkAccess: unknown user → 404", async () => {
    const { svc, configs } = build();
    configs.set("kaiwa", kaiwaConfig("BLOCK"));
    await expect(svc.checkAccess(new Types.ObjectId().toString(), "kaiwa")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("reserve: BLOCK policy rolls back the over-reservation and 429s", async () => {
    const { svc, configs, reservations } = build();
    configs.set("kaiwa", kaiwaConfig("BLOCK", 2));
    await svc.reserve(USER_ID, "kaiwa");
    await svc.reserve(USER_ID, "kaiwa");
    // Third attempt exceeds limit=2 → rolled back (only 2 rows survive).
    await expect(svc.reserve(USER_ID, "kaiwa")).rejects.toBeInstanceOf(HttpException);
    const surviving = [...reservations.values()].filter((r) => r.state === "RESERVED");
    expect(surviving).toHaveLength(2);
    expect(reservations.size).toBe(2);
  });

  it("reserve: ALLOW policy books the over-limit slot and flags it", async () => {
    const { svc, configs } = build();
    configs.set("kaiwa", kaiwaConfig("ALLOW", 1));
    await svc.reserve(USER_ID, "kaiwa");
    const third = await svc.reserve(USER_ID, "kaiwa");
    expect(third.overLimit).toBe(true);
    expect(third.reservationId).toBeTruthy();
  });

  it("reserve: unlimited plan row (limit=null) never blocks", async () => {
    const { svc, configs, users } = build();
    configs.set("kaiwa", kaiwaConfig("BLOCK"));
    users.set(USER_ID, { plan: "VIP", status: "ACTIVE" });
    for (let i = 0; i < 5; i++) {
      const r = await svc.reserve(USER_ID, "kaiwa");
      expect(r.limit).toBe(null);
      expect(r.reservationId).toBeTruthy();
    }
  });

  it("reserve: a 0-limit plan row is entitled but caps at zero", async () => {
    const { svc, configs } = build();
    configs.set("kaiwa", { ...kaiwaConfig("BLOCK"), limits: [{ plan: "FREE", limit: 0 }] });
    await expect(svc.reserve(USER_ID, "kaiwa")).rejects.toBeInstanceOf(HttpException);
  });

  it("settle: settles a reserved slot and mirrors a usage record (idempotent)", async () => {
    const { svc, configs, usage, reservations } = build();
    configs.set("kaiwa", kaiwaConfig("BLOCK"));
    const r = await svc.reserve(USER_ID, "kaiwa");
    const a = await svc.settle(r.reservationId!);
    const b = await svc.settle(r.reservationId!);
    expect(a.done).toBe(true);
    expect(b.done).toBe(false);
    expect(usage).toHaveLength(1);
    expect(reservations.get(r.reservationId!)?.state).toBe("SETTLED");
  });

  it("release: frees a slot on job failure (idempotent, no usage record)", async () => {
    const { svc, configs, usage, reservations } = build();
    configs.set("kaiwa", kaiwaConfig("BLOCK"));
    const r = await svc.reserve(USER_ID, "kaiwa");
    await svc.release(r.reservationId!, "job-failed");
    await svc.release(r.reservationId!, "job-cancelled");
    expect(usage).toHaveLength(0);
    expect(reservations.get(r.reservationId!)?.state).toBe("RELEASED");
    expect(reservations.get(r.reservationId!)?.reason).toBe("job-failed");
  });

  it("periodKey: DAY vs MONTH in the config's IANA zone (simulated instants)", () => {
    const { svc } = build();
    // 2026-01-31T17:00:00Z is 2026-02-01 00:00 in UTC+7 (Ho Chi Minh).
    const hcmcStartOfDay = Date.parse("2026-01-31T17:00:00Z");
    expect(svc.periodKey("DAY", "Asia/Ho_Chi_Minh", new Date(hcmcStartOfDay + 60_000))).toBe(
      "2026-02-01",
    );
    expect(svc.periodKey("MONTH", "Asia/Ho_Chi_Minh", new Date(hcmcStartOfDay + 60_000))).toBe(
      "2026-02",
    );
    // The same UTC instant is still 2026-01-31 in America/New_York (UTC-5).
    expect(svc.periodKey("DAY", "America/New_York", new Date(hcmcStartOfDay + 60_000))).toBe(
      "2026-01-31",
    );
  });

  it("remaining: reports used vs cap for the caller's plan", async () => {
    const { svc, configs } = build();
    configs.set("kaiwa", kaiwaConfig("BLOCK", 3));
    await svc.reserve(USER_ID, "kaiwa");
    const left = await svc.remaining(USER_ID, "kaiwa");
    expect(left).toMatchObject({ gated: true, used: 1, limit: 3, remaining: 2 });
  });

  it("remaining: ungated feature reports gated=false", async () => {
    const { svc } = build();
    await expect(svc.remaining(USER_ID, "unknown")).resolves.toMatchObject({
      gated: false,
      limit: null,
    });
  });
});
