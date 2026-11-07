import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import type { ContentStatus } from "./textbook.schema.js";

/** A real dictionary word that uses the kanji (JMdict, CC BY-SA). */
export interface RelatedWord {
  term: string;
  reading: string;
  /** Vietnamese meaning; empty until AI/admin fills it. */
  meaning: string;
  glossEn?: string;
  chars: string[];
  level?: string;
}

/**
 * One kanji (docs/plans/plan-kanji.md §3). `char` is the natural unique key.
 * `strokes` holds KanjiVG path data **verbatim** (CC BY-SA 3.0): never
 * transform `d` here — scale/animate at render time only (plan §10.3).
 * No WaniKani (`wk_*`) fields may ever be added (plan §2.1).
 */
@Schema({ collection: "kanjis", timestamps: true })
export class Kanji {
  @Prop({ type: String, required: true, trim: true })
  char: string;

  /** "N5".."N1" or "" — free string like Textbook.level. */
  @Prop({ type: String, trim: true, default: "" })
  level: string;

  /** 1-based learning order over the 2136 Jōyō kanji; 0 = out of scope. */
  @Prop({ type: Number, default: 0 })
  rank: number;

  @Prop({ type: String, trim: true, default: "" })
  hanViet: string;

  /** Accent-stripped lowercase `hanViet`; computed server-side only. */
  @Prop({ type: String, default: "" })
  hanVietNorm: string;

  @Prop({ type: [String], default: [] })
  onyomi: string[];

  /** Dictionary style with okurigana dot, e.g. "まな.ぶ". */
  @Prop({ type: [String], default: [] })
  kunyomi: string[];

  @Prop({ type: Number, default: 0 })
  strokeCount: number;

  @Prop({ type: [String], default: [] })
  strokes: string[];

  /** Vietnamese meanings (empty until translated). */
  @Prop({ type: [String], default: [] })
  meanings: string[];

  @Prop({ type: [String], default: [] })
  meaningsEn: string[];

  @Prop({ type: String, default: "" })
  mnemonic: string;

  @Prop({
    type: [
      {
        term: { type: String, required: true },
        reading: { type: String, default: "" },
        meaning: { type: String, default: "" },
        glossEn: { type: String },
        chars: { type: [String], default: [] },
        level: { type: String },
      },
    ],
    default: [],
    _id: false,
  })
  words: RelatedWord[];

  @Prop({ type: [String], default: [] })
  radicals: string[];

  @Prop({ type: String, default: "admin" })
  source: string;

  @Prop({ type: String, default: "" })
  strokeCredit: string;

  @Prop({ type: String, default: "vi", lowercase: true })
  lang: string;

  @Prop({ type: String, default: "DRAFT", enum: ["DRAFT", "PUBLISHED"] })
  status: ContentStatus;
}

export type KanjiDocument = HydratedDocument<Kanji>;

export const KanjiSchema = SchemaFactory.createForClass(Kanji);
KanjiSchema.index({ char: 1 }, { unique: true });
KanjiSchema.index({ status: 1, level: 1, rank: 1 });
KanjiSchema.index({ status: 1, hanVietNorm: 1 });
