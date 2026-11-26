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

export interface GrammarSense {
  no: number;
  label?: string;
  explanation?: string;
  examples: GrammarExample[];
}

export interface GrammarTextbookRef {
  textbookId: string;
  unitId: string;
  order?: number;
}

export interface GrammarCompare {
  grammarId?: string;
  label: string;
  note?: string;
}

export const GRAMMAR_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type GrammarLevel = (typeof GRAMMAR_LEVELS)[number];

/** Provenance is retained so external content can be audited before publishing. */
export interface GrammarSource {
  provider: string;
  key: string;
  url?: string;
  version?: string;
  hash?: string;
  importedAt?: Date;
}

export const GRAMMAR_CONTEXTS = [
  "hoi-thoai", "cong-ty", "email", "bao-chi", "van-ban", "van-hoc", "phien-dich",
] as const;
export type GrammarContext = (typeof GRAMMAR_CONTEXTS)[number];

export const GRAMMAR_THEMES = [
  "thoi-gian", "nguyen-nhan", "muc-dich", "dieu-kien", "nghich-tiep", "cam-xuc",
  "danh-gia", "so-sanh", "pham-vi", "can-cu", "nhan-manh", "liet-ke", "bo-sung",
  "trang-thai", "suy-doan", "kha-nang", "cho-nhan", "y-chi", "the-thai", "ket-qua",
  "chu-de", "bat-chap",
] as const;
export type GrammarTheme = (typeof GRAMMAR_THEMES)[number];

export function grammarSourceKey(provider: string, key: string): string {
  return `${provider}:${key}`;
}

const grammarExampleSchema = {
  sentence: { type: String, required: true, trim: true },
  translation: { type: String, required: true, trim: true },
  note: { type: String, trim: true },
};

const grammarSenseSchema = {
  no: { type: Number, required: true, min: 1 },
  label: { type: String, trim: true },
  explanation: { type: String, trim: true },
  examples: { type: [grammarExampleSchema], default: [] },
};

const grammarTextbookRefSchema = {
  textbookId: { type: String, required: true, trim: true },
  unitId: { type: String, required: true, trim: true },
  order: { type: Number, min: 0 },
};

const grammarCompareSchema = {
  grammarId: { type: String, trim: true },
  label: { type: String, required: true, trim: true },
  note: { type: String, trim: true },
};

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

  /** Stable external identifier, unique within sourceProvider. */
  @Prop({ type: String, trim: true, index: true })
  sourceKey?: string;

  @Prop({ type: String, trim: true, index: true })
  sourceProvider?: string;

  @Prop({ type: String, trim: true })
  sourceUrl?: string;

  @Prop({ type: String, trim: true })
  sourceVersion?: string;

  @Prop({ type: String, trim: true })
  sourceHash?: string;

  @Prop({ type: Date })
  sourceImportedAt?: Date;

  /** Vietnamese meaning / gist. */
  @Prop({ type: String, trim: true, required: true })
  meaning: string;

  /** Structure / pattern, e.g. `〜V・て + V`. */
  @Prop({ type: String, trim: true })
  structure?: string;

  /** Usage notes in Vietnamese. */
  @Prop({ type: String, trim: true })
  usage?: string;

  @Prop({ type: String, trim: true })
  pattern?: string;

  @Prop({ type: String, trim: true })
  coreExplanation?: string;

  @Prop({ type: [String], default: [] })
  forms: string[];

  @Prop({ type: [String], default: [] })
  explanations: string[];

  @Prop({ type: [grammarSenseSchema], default: [] })
  senses: GrammarSense[];

  /** Usage cautions shown under the explanation. */
  @Prop({ type: [String], default: [] })
  notes: string[];

  /** Set when an admin edits the content; the importer then leaves it alone. */
  @Prop({ type: Date })
  editedAt?: Date;

  /** Same-nuance group inside a level (level browsing). */
  @Prop({ type: Number })
  groupNo?: number;

  @Prop({ type: String, trim: true })
  groupJa?: string;

  @Prop({ type: String, trim: true })
  groupVi?: string;

  @Prop({ type: [String], default: [] })
  themeIds: string[];

  @Prop({ type: [String], default: [] })
  contextIds: string[];

  @Prop({ type: [grammarTextbookRefSchema], default: [] })
  textbookRefs: GrammarTextbookRef[];

  @Prop({ type: [grammarCompareSchema], default: [] })
  compareWith: GrammarCompare[];

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
  @Prop({ type: String, trim: true, index: true })
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
GrammarPointSchema.index({ sourceProvider: 1, sourceKey: 1 }, { unique: true, sparse: true });
// MongoDB forbids a compound index containing two array fields (parallel arrays).
// Keep theme/context indexes separate; queries can still combine both filters.
GrammarPointSchema.index({ status: 1, level: 1, themeIds: 1 });
GrammarPointSchema.index({ status: 1, level: 1, contextIds: 1 });
GrammarPointSchema.index({ status: 1, "textbookRefs.textbookId": 1, "textbookRefs.unitId": 1 });
