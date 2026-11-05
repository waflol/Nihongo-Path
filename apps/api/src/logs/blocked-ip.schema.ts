import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/** An IP address denied access to the API (manual or auto-blocked flood). */
@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class BlockedIp {
  @Prop({ type: String, required: true })
  ip: string;

  @Prop({ type: String })
  reason?: string;

  /** True when the rate limiter blocked it, false when an admin did. */
  @Prop({ type: Boolean, default: false })
  auto: boolean;

  @Prop({ type: String })
  createdBy?: string;

  /** Block lifts at this time (TTL-deleted); absent = permanent. */
  @Prop({ type: Date })
  expiresAt?: Date;

  createdAt: Date;
}

export type BlockedIpDocument = HydratedDocument<BlockedIp>;

export const BlockedIpSchema = SchemaFactory.createForClass(BlockedIp);
BlockedIpSchema.index({ ip: 1 }, { unique: true });
// Documents without `expiresAt` are never expired by this index.
BlockedIpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
