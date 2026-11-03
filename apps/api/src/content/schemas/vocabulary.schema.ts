import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";
import type { ContentStatus } from "./textbook.schema.js";

export const POS_VALUES = [
  "noun",
  "verb",
  "adjective-i",
  "adjective-na",
  "adverb",
  "particle",
  "conjunction",
  "interjection",
  "aux-verb",
  "other",
] as const;
export type Pos = (typeof POS_VALUES)[number];

/**
 * A vocabulary entry (spec §4.2). Textbook/unit are OPTIONAL references — a
 * term may appear in several books or live as standalone SRS material, so the
 * link is a denormalized id list, not an owner (database.md §2 "vocabulary").
 */
@Schema({ _id: true, timestamps: true })
export class Vocabulary {
  /** The Japanese word or phrase. */
  @Prop({ type: String, trim: true, required: true })
  term: string;

  /** Reading (kana) / furigana, e.g. `しんこう` for `進行`. */
  @Prop({ type: String, trim: true })
  reading?: string;

  /** Vietnamese meaning. `lang` on the *entry* documents which UI lang it
   *  was authored for — the meaning string itself stays a value, not a map
   *  (multi-lang extension is Q-21). */
  @Prop({ type: String, trim: true, required: true })
  meaning: string;

  /** Part of speech (free enum, extensible — spec §4.2). */
  @Prop({ type: String, trim: true, enum: POS_VALUES })
  pos?: Pos;

  /** An example sentence in Japanese. */
  @Prop({ type: String, trim: true })
  example?: string;

  /** Vietnamese translation of the example. */
  @Prop({ type: String, trim: true })
  exampleTranslation?: string;

  /** Where this entry came from (course, textbook, import batch, …). */
  @Prop({ type: String, trim: true })
  source?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  /** Optional textbook/unit linkage (P2-CONTENT-04 filtering). */
  @Prop({ type: [Types.ObjectId], ref: "Textbook" })
  textbooks: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], ref: "Unit" })
  units: Types.ObjectId[];

  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  @Prop({ type: String, default: "PUBLISHED", enum: ["DRAFT", "PUBLISHED"] })
  status: ContentStatus;
}

export type VocabularyDocument = HydratedDocument<Vocabulary>;

export const VocabularySchema = SchemaFactory.createForClass(Vocabulary);
// Public listing: by status (hide drafts) and by a single textbook.
VocabularySchema.index({ status: 1, term: 1 });
VocabularySchema.index({ status: 1, textbooks: 1 });
