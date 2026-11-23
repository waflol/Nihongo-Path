import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import { REQUEST_LOG_RETENTION_DAYS } from "./request-log.schema.js";

/** Audit retention: longer than request logs (1 year). */
export const AUDIT_RETENTION_DAYS = Math.max(REQUEST_LOG_RETENTION_DAYS, 365);

/** One state-changing action by an admin (who / what / when / outcome). */
@Schema({ _id: true, timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: "User", index: true })
  actor?: Types.ObjectId;

  @Prop({ type: String })
  role?: string;

  @Prop({ type: String, required: true })
  method: string;

  @Prop({ type: String, required: true })
  path: string;

  @Prop({ type: Boolean, required: true })
  ok: boolean;

  /** HTTP status when the action failed. */
  @Prop({ type: Number })
  status?: number;

  @Prop({ type: String })
  ip?: string;

  /** Client-reported public IPv4 (spoofable; display only). */
  @Prop({ type: String })
  ipv4?: string;

  /** Request body (secrets redacted, size-capped). */
  @Prop({ type: Object })
  body?: Record<string, unknown>;

  /**
   * Target document's field values BEFORE the mutation (P5-ADMIN-03).
   * Recorded by the service that knows the target, not by the interceptor
   * (which cannot see DB state) — see `attachAuditNote` in `audit-note.ts`.
   */
  @Prop({ type: Object })
  before?: Record<string, unknown>;

  /** The values AFTER the mutation; same rules as `before`. */
  @Prop({ type: Object })
  after?: Record<string, unknown>;

  /** Human-readable summary of the change (e.g. `role: USER → ADMIN`). */
  @Prop({ type: String })
  summary?: string;

  createdAt: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 3600 },
);
