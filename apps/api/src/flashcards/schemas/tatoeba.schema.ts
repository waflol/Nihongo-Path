import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";

/**
 * One Tatoeba Japanese sentence that has a Vietnamese translation (CC BY 2.0
 * FR, Tatoeba contributors). Filled by `scripts/import-tatoeba.mjs`; read by
 * the example-sentence suggester so a lookup is one indexed query instead of
 * several slow HTTP calls. `tokens` = the sentence's dictionary forms.
 */
@Schema({ collection: "tatoebasentences", _id: false, versionKey: false })
export class TatoebaSentence {
  @Prop({ type: Number, required: true })
  _id: number;

  @Prop({ type: String, required: true })
  ja: string;

  /** Human Vietnamese translation, when Tatoeba has one (~6k sentences). */
  @Prop({ type: String })
  vi?: string;

  @Prop({ type: Boolean, default: false })
  hasVi: boolean;

  @Prop({ type: [String], index: true, default: [] })
  tokens: string[];
}

export type TatoebaSentenceDocument = HydratedDocument<TatoebaSentence>;
export const TatoebaSentenceSchema = SchemaFactory.createForClass(TatoebaSentence);
