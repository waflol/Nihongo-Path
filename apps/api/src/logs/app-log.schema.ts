import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { REQUEST_LOG_RETENTION_DAYS } from "./request-log.schema.js";

export const APP_LOG_LEVELS = ["log", "warn", "error"] as const;
export type AppLogLevel = (typeof APP_LOG_LEVELS)[number];

/** An application log line (Nest `Logger`) or an unhandled-exception record. */
@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class AppLog {
  @Prop({ type: String, required: true, enum: APP_LOG_LEVELS })
  level: AppLogLevel;

  @Prop({ type: String })
  context?: string;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: String })
  stack?: string;

  /** Exception class name, e.g. `MongoServerError`. */
  @Prop({ type: String })
  exception?: string;

  @Prop({ type: Number })
  status?: number;

  /** Request that failed, e.g. `POST /flashcards/decks`. */
  @Prop({ type: String })
  request?: string;

  /** Authenticated user id and role, if any. */
  @Prop({ type: String })
  user?: string;

  @Prop({ type: String })
  ip?: string;

  /** Extra detail: HTTP error response body, mongo error code, `cause`, … */
  @Prop({ type: Object })
  details?: Record<string, unknown>;

  createdAt: Date;
}

export type AppLogDocument = HydratedDocument<AppLog>;

export const AppLogSchema = SchemaFactory.createForClass(AppLog);
AppLogSchema.index({ createdAt: -1 });
AppLogSchema.index({ level: 1, createdAt: -1 });
AppLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: REQUEST_LOG_RETENTION_DAYS * 24 * 3600 },
);
