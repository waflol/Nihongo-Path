import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import type { BenchResult } from "./ai-benchmark.js";

/**
 * An AI service the admin added for example sentences. Services are tried in
 * ascending `priority`; when one cannot take a request the next is used.
 * The API key is stored encrypted (`keyBox`) and never sent back to a client.
 */
@Schema({ collection: "aiservices", timestamps: true })
export class AiServiceConfig {
  /** Preset id from the catalog (`gemini`, `groq`, …). */
  @Prop({ type: String, required: true })
  provider: string;

  @Prop({ type: String, trim: true, required: true })
  label: string;

  /** The provider's model id (not `model`: that clashes with Mongoose's Document#model). */
  @Prop({ type: String, trim: true, required: true })
  modelName: string;

  /** Encrypted API key (`sealSecret`); empty for a keyless local server. */
  @Prop({ type: String, default: "" })
  keyBox: string;

  /** Latest benchmark (accuracy / speed) — see `ai-benchmark.ts`. */
  @Prop({ type: Object })
  bench?: BenchResult;

  /** `custom` only: base URL of the endpoint (validated, no trailing slash). */
  @Prop({ type: String })
  baseUrl?: string;

  /** `custom` only: wire format of the endpoint. */
  @Prop({ type: String, enum: ["openai", "anthropic"] })
  apiFormat?: "openai" | "anthropic";

  /** Last 4 characters, to recognise the key in the admin list. */
  @Prop({ type: String, default: "" })
  keyHint: string;

  @Prop({ type: Number, default: 10, min: 1, max: 600 })
  rpm: number;

  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  /** Lower = tried first. */
  @Prop({ type: Number, default: 0, index: true })
  priority: number;

  /** `ok` | `cooldown` (rate-limited) | `invalid` (key/model rejected) | `error`. */
  @Prop({ type: String, default: "unknown" })
  status: string;

  @Prop({ type: String, default: "" })
  lastError: string;

  @Prop({ type: Date })
  lastOkAt?: Date;

  @Prop({ type: Date })
  cooldownUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type AiServiceDocument = HydratedDocument<AiServiceConfig>;
export const AiServiceSchema = SchemaFactory.createForClass(AiServiceConfig);
