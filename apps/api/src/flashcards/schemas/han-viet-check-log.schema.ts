import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

/** One card whose Hán Việt a deck check rewrote. */
export class HanVietChange {
  /** STT: the card's position in the source list. */
  @Prop({ type: Number }) stt: number;
  @Prop({ type: String, default: "" }) word: string;
  @Prop({ type: String, default: "" }) oldHanViet: string;
  @Prop({ type: String, default: "" }) newHanViet: string;
}

/** The latest Hán Việt check of a deck (one document per deck, replaced on every run). */
@Schema({ timestamps: true })
export class HanVietCheckLog {
  @Prop({ type: Types.ObjectId, ref: "FlashcardDeck", required: true, unique: true })
  deck: Types.ObjectId;

  @Prop({ type: String, default: "" }) deckTitle: string;
  @Prop({ type: Number, default: 0 }) startedAt: number;
  @Prop({ type: Number }) finishedAt?: number;
  @Prop({ type: Number, default: 0 }) total: number;
  @Prop({ type: Boolean, default: false }) finished: boolean;
  @Prop({ type: [{ stt: Number, word: String, oldHanViet: String, newHanViet: String, _id: false }], default: [] })
  changes: HanVietChange[];
}

export type HanVietCheckLogDocument = HydratedDocument<HanVietCheckLog>;
export const HanVietCheckLogSchema = SchemaFactory.createForClass(HanVietCheckLog);
