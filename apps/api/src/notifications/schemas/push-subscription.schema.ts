import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * One browser/device subscribed to the daily review reminder
 * (docs/plans/plan-pwa.md, P2). A user may have several (phone + laptop).
 *
 * `endpoint` is unique: the same browser re-subscribing (or signing in as
 * another account) updates this document instead of adding a duplicate.
 */
@Schema({ timestamps: true })
export class PushSubscription {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  user: Types.ObjectId;

  /** Push service URL (FCM, Apple, Mozilla, Windows) — validated on write. */
  @Prop({ type: String, required: true, unique: true })
  endpoint: string;

  @Prop({ type: String, required: true })
  p256dh: string;

  @Prop({ type: String, required: true })
  auth: string;

  /** Local hour (0–23) the reminder is sent at, in `timezone`. */
  @Prop({ type: Number, required: true, min: 0, max: 23, default: 20 })
  hour: number;

  /** IANA zone of the device when it subscribed. */
  @Prop({ type: String, required: true })
  timezone: string;

  /** Local `YYYY-MM-DD` of the last reminder pass, so one is sent per day at most. */
  @Prop({ type: String, default: null })
  lastSentDay: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export type PushSubscriptionDocument = HydratedDocument<PushSubscription>;

export const PushSubscriptionSchema = SchemaFactory.createForClass(PushSubscription);
