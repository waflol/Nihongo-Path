import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/** Request-log retention (days); older rows are dropped by a TTL index. */
export const REQUEST_LOG_RETENTION_DAYS = 30;

/**
 * One finished HTTP request. Query strings and bodies are deliberately NOT
 * stored (they may carry tokens / passwords — spec §12).
 */
@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class RequestLog {
  @Prop({ type: String, required: true })
  method: string;

  /** Path only, without query string. */
  @Prop({ type: String, required: true })
  path: string;

  @Prop({ type: Number, required: true })
  status: number;

  @Prop({ type: Number, required: true })
  durationMs: number;

  @Prop({ type: Types.ObjectId, ref: "User" })
  user?: Types.ObjectId;

  @Prop({ type: String })
  role?: string;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  /** Error message when the request failed (status >= 400). */
  @Prop({ type: String })
  error?: string;

  createdAt: Date;
}

export type RequestLogDocument = HydratedDocument<RequestLog>;

export const RequestLogSchema = SchemaFactory.createForClass(RequestLog);
RequestLogSchema.index({ createdAt: -1 });
RequestLogSchema.index({ status: 1, createdAt: -1 });
RequestLogSchema.index({ ip: 1, createdAt: -1 });
RequestLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: REQUEST_LOG_RETENTION_DAYS * 24 * 3600 },
);
