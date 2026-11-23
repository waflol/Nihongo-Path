import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import type { FeatureConfig } from "./feature-config.schema.js";

/**
 * A single usage record for one `(user, featureKey, period)` slot
 * (P5-QUOTA-02). Reservations are the unit of accounting: a caller reserves
 * capacity *before* running expensive work, then settles on success or
 * releases on failure — so a crashing job never leaks a user's quota.
 */
export type ReservationState = "RESERVED" | "SETTLED" | "RELEASED";

export type ReservationReason =
  | "settled"
  | "job-failed"
  | "job-cancelled"
  | "user-deletion"
  | "admin-reversal";

@Schema({ _id: true, timestamps: true })
export class QuotaReservation {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ type: String, required: true })
  featureKey: string;

  /** Period slot this record counts toward, e.g. `2026-05` / `2026-05-21`. */
  @Prop({ type: String, required: true })
  period: string;

  @Prop({ type: String, default: "RESERVED", enum: ["RESERVED", "SETTLED", "RELEASED"] })
  state: ReservationState;

  /** Why a reservation left the RESERVED state (the only two that count). */
  @Prop({
    type: String,
    enum: ["settled", "job-failed", "job-cancelled", "user-deletion", "admin-reversal"],
  })
  reason?: ReservationReason;

  @Prop({ type: Number, default: 1, min: 1 })
  amount: number;

  createdAt: Date;
  updatedAt: Date;
}

export type QuotaReservationDocument = HydratedDocument<QuotaReservation>;
export const QuotaReservationSchema = SchemaFactory.createForClass(QuotaReservation);

/**
 * Index for the hot path: "how much of this period's quota does this user
 * already use?" — one equality scan on `(user, featureKey, period, state)`.
 * The second index serves admin/aggregate views.
 */
QuotaReservationSchema.index({ user: 1, featureKey: 1, period: 1, state: 1 });
QuotaReservationSchema.index({ createdAt: -1 });

/**
 * A settled usage record, kept for reporting / billing (P5-QUOTA-02). A
 * reservation that reaches `SETTLED` is mirrored here so "what was actually
 * consumed this period" is answerable without scanning reservations.
 */
@Schema({ _id: true, timestamps: true })
export class UsageRecord {
  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  user: Types.ObjectId;

  @Prop({ type: String, required: true })
  featureKey: string;

  @Prop({ type: String, required: true })
  period: string;

  @Prop({ type: Number, default: 1, min: 1 })
  amount: number;

  /** The reservation this record settled from. */
  @Prop({ type: Types.ObjectId, ref: "QuotaReservation", required: true })
  reservation: Types.ObjectId;

  createdAt: Date;
}

export type UsageRecordDocument = HydratedDocument<UsageRecord>;
export const UsageRecordSchema = SchemaFactory.createForClass(UsageRecord);
UsageRecordSchema.index({ user: 1, featureKey: 1, period: 1 });
UsageRecordSchema.index({ createdAt: -1 });

/** Per-user usage rollup for a period (what the admin screen shows). */
export interface PeriodUsage {
  period: string;
  used: number;
}

export type { FeatureConfig };
