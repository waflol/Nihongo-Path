import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/**
 * A successful AI answer for one task, kept so the same word / sentence is
 * never sent to an AI service twice (another deck, a retry, a restart, a
 * cleared card…). The key is a fingerprint of the task, see `taskKey`.
 */
@Schema({ collection: "airesultcache", timestamps: { createdAt: true, updatedAt: false } })
export class AiResultCache {
  @Prop({ type: String, required: true, unique: true })
  key: string;

  @Prop({ type: String })
  ja?: string;

  @Prop({ type: String, required: true })
  vi: string;

  @Prop({ type: Boolean })
  matches?: boolean;

  /** The word the task was about (provenance / admin display). */
  @Prop({ type: String })
  term?: string;

  @Prop({ type: String })
  kind?: string;

  /** Service that produced it (provenance only). */
  @Prop({ type: String, default: "" })
  serviceLabel: string;

  createdAt: Date;
}

export type AiResultCacheDocument = HydratedDocument<AiResultCache>;
export const AiResultCacheSchema = SchemaFactory.createForClass(AiResultCache);
