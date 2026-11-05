import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/** An IP that is never blocked (manually or by the rate limiter). */
@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class AllowedIp {
  @Prop({ type: String, required: true })
  ip: string;

  @Prop({ type: String })
  note?: string;

  @Prop({ type: String })
  createdBy?: string;

  createdAt: Date;
}

export type AllowedIpDocument = HydratedDocument<AllowedIp>;

export const AllowedIpSchema = SchemaFactory.createForClass(AllowedIp);
AllowedIpSchema.index({ ip: 1 }, { unique: true });
