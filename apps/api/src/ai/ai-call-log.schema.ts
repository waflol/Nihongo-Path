import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/**
 * Why the call was made: generating examples for cards, an admin test/benchmark,
 * "vocab" = per-word example activity (counts as example generation),
 * "verify" = vocabulary check (reading / Hán Việt / meaning), "ocr" = reading vocabulary from a PDF page, "translate" / "grammar" / "pronounce" =
 * the admin playground.
 */
export const AI_LOG_PURPOSES = ["example", "test", "vocab", "ocr", "translate", "grammar", "pronounce", "verify"] as const;
export type AiLogPurpose = (typeof AI_LOG_PURPOSES)[number];

/**
 * One request to an AI service and what came back (admin "Lịch sử gọi AI").
 * The API key is never stored — only the prompt/body we sent and the answer.
 * Entries expire after 30 days.
 */
@Schema({ collection: "aicalllogs", timestamps: { createdAt: true, updatedAt: false } })
export class AiCallLog {
  @Prop({ type: String, enum: AI_LOG_PURPOSES, default: "example", index: true })
  purpose: AiLogPurpose;

  @Prop({ type: String, default: "", index: true })
  serviceId: string;

  @Prop({ type: String, default: "" })
  serviceLabel: string;

  @Prop({ type: String, default: "" })
  provider: string;

  @Prop({ type: String, default: "" })
  modelName: string;

  /** Endpoint without query string or credentials. */
  @Prop({ type: String, default: "" })
  endpoint: string;

  /** Words / sentences the request was about (for the list summary). */
  @Prop({ type: [String], default: [] })
  words: string[];

  /** Prompt (or request body text) we sent, truncated. */
  @Prop({ type: String, default: "" })
  request: string;

  /** The model's answer, or the error text, truncated. */
  @Prop({ type: String, default: "" })
  response: string;

  @Prop({ type: Boolean, default: false, index: true })
  ok: boolean;

  /** HTTP status when known (0 = network error / timeout). */
  @Prop({ type: Number, default: 0 })
  status: number;

  @Prop({ type: Number, default: 0 })
  ms: number;

  @Prop({ type: Date, expires: 60 * 60 * 24 * 30, index: true })
  createdAt: Date;
}

export type AiCallLogDocument = HydratedDocument<AiCallLog>;
export const AiCallLogSchema = SchemaFactory.createForClass(AiCallLog);
AiCallLogSchema.index({ createdAt: -1 });
