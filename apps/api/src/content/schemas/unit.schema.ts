import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import type { ContentStatus } from "./textbook.schema.js";

/**
 * A chapter/lesson within a textbook (spec §9.2). `sortOrder` is the
 * authoritative ordering within its book — lists are returned ordered by it,
 * never by insertion time (stable pagination, P2-CONTENT-04).
 */
@Schema({ _id: true, timestamps: true })
export class Unit {
  @Prop({
    type: Types.ObjectId,
    ref: "Textbook",
    required: true,
    index: true,
  })
  textbook: Types.ObjectId;

  @Prop({ type: String, trim: true, required: true })
  title: string;

  @Prop({ type: String, trim: true })
  summary?: string;

  @Prop({ type: Number, required: true, default: 0 })
  sortOrder: number;

  /** UI language tag (P2-CONTENT-05). */
  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  @Prop({
    type: String,
    default: "DRAFT",
    enum: ["DRAFT", "PUBLISHED"],
  })
  status: ContentStatus;
}

export type UnitDocument = HydratedDocument<Unit>;

export const UnitSchema = SchemaFactory.createForClass(Unit);
// A book's table of contents, in order.
UnitSchema.index({ textbook: 1, sortOrder: 1 });
