import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  HttpStatus,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { User, type UserDocument } from "../users/schemas/user.schema.js";
import {
  FeatureConfig,
  FeatureConfigDocument,
  limitForPlan,
} from "./schemas/feature-config.schema.js";
import {
  QuotaReservation,
  QuotaReservationDocument,
  UsageRecord,
  UsageRecordDocument,
} from "./schemas/quota-record.schema.js";

/** States that count against the period's quota while a job may still be in flight. */
const COUNTED_STATES = ["RESERVED", "SETTLED"] as const;

/** Result of a `reserve` call — the guard/interceptor hand this to the handler. */
export interface ReserveResult {
  /** False when the feature has no config row, so no accounting applies. */
  gated: boolean;
  reservationId?: string;
  period?: string;
  /** `null` = unlimited for the caller's plan. */
  limit: number | null;
  /** Usage already booked this period, *before* this reservation. */
  used: number;
  /** True when this reservation lands the caller above a BLOCK/ALLOW limit (ALLOW only). */
  overLimit: boolean;
}

/**
 * Quota + entitlements service (P5-QUOTA-03/05). The accounting unit is a
 * **reservation**: a caller books capacity *before* running expensive work,
 * then settles on success or releases on failure, so a crashed or cancelled
 * job never silently leaks a learner's quota (spec §6.2 "đặt trước quota khi
 * tạo job; quyết toán khi thành công; giải phóng khi thất bại/hủy").
 *
 * Limits are fully data-driven (P5-QUOTA-01): a `FeatureConfig` row names a
 * `featureKey`, its per-plan caps, the reset period and the IANA zone that
 * anchors period boundaries. Editing that row changes behaviour live — no
 * deploy. A feature with **no** config row is ungated (the guard passes,
 * `reserve` is a no-op), so new features ship before their config exists.
 *
 * Race note: `reserve` creates the row then re-sums. Two truly simultaneous
 * callers at the same user+feature scale can both clear the check for one
 * window; on a single-node VPS that contention is negligible, and a BLOCK
 * policy still back-pedals the later over-reservation. (Spec §6.2 asks for
 * race tests — see `quota.service.spec.ts`.)
 */
