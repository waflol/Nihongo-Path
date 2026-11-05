import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import type { Role } from "../../common/roles.js";

export const USER_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * A learner / operator account. `role` is the administration axis (spec §4.1,
 * §6.2) and must never be used as the sole entitlement check. Learning
 * progress is intentionally out of scope here — it lives in per-feature
 * collections from later phases (e.g. `user_card_progress`).
 */
@Schema({ _id: true, timestamps: true })
export class User {
  /** Unique login email; null for OAuth-only accounts that never set one. */
  @Prop({ type: String, trim: true, lowercase: true })
  email?: string;

  @Prop({ type: String, trim: true })
  displayName?: string;

  @Prop({
    type: String,
    default: "USER",
    enum: ["USER", "ADMIN", "SUPER_ADMIN"],
  })
  role: Role;

  /** UI language tag; Vietnamese by default (spec §2.7), extensible. */
  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  /**
   * IANA time zone for SRS day boundaries / due dates (P3-SRS-05, spec §4.4
   * "xử lý timezone, ngày ôn"). The SM-2 scheduler anchors intervals to the
   * user's *local day* in this zone; a profile tz change re-anchors future
   * scheduling (T-P3-05/T-P3-12).
   */
  @Prop({ type: String, default: "Asia/Ho_Chi_Minh" })
  timezone: string;

  /** Max brand-new cards introduced per deck per local day (spread a deck over days). */
  @Prop({ type: Number, default: 20, min: 1, max: 500 })
  newCardsPerDay: number;

  @Prop({ type: String, default: "ACTIVE", enum: USER_STATUSES })
  status: UserStatus;

  /** scrypt password hash (`salt$hash` hex). Null for OAuth-only accounts. */
  @Prop({ type: String })
  passwordHash?: string | null;

  @Prop({ type: [Types.ObjectId], ref: "AuthAccount" })
  authAccounts: Types.ObjectId[];

  // Managed by `@Schema({ timestamps: true })` — declared as plain type-only
  // fields (no `@Prop`) so `UserDocument` is typed for them without
  // redefining the schema paths that `timestamps` already creates.
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);
// Sparse: Google-only accounts (email = null) are not indexed.
UserSchema.index({ email: 1 }, { sparse: true });
