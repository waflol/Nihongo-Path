import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import type { AuthUser } from "../auth/auth.types.js";
import type { Plan } from "./schemas/feature-config.schema.js";
import {
  FeatureConfig,
  FeatureConfigDocument,
} from "./schemas/feature-config.schema.js";
import {
  PeriodUsage,
  QuotaReservation,
  QuotaReservationDocument,
  UsageRecord,
  UsageRecordDocument,
} from "./schemas/quota-record.schema.js";
import { User, type UserDocument } from "../users/schemas/user.schema.js";

/** What admins may read / write on a feature config row. */
export interface FeatureConfigInput {
  enabled?: boolean;
  limits?: { plan: Plan; limit: number | null }[];
  period?: "DAY" | "MONTH";
  tz?: string;
  overLimit?: "BLOCK" | "ALLOW";
}

/**
 * Admin entitlements surface (P5-ADMIN-04, P5-QUOTA-01): edit feature
 * config and per-user plans. Editing a `FeatureConfig` document takes effect
 * live — limits are read on every check, so no deploy (checklist criterion).
 * All mutations here are the admin actions P5-ADMIN-03 audits (before/after
 * snapshots via `attachAuditNote` in the controller).
 */
@Injectable()
export class EntitlementsService {
  constructor(
    @InjectModel(FeatureConfig.name) private readonly configs: Model<FeatureConfigDocument>,
    @InjectModel(QuotaReservation.name) private readonly reservations: Model<QuotaReservationDocument>,
    @InjectModel(UsageRecord.name) private readonly usage: Model<UsageRecordDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
  ) {}

  async listFeatures(): Promise<FeatureConfig[]> {
    return this.configs.find().sort({ featureKey: 1 }).lean();
  }

  /** One config row (for before/after audit snapshots), or `null`. */
  async readFeature(featureKey: string): Promise<Record<string, unknown> | null> {
    const doc = await this.configs.findOne({ featureKey }).lean();
    if (!doc) return null;
    const d = doc as unknown as Record<string, unknown>;
    return {
      enabled: d.enabled,
      limits: d.limits,
      period: d.period,
      tz: d.tz,
      overLimit: d.overLimit,
    };
  }

  /** Create-or-update a feature row (upsert on the unique `featureKey`). */
  async upsertFeature(
    caller: AuthUser,
    featureKey: string,
    input: FeatureConfigInput,
  ): Promise<Record<string, unknown>> {
    const existing = await this.configs.findOne({ featureKey }).exec();
    const fields = {
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.limits !== undefined
        ? { limits: input.limits.map((l) => ({ plan: l.plan, limit: l.limit })) }
        : {}),
      ...(input.period !== undefined ? { period: input.period } : {}),
      ...(input.tz !== undefined ? { tz: input.tz } : {}),
      ...(input.overLimit !== undefined ? { overLimit: input.overLimit } : {}),
    };
    let doc;
    if (existing) {
      doc = await this.configs
        .findByIdAndUpdate(existing._id, { $set: fields }, { new: true })
        .exec();
    } else {
      doc = await this.configs.create({
        featureKey,
        enabled: input.enabled ?? true,
        limits: input.limits ?? [],
        period: input.period ?? "MONTH",
        tz: input.tz ?? "Asia/Ho_Chi_Minh",
        overLimit: input.overLimit ?? "BLOCK",
      });
    }
    return this.flatten(doc);
  }

  private flatten(doc: unknown): Record<string, unknown> {
    const d = doc as unknown as Record<string, unknown>;
    return {
      featureKey: d.featureKey,
      enabled: d.enabled,
      limits: d.limits,
      period: d.period,
      tz: d.tz,
      overLimit: d.overLimit,
    };
  }

  /** Set one user's plan (the operator today; the billing webhook in P9). */
  async setPlan(caller: AuthUser, userId: string, plan: Plan) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException("User not found");
    const before = await this.readUserPlan(userId);
    const doc = await this.users.findByIdAndUpdate(userId, { $set: { plan } }, { new: true }).exec();
    if (!doc) throw new NotFoundException("User not found");
    // A downgraded plan must not leave in-flight reservations above the new cap
    // stranded; settled usage stands (you can't un-consume a completed job),
    // so only note the delta — no automatic reversal here (admin decides).
    return { id: String(doc._id), plan: doc.plan, before };
  }

  private async readUserPlan(userId: string): Promise<Plan | null> {
    const u = await this.users.findById(userId, { plan: 1 }).lean();
    return (u as User | null)?.plan ?? null;
  }

  /** Per-user + per-feature usage rollup for the current period (admin view). */
  async usageFor(userId: string, featureKey: string): Promise<PeriodUsage[]> {
    const agg = await this.reservations
      .aggregate([
        {
          $match: {
            user: new Types.ObjectId(userId),
            featureKey,
            state: { $in: ["RESERVED", "SETTLED"] },
          },
        },
        { $group: { _id: "$period", used: { $sum: "$amount" } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
      ])
      .exec();
    return agg.map((r) => ({ period: r._id as string, used: r.used as number }));
  }
}
