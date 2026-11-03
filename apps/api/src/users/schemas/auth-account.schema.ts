import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export const AUTH_PROVIDERS = ["google", "github", "email"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/**
 * One link between a User and an external/local credential source.
 *
 * Unique `(provider, providerAccountId)` guarantees an account can't be
 * linked twice to the same external identity. For `provider: "email"`,
 * `providerAccountId` is the email address (kept unique within that provider
 * as a second index).
 */
@Schema({ _id: true, timestamps: true })
export class AuthAccount {
  @Prop({
    type: String,
    enum: AUTH_PROVIDERS,
    required: true,
  })
  provider: AuthProvider;

  /**
   * The identity on that provider: Google's `sub`, GitHub's numeric id as a
   * string, or the email for the local provider. Never includes secrets.
   */
  @Prop({ type: String, required: true })
  providerAccountId: string;

  @Prop({
    type: Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  })
  user: Types.ObjectId;

  /** Set when the account was created by an admin bootstrap, not by sign-in. */
  @Prop({ type: Boolean, default: false })
  manual?: boolean;
}

export type AuthAccountDocument = HydratedDocument<AuthAccount>;

export const AuthAccountSchema = SchemaFactory.createForClass(AuthAccount);
AuthAccountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
