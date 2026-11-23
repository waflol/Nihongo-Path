import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/**
 * Learning plans, kept on the `User.plan` axis (spec §6.2: `Role` is the
 * administration axis, `Plan` is the entitlement axis — they never
 * substitute for each other).
 */
export const PLANS = ["FREE", "PRO", "VIP"] as const;
export type Plan = (typeof PLANS)[number];

export const QUOTA_PERIODS = ["DAY", "MONTH"] as const;
export type QuotaPeriod = (typeof QUOTA_PERIODS)[number];

/**
 * What happens when a user exceeds their period limit (P5-QUOTA-06).
 * `BLOCK` = hard limit (429); `ALLOW` = overage is permitted and flagged on
 * the reservation so it can be billed / recorded later. Per-feature config,
 * not a global constant.
 */
export const OVER_LIMIT_POLICIES = ["BLOCK", "ALLOW"] as const;
export type OverLimitPolicy = (typeof OVER_LIMIT_POLICIES)[number];

/** Per-plan limit; `null` = unlimited for that plan. */
export class PlanLimit {
  @Prop({ type: String, enum: PLANS, required: true })
  plan: Plan;

  @Prop({ type: Number, min: 0 })
  limit: number | null;
}

/**
 * A configurable entitlement for one `featureKey` (P5-QUOTA-01): the
 * kill-switch, per-plan limits, the reset period and the IANA zone that
 * anchors "period start". Editing this document changes limits live — no
 * deploy (checklist P5-QUOTA-01 criterion).
 *
 * A missing document means the feature is NOT gated: the guards pass and no
 * reservation is made, so new features work before their config row exists.
 */
@Schema({ _id: true, timestamps: true })
export class FeatureConfig {
  @Prop({ type: String, required: true, unique: true, index: true, trim: true })
  featureKey: string;

  /** Global kill-switch (e.g. an AI provider outage): feature off for all plans. */
  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({ type: [PlanLimit], default: [] })
  limits: PlanLimit[];

  @Prop({ type: String, enum: QUOTA_PERIODS, default: "MONTH" })
  period: QuotaPeriod;

  /** IANA zone for period boundaries (spec §6.2 "timezone reset"). */
  @Prop({ type: String, default: "Asia/Ho_Chi_Minh" })
  tz: string;

  @Prop({ type: String, enum: OVER_LIMIT_POLICIES, default: "BLOCK" })
  overLimit: OverLimitPolicy;

  createdAt: Date;
  updatedAt: Date;
}

export type FeatureConfigDocument = HydratedDocument<FeatureConfig>;
export const FeatureConfigSchema = SchemaFactory.createForClass(FeatureConfig);

/** Convenience accessor: limit of one plan in a config (undefined = no limit row → unlimited). */
export function limitForPlan(doc: Pick<FeatureConfig, "limits"> | null | undefined, plan: string): number | null | undefined {
  if (!doc) return undefined;
  return doc.limits.find((l) => l.plan === plan)?.limit;
}

