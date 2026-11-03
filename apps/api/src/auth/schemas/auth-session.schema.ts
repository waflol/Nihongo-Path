import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/**
 * A refresh-token session (P2-AUTH-03, ADR-auth-provider).
 *
 * `token` is an opaque, randomly generated 128-bit value (hex) — NOT a JWT.
 * The unique index guarantees at most one live row per token. Rotation: each
 * `/auth/refresh` revokes the presented token and mints a fresh row. Logout
 * revokes the current session so a presented refresh token can no longer be
 * replayed (T-P2-10).
 */
@Schema({ _id: true, timestamps: true })
export class AuthSession {
  @Prop({ type: String, required: true })
  token: string;

  @Prop({
    type: Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  })
  user: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  /** Set when the session is revoked (rotation or logout); token becomes stale. */
  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ type: String })
  userAgent?: string;
}

export type AuthSessionDocument = HydratedDocument<AuthSession>;

export const AuthSessionSchema =
  SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ token: 1 }, { unique: true });
AuthSessionSchema.index({ user: 1, expiresAt: 1 });
// TTL-ish cleanup of expired, unreferenced sessions (retention, spec §12).
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
