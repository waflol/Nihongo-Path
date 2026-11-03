import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * A course book / textbook (spec §4, §9.2). Owned by admin, read publicly
 * when published. `level` is a free tag (N5–N1, or course-specific) — the
 * schema never hard-codes a single level set (spec §2.7, P2-CONTENT-05).
 */
@Schema({ _id: true, timestamps: true })
export class Textbook {
  @Prop({ type: String, trim: true, required: true })
  title: string;

  @Prop({ type: String, trim: true })
  subtitle?: string;

  @Prop({ type: String, trim: true })
  author?: string;

  /** e.g. "N5", "N4", or a course-specific group; free-form, extensible. */
  @Prop({ type: String, trim: true })
  level?: string;

  /** UI language tag (default Vietnamese, extensible — P2-CONTENT-05). */
  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  @Prop({
    type: String,
    default: "DRAFT",
    enum: CONTENT_STATUSES,
  })
  status: ContentStatus;
}

export type TextbookDocument = HydratedDocument<Textbook>;

export const TextbookSchema = SchemaFactory.createForClass(Textbook);
// Public listing filters: by status and/or level (P2-CONTENT-04).
TextbookSchema.index({ status: 1, level: 1 });