@Injectable()
export class QuotaService {
  constructor(
    @InjectModel(FeatureConfig.name) private readonly configs: Model<FeatureConfigDocument>,
    @InjectModel(QuotaReservation.name) private readonly reservations: Model<QuotaReservationDocument>,
    @InjectModel(UsageRecord.name) private readonly usage: Model<UsageRecordDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  /** The current period key for a config + instant, e.g. `2026-05` / `2026-05-21`. */
  periodKey(
    period: FeatureConfig["period"],
    tz: string,
    now: Date = new Date(),
  ): string {
    const parts = this.wallParts(now.getTime(), tz);
    const y = parts.get("year")!;
    const m = String(parts.get("month")!).padStart(2, "0");
    if (period === "DAY") {
      const d = String(parts.get("day")!).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return `${y}-${m}`;
  }

  /**
   * Access check only — no booking. Throws `403` when the feature is off, or
   * the caller's plan has no access row. `EntitlementGuard` uses this so a
   * route can gate on "may this plan use this feature at all" without
   * consuming quota (quota is metered separately by `reserve`).
   */
  async checkAccess(userSub: string, featureKey: string): Promise<void> {
    const user = await this.users.findById(userSub, { plan: 1 }).lean();
    if (!user) throw new NotFoundException("User not found");
    const config = await this.configs.findOne({ featureKey }).lean();
    if (!config) return; // no config row → ungated
    if (config.enabled === false) {
      throw new ForbiddenException("Tính năng hiện đang tạm ngưng.");
    }
    if (limitForPlan(config, user.plan) === undefined) {
      throw new ForbiddenException("Gói hiện tại chưa có quyền dùng tính năng này.");
    }
  }

  /**
   * Book capacity before a learner runs a gated, metered action. Throws:
   * - `403` when the feature is off, or the caller's plan has no access row.
   * - `429` when the period limit is exhausted and the policy is `BLOCK`.
   * A plan row with `limit = 0` is "entitled but no usage" → first reserve
   * trips the limit.
   */
  async reserve(userSub: string, featureKey: string, amount = 1): Promise<ReserveResult> {
    const user = await this.users.findById(userSub, { plan: 1, status: 1 }).lean();
    if (!user) throw new NotFoundException("User not found");

    const config = await this.configs.findOne({ featureKey }).lean();
    if (!config) return { gated: false, limit: null, used: 0, overLimit: false };

    // Global kill-switch: the feature is off for every plan.
    if (config.enabled === false) {
      throw new ForbiddenException("Tính năng hiện đang tạm ngưng.");
    }

    const limit = limitForPlan(config, user.plan);
    // No row for this plan = the plan is not entitled to the feature.
    if (limit === undefined) {
      throw new ForbiddenException("Gói hiện tại chưa có quyền dùng tính năng này.");
    }

    const period = this.periodKey(config.period, config.tz);
    const before = await this.sumUsed(userSub, featureKey, period);

    // Create-then-revalidate: book, then measure. A concurrent over-reservation
    // becomes visible here and a BLOCK policy rolls it back (see class note).
    const doc = await this.reservations.create({
      user: new Types.ObjectId(userSub),
      featureKey,
      period,
      amount,
      state: "RESERVED",
    });

    const used = await this.sumUsed(userSub, featureKey, period);
    const isOver = limit !== null && used > limit;
    if (isOver && config.overLimit === "BLOCK") {
      await this.reservations.deleteOne({ _id: doc._id });
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: "Too Many Requests",
          message: `Đã dùng hết hạn mức ${config.period.toLowerCase()} cho tính năng này (${limit} lượt).`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      gated: true,
      reservationId: String(doc._id),
      period,
      limit,
      used: before,
      overLimit: isOver,
    };
  }

  /** Finalize a reservation on success. Idempotent: re-settling is a no-op. */
  async settle(reservationId: string): Promise<{ done: boolean }> {
    const doc = await this.reservations.findById(reservationId).exec();
    if (!doc || doc.state !== "RESERVED") return { done: false };
    doc.state = "SETTLED";
    doc.reason = "settled";
    await doc.save();
    await this.usage.create({
      user: doc.user,
      featureKey: doc.featureKey,
      period: doc.period,
      amount: doc.amount,
      reservation: doc._id,
    });
    return { done: true };
  }

  /** Free a reservation on failure / cancellation. Idempotent. */
  async release(reservationId: string, reason: QuotaReservation["reason"] = "job-failed"): Promise<{ done: boolean }> {
    const doc = await this.reservations.findById(reservationId).exec();
    if (!doc || doc.state !== "RESERVED") return { done: false };
    doc.state = "RELEASED";
    doc.reason = reason;
    await doc.save();
    return { done: true };
  }

  /** What the learner / admin see: booked-so-far vs. the period cap. */
  async remaining(userSub: string, featureKey: string, now: Date = new Date()) {
    const user = await this.users.findById(userSub, { plan: 1 }).lean();
    if (!user) throw new NotFoundException("User not found");
    const config = await this.configs.findOne({ featureKey }).lean();
    if (!config) return { gated: false, used: 0, limit: null, remaining: null };
    const limit = limitForPlan(config, user.plan) ?? null;
    const period = this.periodKey(config.period, config.tz, now);
    const used = limit !== null ? await this.sumUsed(userSub, featureKey, period) : 0;
    return {
      gated: true,
      period,
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
    };
  }

  /** Sum of `amount` across the counted states (RESERVED + SETTLED) for a slot. */
  private async sumUsed(userSub: string, featureKey: string, period: string): Promise<number> {
    const [agg] = await this.reservations
      .aggregate([
        {
          $match: {
            user: new Types.ObjectId(userSub),
            featureKey,
            period,
            state: { $in: [...COUNTED_STATES] },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .exec();
    return agg?.total ?? 0;
  }

  /** Wall-clock year/month/day of `epochMs` in `timeZone` (Intl parts, cached). */
  private wallParts(epochMs: number, timeZone: string): Map<PropertyKey, string> {
    const fmt = this.formatters.get(timeZone) ?? new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (!this.formatters.has(timeZone)) this.formatters.set(timeZone, fmt);
    const out = new Map<PropertyKey, string>();
    for (const { type, value } of fmt.formatToParts(epochMs)) {
      if (type !== "literal") out.set(type, value);
    }
    return out;
  }

  private readonly formatters = new Map<string, Intl.DateTimeFormat>();
}
