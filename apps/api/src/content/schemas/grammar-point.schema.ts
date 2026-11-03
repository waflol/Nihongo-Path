import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import type { ContentStatus } from "./textbook.schema.js";

/**
 * One example attached to a grammar point (an inline subdocument, not a
 * separate collection — a point's examples have no independent lifecycle,
 * spec §4.3 "một điểm ngữ pháp liên kết với nhiều ví dụ và bài tập").
 */
export interface GrammarExample {
  /** Example sentence in Japanese. */
  sentence: string;
  /** Vietnamese translation of the example. */
  translation: string;
  /** Free-form notes on usage, nuance, or a counter-example. */
  note?: string;
}

/**
 * A grammar point (spec §4.3). `examples` is an embedded array carrying the
 * "1 điểm ↔ N ví dụ/bài tập" relationship: every example belongs to exactly
 * one point, and the point's ordering (sortOrder) plus the array index are
 * the only ordering that matters.
 */
@Schema({ _id: true, timestamps: true })
export class GrammarPoint {
  /** Short label, e.g. "は / が", "て形". */
  @Prop({ type: String, trim: true, required: true })
  label: string;

  /** Vietnamese meaning / gist. */
  @Prop({ type: String, trim: true, required: true })
  meaning: string;

  /** Structure / pattern, e.g. `〜V・て + V`. */
  @Prop({ type: String, trim: true })
  structure?: string;

  /** Usage notes in Vietnamese. */
  @Prop({ type: String, trim: true })
  usage?: string;

  /** The "N" side of the 1↔N relationship (P2-CONTENT-03). */
  @Prop({
    type: [
      {
        sentence: { type: String, required: true },
        translation: { type: String, required: true },
        note: { type: String },
      },
    ],
    default: [],
  })
  examples: GrammarExample[];

  /** Free level tag (N5–N1, …) — not hard-coded. */
  @Prop({ type: String, trim: true })
  level?: string;

  /** Free-form grouping, e.g. "basic particles". */
  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [Types.ObjectId], ref: "Textbook" })
  textbooks: Types.ObjectId[];

  @Prop({ type: Number, required: true, default: 0 })
  sortOrder: number;

  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  @Prop({ type: String, default: "PUBLISHED", enum: ["DRAFT", "PUBLISHED"] })
  status: ContentStatus;
}

export type GrammarPointDocument = HydratedDocument<GrammarPoint>;

export const GrammarPointSchema =
  SchemaFactory.createForClass(GrammarPoint);
GrammarPointSchema.index({ status: 1, label: 1 });
